const socket = makeSocket();

const languageSelect = document.getElementById('languageSelect');
const joinBtn = document.getElementById('joinBtn');
const startMicBtn = document.getElementById('startMicBtn');
const stopMicBtn = document.getElementById('stopMicBtn');
const statusBanner = document.getElementById('statusBanner');
const currentLanguageEl = document.getElementById('currentLanguage');
const listenersCountEl = document.getElementById('listenersCount');
const waitingCountEl = document.getElementById('waitingCount');
const streamStateEl = document.getElementById('streamState');

let currentLanguage = null;
let mediaStream = null;
let isStreaming = false;
let joined = false;

// 1 PeerConnection par auditeur connecte.
const peerConnections = new Map();

if (!isWebRTCSupported()) {
  joinBtn.disabled = true;
  startMicBtn.disabled = true;
  stopMicBtn.disabled = true;
  setBanner(
    statusBanner,
    'error',
    'Navigateur non supporte pour WebRTC. Utilisez Samsung Internet recent, Chrome, Edge, Firefox ou Safari.'
  );
}

joinBtn.addEventListener('click', () => {
  currentLanguage = languageSelect.value;
  joined = true;
  socket.emit('join_role', { role: 'interpreter', language: currentLanguage });
  currentLanguageEl.textContent = currentLanguage;

  startMicBtn.disabled = false;
  stopMicBtn.disabled = true;
  setBanner(statusBanner, 'info', 'Connecte en tant qu\'interprete.');
});

startMicBtn.addEventListener('click', startStreaming);
stopMicBtn.addEventListener('click', stopStreaming);

async function startStreaming() {
  if (!joined || !currentLanguage) {
    setBanner(statusBanner, 'warning', 'Connectez-vous d\'abord a une langue.');
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 48000,
        sampleSize: 16,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        latency: 0
      },
      video: false
    });

    const audioTrack = mediaStream.getAudioTracks()[0];
    if (audioTrack && 'contentHint' in audioTrack) {
      audioTrack.contentHint = 'speech';
    }

    isStreaming = true;
    streamStateEl.textContent = 'En cours';

    startMicBtn.disabled = true;
    stopMicBtn.disabled = false;

    socket.emit('interpreter_stream_state', { streaming: true });
    setBanner(statusBanner, 'success', 'Micro demarre. Diffusion WebRTC en cours.');
  } catch (error) {
    console.error('Micro access error:', error);
    setBanner(
      statusBanner,
      'error',
      'Impossible d\'acceder au micro. Verifiez HTTPS, permissions navigateur et certificat sur le telephone.'
    );
  }
}

function stopStreaming() {
  isStreaming = false;

  for (const pc of peerConnections.values()) {
    try {
      pc.close();
    } catch (_error) {
      // no-op
    }
  }
  peerConnections.clear();

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  streamStateEl.textContent = 'Arrete';
  if (joined) {
    startMicBtn.disabled = false;
  }
  stopMicBtn.disabled = true;

  socket.emit('interpreter_stream_state', { streaming: false });
  setBanner(statusBanner, 'warning', 'Micro arrete.');
}

function flushPendingCandidates(pc) {
  if (!pc._pendingCandidates || !pc._pendingCandidates.length) return;
  const pending = [...pc._pendingCandidates];
  pc._pendingCandidates = [];

  pending.forEach(async (candidate) => {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to add pending candidate:', error);
    }
  });
}

async function createOfferForListener(listenerId) {
  if (!isStreaming || !mediaStream) return;

  if (peerConnections.has(listenerId)) {
    const oldPc = peerConnections.get(listenerId);
    try {
      oldPc.close();
    } catch (_error) {
      // no-op
    }
    peerConnections.delete(listenerId);
  }

  const pc = createPeerConnection(buildRtcConfig());
  pc._pendingCandidates = [];
  peerConnections.set(listenerId, pc);

  mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    socket.emit('webrtc_signal', {
      to: listenerId,
      type: 'candidate',
      candidate: event.candidate
    });
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (['failed', 'disconnected', 'closed'].includes(state)) {
      try {
        pc.close();
      } catch (_error) {
        // no-op
      }
      peerConnections.delete(listenerId);
    }
  };

  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: false,
      voiceActivityDetection: true
    });
    await pc.setLocalDescription(offer);

    socket.emit('webrtc_signal', {
      to: listenerId,
      type: 'offer',
      sdp: offer.sdp
    });
  } catch (error) {
    console.error('Offer creation failed:', error);
    setBanner(statusBanner, 'error', 'Impossible de creer la connexion audio avec un auditeur.');
  }
}

socket.on('webrtc_offer_needed', async ({ listenerId }) => {
  if (!listenerId) return;
  await createOfferForListener(listenerId);
});

socket.on('webrtc_signal', async ({ from, type, sdp, candidate }) => {
  const pc = peerConnections.get(from);
  if (!pc) return;

  try {
    if (type === 'answer' && sdp) {
      await pc.setRemoteDescription(createSessionDescription({ type: 'answer', sdp }));
      flushPendingCandidates(pc);
      return;
    }

    if (type === 'candidate' && candidate) {
      const normalizedCandidate = createIceCandidate(candidate);
      if (!pc.remoteDescription) {
        pc._pendingCandidates.push(normalizedCandidate);
      } else {
        await pc.addIceCandidate(normalizedCandidate);
      }
    }
  } catch (error) {
    console.error('Failed to process webrtc_signal:', error);
  }
});

socket.on('language_state_update', (state) => {
  if (!currentLanguage || state.language !== currentLanguage) return;
  listenersCountEl.textContent = String(state.listenersCount);
  waitingCountEl.textContent = String(state.waitingListenersCount);
});

socket.on('status_notification', ({ level = 'info', message }) => {
  setBanner(statusBanner, level, message);
});

socket.on('listener_connected', ({ message, listenersCount }) => {
  listenersCountEl.textContent = String(listenersCount);
  setBanner(statusBanner, 'success', message || 'Nouvel auditeur connecte.');
});

socket.on('listener_disconnected', ({ listenerId, message, listenersCount }) => {
  listenersCountEl.textContent = String(listenersCount);

  if (listenerId && peerConnections.has(listenerId)) {
    const pc = peerConnections.get(listenerId);
    try {
      pc.close();
    } catch (_error) {
      // no-op
    }
    peerConnections.delete(listenerId);
  }

  setBanner(statusBanner, 'info', message || 'Un auditeur a quitte.');
});

socket.on('error_notification', ({ message }) => {
  setBanner(statusBanner, 'error', message || 'Erreur serveur.');
});

socket.on('disconnect', () => {
  setBanner(statusBanner, 'warning', 'Connexion serveur perdue. Reconnexion...');
});

socket.on('connect', () => {
  if (joined && currentLanguage) {
    socket.emit('join_role', { role: 'interpreter', language: currentLanguage });

    if (isStreaming) {
      socket.emit('interpreter_stream_state', { streaming: true });
    }

    setBanner(statusBanner, 'success', 'Reconnecte au serveur.');
  }
});

window.addEventListener('beforeunload', () => {
  stopStreaming();
});
