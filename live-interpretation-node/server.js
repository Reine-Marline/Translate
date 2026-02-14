const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const HTTPS_PORT = Number(process.env.PORT || process.env.HTTPS_PORT || 3000);
const HTTP_REDIRECT_PORT = Number(process.env.HTTP_REDIRECT_PORT || 3080);
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', 'server-key.pem');
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'server-cert.pem');

const app = express();

function loadTlsCredentials() {
  if (!fs.existsSync(SSL_KEY_PATH) || !fs.existsSync(SSL_CERT_PATH)) {
    console.error('Certificats TLS introuvables.');
    console.error(`- Cle privee attendue: ${SSL_KEY_PATH}`);
    console.error(`- Certificat attendu: ${SSL_CERT_PATH}`);
    console.error('Consultez README.md (section HTTPS LAN) pour generer des certificats.');
    process.exit(1);
  }

  return {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH)
  };
}

const tlsCredentials = loadTlsCredentials();
const httpsServer = https.createServer(tlsCredentials, app);
const httpRedirectServer = http.createServer((req, res) => {
  const hostHeader = req.headers.host || '';
  const host = hostHeader.split(':')[0] || 'localhost';
  const target = `https://${host}:${HTTPS_PORT}${req.url || '/'}`;
  res.writeHead(301, { Location: target });
  res.end();
});

const io = new Server(httpsServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  perMessageDeflate: false
});

/**
 * Etat en memoire par langue.
 * - interpreterId: socket.id de l'interprete (1 seul par langue)
 * - interpreterStreaming: true si micro actif
 * - listeners: set des socket.id auditeurs
 * - waitingListeners: subset des auditeurs connectes avant interpretation active
 */
const languageState = new Map();

function getOrCreateLanguageState(language) {
  if (!languageState.has(language)) {
    languageState.set(language, {
      interpreterId: null,
      interpreterStreaming: false,
      listeners: new Set(),
      waitingListeners: new Set()
    });
  }
  return languageState.get(language);
}

function removeLanguageIfEmpty(language) {
  const state = languageState.get(language);
  if (!state) return;
  if (!state.interpreterId && state.listeners.size === 0) {
    languageState.delete(language);
  }
}

function sanitizeLanguage(language) {
  if (typeof language !== 'string') return '';
  return language.trim().toLowerCase();
}

function getLanguageSummary(language) {
  const state = getOrCreateLanguageState(language);
  return {
    language,
    interpreterConnected: Boolean(state.interpreterId),
    interpreterStreaming: Boolean(state.interpreterStreaming),
    listenersCount: state.listeners.size,
    waitingListenersCount: state.waitingListeners.size
  };
}

function emitLanguageState(language) {
  io.to(`lang:${language}`).emit('language_state_update', getLanguageSummary(language));
}

function getServerIPv4Candidates() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  Object.values(interfaces).forEach((entries) => {
    if (!entries) return;
    entries.forEach((entry) => {
      if (entry.family === 'IPv4' && !entry.internal) {
        ips.push(entry.address);
      }
    });
  });

  return ips;
}

function buildAbsoluteUrl(req, pathname) {
  const hostHeader = req.headers.host || `localhost:${HTTPS_PORT}`;
  const host = hostHeader.split(':')[0] || 'localhost';
  return `https://${host}:${HTTPS_PORT}${pathname}`;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/qr/:role', async (req, res) => {
  try {
    const role = req.params.role;
    if (!['interpreter', 'listener'].includes(role)) {
      res.status(400).json({ error: 'Role invalide' });
      return;
    }

    const targetPath = role === 'interpreter' ? '/interpreter.html' : '/listener.html';
    const targetUrl = buildAbsoluteUrl(req, targetPath);

    const pngBuffer = await QRCode.toBuffer(targetUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 360
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(pngBuffer);
  } catch (error) {
    res.status(500).json({ error: 'Generation QR impossible' });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  socket.data.role = null;
  socket.data.language = null;

  socket.on('join_role', (payload = {}) => {
    try {
      const role = payload.role;
      const language = sanitizeLanguage(payload.language);

      if (!['interpreter', 'listener'].includes(role)) {
        socket.emit('error_notification', {
          code: 'INVALID_ROLE',
          message: 'Role invalide. Utilisez interpreter ou listener.'
        });
        return;
      }

      if (!language) {
        socket.emit('error_notification', {
          code: 'INVALID_LANGUAGE',
          message: 'Langue invalide.'
        });
        return;
      }

      leaveCurrentAssignment(socket);

      socket.data.role = role;
      socket.data.language = language;

      const state = getOrCreateLanguageState(language);
      socket.join(`lang:${language}`);

      if (role === 'interpreter') {
        if (state.interpreterId && state.interpreterId !== socket.id) {
          const oldInterpreterSocket = io.sockets.sockets.get(state.interpreterId);
          if (oldInterpreterSocket) {
            oldInterpreterSocket.emit('status_notification', {
              level: 'warning',
              message: 'Un autre interprete a pris cette langue. Votre session est arretee.'
            });
            oldInterpreterSocket.disconnect(true);
          }
        }

        state.interpreterId = socket.id;
        state.interpreterStreaming = false;

        if (state.listeners.size === 0) {
          socket.emit('status_notification', {
            level: 'info',
            message: 'Aucun auditeur pour l\'instant - notification automatique a la prochaine connexion.'
          });
        } else {
          socket.emit('status_notification', {
            level: 'success',
            message: `${state.listeners.size} auditeur(s) connecte(s). Activez le micro.`
          });

          for (const listenerId of state.waitingListeners) {
            const listenerSocket = io.sockets.sockets.get(listenerId);
            if (listenerSocket) {
              listenerSocket.emit('status_notification', {
                level: 'success',
                message: 'Interprete connecte. Le flux audio va demarrer.'
              });
            }
          }
          state.waitingListeners.clear();
        }
      }

      if (role === 'listener') {
        state.listeners.add(socket.id);

        if (!state.interpreterId) {
          state.waitingListeners.add(socket.id);
          socket.emit('status_notification', {
            level: 'warning',
            message: 'Interprete pas encore disponible - veuillez patienter.'
          });
        } else {
          socket.emit('status_notification', {
            level: 'success',
            message: state.interpreterStreaming
              ? 'Interprete disponible. Connexion audio en cours...'
              : 'Interprete disponible. En attente du demarrage micro...'
          });

          const interpreterSocket = io.sockets.sockets.get(state.interpreterId);
          if (interpreterSocket) {
            interpreterSocket.emit('listener_connected', {
              listenerId: socket.id,
              language,
              listenersCount: state.listeners.size,
              message: 'Nouvel auditeur connecte.'
            });

            if (state.interpreterStreaming) {
              interpreterSocket.emit('webrtc_offer_needed', { listenerId: socket.id });
            }
          }
        }
      }

      emitLanguageState(language);
    } catch (error) {
      socket.emit('error_notification', {
        code: 'JOIN_FAILED',
        message: 'Erreur lors de l\'inscription au role.'
      });
      console.error('join_role error:', error);
    }
  });

  socket.on('interpreter_stream_state', (payload = {}) => {
    const { role, language } = socket.data;
    if (role !== 'interpreter' || !language) return;

    const state = languageState.get(language);
    if (!state || state.interpreterId !== socket.id) return;

    state.interpreterStreaming = Boolean(payload.streaming);

    socket.to(`lang:${language}`).emit('interpreter_stream_state', {
      streaming: state.interpreterStreaming,
      language
    });

    if (state.interpreterStreaming) {
      for (const listenerId of state.listeners) {
        socket.emit('webrtc_offer_needed', { listenerId });
      }
    }

    emitLanguageState(language);
  });

  socket.on('webrtc_signal', (payload = {}) => {
    const fromRole = socket.data.role;
    const fromLanguage = socket.data.language;
    if (!fromRole || !fromLanguage) return;

    const targetId = payload.to;
    const type = payload.type;
    if (!targetId || !['offer', 'answer', 'candidate'].includes(type)) return;

    const targetSocket = io.sockets.sockets.get(targetId);
    if (!targetSocket) return;

    const targetLanguage = targetSocket.data.language;
    if (!targetLanguage || targetLanguage !== fromLanguage) return;

    const toRole = targetSocket.data.role;
    const rolePairValid =
      (fromRole === 'interpreter' && toRole === 'listener') ||
      (fromRole === 'listener' && toRole === 'interpreter');

    if (!rolePairValid) return;

    targetSocket.emit('webrtc_signal', {
      from: socket.id,
      type,
      sdp: payload.sdp,
      candidate: payload.candidate
    });
  });

  socket.on('disconnect', () => {
    leaveCurrentAssignment(socket);
  });
});

function leaveCurrentAssignment(socket) {
  const role = socket.data.role;
  const language = socket.data.language;

  if (!role || !language) return;

  const state = languageState.get(language);
  if (!state) {
    socket.data.role = null;
    socket.data.language = null;
    return;
  }

  if (role === 'interpreter' && state.interpreterId === socket.id) {
    state.interpreterId = null;
    state.interpreterStreaming = false;

    socket.to(`lang:${language}`).emit('interpreter_stream_state', {
      streaming: false,
      language
    });

    for (const listenerId of state.listeners) {
      const listenerSocket = io.sockets.sockets.get(listenerId);
      if (listenerSocket) {
        state.waitingListeners.add(listenerId);
        listenerSocket.emit('status_notification', {
          level: 'warning',
          message: 'Interprete deconnecte. Veuillez patienter...'
        });
      }
    }
  }

  if (role === 'listener') {
    state.listeners.delete(socket.id);
    state.waitingListeners.delete(socket.id);

    if (state.interpreterId) {
      const interpreterSocket = io.sockets.sockets.get(state.interpreterId);
      if (interpreterSocket) {
        interpreterSocket.emit('listener_disconnected', {
          listenerId: socket.id,
          language,
          listenersCount: state.listeners.size,
          message: 'Un auditeur s\'est deconnecte.'
        });
      }
    }
  }

  emitLanguageState(language);
  removeLanguageIfEmpty(language);

  socket.leave(`lang:${language}`);
  socket.data.role = null;
  socket.data.language = null;
}

httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
  const ips = getServerIPv4Candidates();
  console.log(`Serveur HTTPS demarre sur le port ${HTTPS_PORT}`);
  console.log(`Acces local securise: https://localhost:${HTTPS_PORT}`);
  if (ips.length) {
    console.log('Acces LAN securise possible via:');
    ips.forEach((ip) => console.log(`- https://${ip}:${HTTPS_PORT}`));
  }
});

httpRedirectServer.listen(HTTP_REDIRECT_PORT, '0.0.0.0', () => {
  const ips = getServerIPv4Candidates();
  console.log(`Redirection HTTP active sur le port ${HTTP_REDIRECT_PORT}`);
  console.log(`- http://localhost:${HTTP_REDIRECT_PORT} -> https://localhost:${HTTPS_PORT}`);
  if (ips.length) {
    ips.forEach((ip) => {
      console.log(`- http://${ip}:${HTTP_REDIRECT_PORT} -> https://${ip}:${HTTPS_PORT}`);
    });
  }
});
