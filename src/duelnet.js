/*
 * Duel transport: one two-way line between two browsers, opened by a room code.
 *
 * `openLine(code, host)` resolves once the room exists (the host's code is registered, or the
 * guest's connection is on its way) and returns a line:
 *   send(message)            a plain object; dropped silently while nobody is on the other end
 *   close()                  hang up and release the room
 *   onopen / onmessage / onclose / onerror   assigned by the caller
 * It rejects with an Error whose `code` is 'taken' (a host's room code is in use), 'missing'
 * (no such room), 'full', 'offline' or 'failed'.
 *
 * Two carriers share that shape:
 *  - `peer`: WebRTC through PeerJS (vendor/peerjs-*.min.js, loaded only when a duel is opened).
 *    The public PeerJS broker introduces the two browsers; match data then travels directly
 *    between them and never touches a server of ours. The site has no backend to do it instead.
 *  - `local`: a BroadcastChannel, for two windows of one browser. `?duelnet=local` selects it;
 *    tests/browser-duel.cjs plays whole duels over it without a network.
 */
const PEER_SCRIPT = 'vendor/peerjs-1.5.5.min.js';
const ROOM_PREFIX = 'breachline29-duel-';
const CONNECT_TIMEOUT = 15000;   // to reach the broker
const DIAL_TIMEOUT = 8000;       // for one attempt at the direct connection
const DIAL_TRIES = 3;            // a first attempt often fails where a second gets through

/** No 0/O, 1/I/L: a code is read aloud and typed by hand. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export function randomCode() {
  const pick = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(pick);
  return [...pick].map(n => ALPHABET[n % ALPHABET.length]).join('');
}
/** What a typed or linked code becomes: upper case without spaces or dashes, or '' if it cannot be a code. */
export function cleanCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === CODE_LENGTH && [...code].every(c => ALPHABET.includes(c)) ? code : '';
}

export const carrier = () => (new URLSearchParams(location.search).get('duelnet') === 'local' ? 'local' : 'peer');

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function blankLine() {
  return { onopen: null, onmessage: null, onclose: null, onerror: null, open: false, closed: false };
}

/* ---------------- two windows of one browser ---------------- */

function localLine(code, host) {
  const line = blankLine();
  const me = randomCode() + randomCode();
  let other = null, knock = null;
  const channel = new BroadcastChannel(`td.duel.${code}`);
  const post = (kind, body = null, to = other) => channel.postMessage({ kind, from: me, to, body });
  const hangUp = (notify) => {
    if (line.closed) return;
    line.closed = true; line.open = false;
    clearInterval(knock);
    channel.close();
    if (notify) line.onclose?.();
  };
  channel.onmessage = ({ data }) => {
    if (!data || data.from === me || (data.to && data.to !== me)) return;
    if (data.kind === 'knock' && host) {
      if (other && other !== data.from) { post('full', null, data.from); return; }
      other = data.from;
      post('welcome');
      if (!line.open) { line.open = true; line.onopen?.(); }
    } else if (data.kind === 'welcome' && !host && !other) {
      other = data.from;
      clearInterval(knock);
      line.open = true;
      line.onopen?.();
    } else if (data.kind === 'full' && !host && !other) {
      line.onerror?.(failure('full', 'That duel already has two players.'));
      hangUp(false);
    } else if (data.from !== other) {
      return;
    } else if (data.kind === 'data') {
      line.onmessage?.(data.body);
    } else if (data.kind === 'bye') {
      if (host) { other = null; line.open = false; line.onclose?.(); }   // the room stays open for the next knock
      else hangUp(true);
    }
  };
  line.send = (message) => { if (line.open && !line.closed) post('data', message); };
  line.close = () => { if (!line.closed && other) post('bye'); hangUp(false); };
  if (!host) {
    let tries = 0;
    const ask = () => {
      if (++tries > 12) { line.onerror?.(failure('missing', 'No duel is waiting under that code.')); hangUp(false); return; }
      post('knock', null, null);
    };
    knock = setInterval(ask, 250);
    ask();
  }
  window.addEventListener('pagehide', () => line.close());
  return Promise.resolve(line);
}

/* ---------------- across the internet ---------------- */

let peerLibrary = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  peerLibrary ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PEER_SCRIPT;
    script.onload = () => (window.Peer ? resolve(window.Peer) : reject(failure('failed', 'The connection library did not load.')));
    script.onerror = () => { peerLibrary = null; reject(failure('offline', 'The connection library could not be downloaded.')); };
    document.head.append(script);
  });
  return peerLibrary;
}

const PEER_ERRORS = {
  'unavailable-id': ['taken', 'That room code is in use.'],
  'peer-unavailable': ['missing', 'No duel is waiting under that code.'],
  'network': ['offline', 'Could not reach the matchmaking service. Check your connection.'],
  'server-error': ['offline', 'The matchmaking service is not answering. Try again in a moment.'],
  'socket-error': ['offline', 'Lost the matchmaking service. Try again in a moment.'],
  'socket-closed': ['offline', 'Lost the matchmaking service. Try again in a moment.'],
  'browser-incompatible': ['failed', 'This browser cannot open a direct connection.'],
  'webrtc': ['failed', 'The direct connection failed. Some networks block it.']
};

async function peerLine(code, host) {
  const Peer = await loadPeer();
  const line = blankLine();
  let peer = null, link = null;
  const hangUp = (notify) => {
    if (line.closed) return;
    line.closed = true; line.open = false;
    try { link?.close(); } catch { /* already gone */ }
    try { peer?.destroy(); } catch { /* already gone */ }
    if (notify) line.onclose?.();
  };
  // `link` is the connection in use or being tried; events from any other (an abandoned attempt) are ignored.
  const adopt = (conn, lost = () => {}) => {
    link = conn;
    conn.on('open', () => { if (link === conn && !line.closed) { line.open = true; line.onopen?.(); } });
    conn.on('data', (message) => { if (link === conn) line.onmessage?.(message); });
    conn.on('close', () => {
      if (link !== conn) return;
      if (!line.open) { lost(); return; }
      if (host && !line.closed) { link = null; line.open = false; line.onclose?.(); }   // keep the room for a rejoin
      else hangUp(true);
    });
    conn.on('error', () => { if (link === conn && !line.open) lost(); });
  };
  /* The guest's side of the direct connection. Each attempt gets `DIAL_TIMEOUT`; the last failure is reported. */
  const dial = (attempt) => {
    if (line.closed) return;
    let done = false;
    const conn = peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json' });
    const retry = () => {
      if (done || line.open || line.closed || link !== conn) return;
      done = true;
      link = null;
      try { conn.close(); } catch { /* never opened */ }
      if (attempt < DIAL_TRIES) { dial(attempt + 1); return; }
      line.onerror?.(failure('failed', 'Could not connect to that duel. Some networks block direct connections.'));
      hangUp(false);
    };
    adopt(conn, retry);
    setTimeout(retry, DIAL_TIMEOUT);
  };
  line.send = (message) => { if (line.open && !line.closed) { try { link.send(message); } catch { /* the close event follows */ } } };
  line.close = () => hangUp(false);

  await new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) { if (!line.closed && !line.open) { line.onerror?.(error); hangUp(false); } return; }
      settled = true; hangUp(false); reject(error);
    };
    const timer = setTimeout(() => fail(failure('offline', 'The matchmaking service did not answer in time.')), CONNECT_TIMEOUT);
    // `?peerdebug=3` prints the library's own log to the console when a connection needs diagnosing.
    const options = { debug: Math.min(3, Number(new URLSearchParams(location.search).get('peerdebug')) || 0) };
    peer = host ? new Peer(ROOM_PREFIX + code, options) : new Peer(options);
    peer.on('open', () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (!host) dial(1);
      resolve();
    });
    peer.on('connection', (conn) => {
      if (!host || (link && line.open)) { conn.on('open', () => { try { conn.send({ t: 'full' }); } catch { /* gone */ } setTimeout(() => conn.close(), 300); }); return; }
      // A connection that never opened is a guest's abandoned attempt: their next one takes its place.
      const stale = link;
      adopt(conn);
      try { stale?.close(); } catch { /* never opened */ }
    });
    // The broker is only needed for introductions: losing it mid-match costs nothing, so quietly go back for the next guest.
    peer.on('disconnected', () => { if (!line.closed && !peer.destroyed) { try { peer.reconnect(); } catch { /* destroyed meanwhile */ } } });
    peer.on('error', (error) => {
      clearTimeout(timer);
      const [kind, text] = PEER_ERRORS[error?.type] || ['failed', 'The connection failed.'];
      if (line.open && kind === 'offline') return;   // the match is already peer to peer
      fail(failure(kind, text));
    });
  });
  window.addEventListener('pagehide', () => line.close());
  return line;
}

export function openLine(code, host) {
  return carrier() === 'local' ? localLine(code, host) : peerLine(code, host);
}
