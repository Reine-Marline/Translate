const socket = makeSocket();

const languageSelect = document.getElementById('languageSelect');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const statusBanner = document.getElementById('statusBanner');
const currentLanguageEl = document.getElementById('currentLanguage');
const interpreterStateEl = document.getElementById('interpreterState');
const listenersCountEl = document.getElementById('listenersCount');
const liveAudio = document.getElementById('liveAudio');

let currentLanguage = null;
let joined = false;
let interpreterId = null;
let peerConnection = null;
let pendingCandidates = [];

if (!isWebRTCSupported()) {
  joinBtn.disabled = true;
  leaveBtn.disabled = true;
  setBanner(
    statusBanner,
    'error',
    'Navigateur non supporte pour WebRTC. Utilisez Samsung Internet recent, Chrome, Edge, Firefox ou Safari.'
  );
}

function closePeerConnection() {
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch (_error) {
      // no-op
    }
  }
  peerConnection = null;
  interpreterId = null;
  pendingCandidates = [];
}

function ensureAudioPlayback() {
  liveAudio.play().catch(() => {
    // Certains navigateurs mobiles exigent une interaction utilisateur.
  });
}

async function flushPendingCandidates() {
  if (!peerConnection || !peerConnection.remoteDescription || pendingCandidates.length === 0) {
    return;
  }

  const candidates = [...pendingCandidates];
  pendingCandidates = [];
  for (const candidate of candidates) {
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to add pending candidate:', error);
    }
  }
}

function createListenerPeerConnection(targetInterpreterId) {
  closePeerConnection();
  interpreterId = targetInterpreterId;

  peerConnection = createPeerConnection(buildRtcConfig());

  peerConnection.ontrack = (event) => {
    if (!event.streams || !event.streams[0]) return;

    liveAudio.srcObject = event.streams[0];
    ensureAudioPlayback();
    setBanner(statusBanner, 'success', 'Audio en direct recu.');
  };

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !interpreterId) return;

    socket.emit('webrtc_signal', {
      to: interpreterId,
      type: 'candidate',
      candidate: event.candidate
    });
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;

    if (state === 'connected') {
      setBanner(statusBanner, 'success', 'Connexion audio stable.');
    }

    if (['disconnected', 'failed', 'closed'].includes(state)) {
      setBanner(statusBanner, 'warning', 'Connexion audio interrompue. En attente de reprise...');
    }
  };

  return peerConnection;
}

joinBtn.addEventListener('click', () => {
  currentLanguage = languageSelect.value;
  joined = true;

  currentLanguageEl.textContent = currentLanguage;
  liveAudio.muted = false;
  ensureAudioPlayback();

  socket.emit('join_role', { role: 'listener', language: currentLanguage });

  joinBtn.disabled = true;
  leaveBtn.disabled = false;
  setBanner(statusBanner, 'info', 'Connexion en tant que visiteur...');
});

leaveBtn.addEventListener('click', () => {
  joined = false;
  currentLanguage = null;

  closePeerConnection();
  liveAudio.srcObject = null;

  socket.disconnect();
  socket.connect();

  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  interpreterStateEl.textContent = 'Non connecte';
  listenersCountEl.textContent = '0';
  currentLanguageEl.textContent = '-';
  setBanner(statusBanner, 'info', 'Vous avez quitte l\'ecoute.');
});

socket.on('webrtc_signal', async ({ from, type, sdp, candidate }) => {
  if (!joined) return;

  try {
    if (type === 'offer' && sdp) {
      const pc = createListenerPeerConnection(from);

      await pc.setRemoteDescription(createSessionDescription({ type: 'offer', sdp }));
      await flushPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc_signal', {
        to: from,
        type: 'answer',
        sdp: answer.sdp
      });
      return;
    }

    if (type === 'candidate' && candidate) {
      const normalizedCandidate = createIceCandidate(candidate);
      if (!peerConnection || !peerConnection.remoteDescription) {
        pendingCandidates.push(normalizedCandidate);
      } else {
        await peerConnection.addIceCandidate(normalizedCandidate);
      }
    }
  } catch (error) {
    console.error('Failed to process webrtc signal:', error);
    setBanner(statusBanner, 'error', 'Erreur de connexion audio WebRTC.');
  }
});

socket.on('interpreter_stream_state', ({ streaming }) => {
  if (!joined) return;

  if (streaming) {
    setBanner(statusBanner, 'success', 'Interprete en diffusion. Connexion audio en cours...');
  } else {
    closePeerConnection();
    liveAudio.srcObject = null;
    setBanner(statusBanner, 'warning', 'Interprete connecte mais micro arrete.');
  }
});

socket.on('language_state_update', (state) => {
  if (!joined || !currentLanguage || state.language !== currentLanguage) return;

  interpreterStateEl.textContent = state.interpreterConnected ? 'Connecte' : 'Non connecte';
  listenersCountEl.textContent = String(state.listenersCount);
});

socket.on('status_notification', ({ level = 'info', message }) => {
  setBanner(statusBanner, level, message);
});

socket.on('error_notification', ({ message }) => {
  setBanner(statusBanner, 'error', message || 'Erreur serveur.');
});

socket.on('disconnect', () => {
  setBanner(statusBanner, 'warning', 'Connexion serveur perdue. Reconnexion...');
});

socket.on('connect', () => {
  if (joined && currentLanguage) {
    socket.emit('join_role', { role: 'listener', language: currentLanguage });
    setBanner(statusBanner, 'success', 'Reconnecte au serveur.');
  }
});
