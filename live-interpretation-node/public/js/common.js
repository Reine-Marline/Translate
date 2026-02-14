function setBanner(bannerEl, level, message) {
  if (!bannerEl) return;

  bannerEl.className = 'banner';
  if (level === 'success') bannerEl.classList.add('banner-success');
  else if (level === 'warning') bannerEl.classList.add('banner-warning');
  else if (level === 'error') bannerEl.classList.add('banner-error');
  else bannerEl.classList.add('banner-info');

  bannerEl.textContent = message;
}

function makeSocket() {
  return io({
    // Fallback polling utile sur certains navigateurs/reseaux mobiles.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 400,
    reconnectionDelayMax: 2500
  });
}

function getRTCPeerConnectionCtor() {
  return window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
}

function isWebRTCSupported() {
  return Boolean(getRTCPeerConnectionCtor() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function createPeerConnection(config) {
  const Ctor = getRTCPeerConnectionCtor();
  if (!Ctor) {
    throw new Error('RTCPeerConnection non supporte');
  }
  return new Ctor(config);
}

function createSessionDescription(desc) {
  if (!desc) return null;
  if (typeof window.RTCSessionDescription === 'function') {
    return new window.RTCSessionDescription(desc);
  }
  return desc;
}

function createIceCandidate(candidate) {
  if (!candidate) return null;
  if (typeof window.RTCIceCandidate === 'function') {
    return new window.RTCIceCandidate(candidate);
  }
  return candidate;
}

function buildRtcConfig() {
  // En LAN, candidats host/local suffisent en general.
  return {
    iceServers: [],
    iceCandidatePoolSize: 8,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan'
  };
}
