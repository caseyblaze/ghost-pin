const { spawn: nodeSpawn, execFile: nodeExecFile, execFileSync: nodeExecFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BIN         = 'pymobiledevice3';
const LOG_PATH    = path.join(__dirname, '..', '..', 'errors.log');
const DAEMON_PATH = path.join(__dirname, '..', 'daemon', 'location_daemon.py');

const REQUEST_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS   = 10000;
const BACKOFF_START_MS   = 1000;
const BACKOFF_MAX_MS     = 30000;
const RESTART_MSG        = '定位服務重啟中，請稍後再試';

function logError(command, detail) {
  const ts    = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const entry = `[${ts}] ${command}\n${detail}\n---\n`;
  const MAX   = 1024 * 1024;
  if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX) {
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n');
    fs.writeFileSync(LOG_PATH, lines.slice(Math.floor(lines.length / 2)).join('\n'));
  }
  fs.appendFileSync(LOG_PATH, entry);
}

// Resolve the interpreter that owns pymobiledevice3 (pipx venv), so the
// daemon can import it. Override with GHOSTPIN_PYTHON.
function resolvePython(deps = {}) {
  const env          = deps.env || process.env;
  const readFileSync = deps.readFileSync || fs.readFileSync;
  const execFileSync = deps.execFileSync || nodeExecFileSync;
  if (env.GHOSTPIN_PYTHON) return env.GHOSTPIN_PYTHON;
  try {
    const bin   = execFileSync('which', [BIN]).toString().trim();
    const first = readFileSync(bin, 'utf8').split('\n')[0];
    // pipx installs a direct-path shebang (#!/.../venv/bin/python), so the
    // first token after #! is the interpreter. (Not handling /usr/bin/env style.)
    if (first.startsWith('#!')) return first.slice(2).trim().split(/\s+/)[0];
  } catch (_) { /* fall through */ }
  return 'python3';
}

// Real transport: spawn the python daemon and frame stdout as JSON lines.
function realSpawnDaemon() {
  const py    = resolvePython();
  const child = nodeSpawn(py, [DAEMON_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
  const bus   = new EventEmitter();
  let buf    = '';
  let stderr = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try { bus.emit('message', JSON.parse(line)); } catch (_) { /* ignore noise */ }
    }
  });
  child.stderr.on('data', (d) => { stderr += d; });
  let exited = false;
  const emitExit = (code, detail) => { if (exited) return; exited = true; bus.emit('exit', code, detail); };
  child.on('exit',  (code) => emitExit(code, stderr.trim()));
  child.on('error', (err)  => emitExit(-1, err.message));
  return {
    send: (obj) => { try { child.stdin.write(JSON.stringify(obj) + '\n'); } catch (_) {} },
    on:   (e, cb) => bus.on(e, cb),
    kill: () => { try { child.kill(); } catch (_) {} },
  };
}

function createPmd(deps = {}) {
  const spawnDaemon = deps.spawnDaemon || realSpawnDaemon;
  const execFile    = deps.execFile    || nodeExecFile;
  const setTimer    = deps.setTimeout  || setTimeout;
  const clearTimer  = deps.clearTimeout || clearTimeout;

  let daemon       = null;
  let ready        = false;
  let seq          = 0;
  const pending    = new Map();   // id -> { resolve, timer, cmd, payload, sent }
  let lastCoord    = null;        // {lat,lng} | null
  let backoff      = BACKOFF_START_MS;
  let restartTimer = null;
  let pingTimer    = null;

  function settle(id, result) {
    const p = pending.get(id);
    if (!p) return;
    clearTimer(p.timer);
    pending.delete(id);
    p.resolve(result);
  }

  function reapplyLastCoord() {
    if (!lastCoord) return;
    const id = ++seq;
    const timer = setTimer(() => onRequestTimeout(id, 'set'), REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve: () => {}, timer, sent: true });
    daemon.send({ id, cmd: 'set', lat: lastCoord.lat, lng: lastCoord.lng });
  }

  function onMessage(msg) {
    if (msg.event === 'ready') {
      ready   = true;
      backoff = BACKOFF_START_MS;
      let flushed = 0;
      for (const [id, p] of pending) {
        if (!p.sent) { p.sent = true; daemon.send({ id, cmd: p.cmd, ...p.payload }); flushed++; }
      }
      if (flushed === 0) reapplyLastCoord();
      return;
    }
    if (msg.event === 'fatal') {
      logError('location-daemon', msg.error || 'fatal');
      return;
    }
    if (msg.id != null) {
      if (msg.ok) {
        settle(msg.id, { ok: true, message: '' });
      } else {
        logError('location-daemon', msg.error || 'unknown');
        settle(msg.id, { ok: false, message: `定位失敗: ${msg.error || ''}`.trim() });
      }
    }
  }

  function onExit(code, detail) {
    ready  = false;
    daemon = null;
    if (detail) logError('location-daemon exit', `code=${code} ${detail}`);
    for (const id of Array.from(pending.keys())) {
      settle(id, { ok: false, message: RESTART_MSG });
    }
    restartTimer = setTimer(() => { restartTimer = null; start(); }, backoff);
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
  }

  function start() {
    const d = spawnDaemon();
    daemon = d;
    ready  = false;
    // Bind handlers to THIS daemon instance. After a restart, a stale daemon
    // that emits again (e.g. 'exit' then 'error' on spawn failure) is ignored,
    // so we never schedule two restarts or talk to two daemons at once.
    d.on('message', (msg) => { if (daemon === d) onMessage(msg); });
    d.on('exit', (code, detail) => { if (daemon === d) onExit(code, detail); });
  }

  function ensureStarted() {
    if (!daemon && !restartTimer) start();
    if (!pingTimer) scheduleHealthCheck();
  }

  // A delivered request (or ping) that gets no reply within the timeout means
  // the daemon is wedged: the process is alive but its DVT session is
  // unresponsive. Killing it triggers onExit -> backoff restart -> re-apply.
  // A request that was never delivered (daemon down/not ready) just resolves
  // with the restart message and does NOT kill (there's nothing to kill).
  function onRequestTimeout(id, cmd) {
    const p = pending.get(id);
    const wasDelivered = !!(p && p.sent);
    settle(id, { ok: false, message: RESTART_MSG });
    if (wasDelivered && daemon) {
      logError('location-daemon', `${cmd} timeout, restarting wedged daemon`);
      daemon.kill();
    }
  }

  function request(cmd, payload) {
    return new Promise((resolve) => {
      const id    = ++seq;
      const timer = setTimer(() => onRequestTimeout(id, cmd), REQUEST_TIMEOUT_MS);
      const sent  = !!(ready && daemon);
      pending.set(id, { resolve, timer, cmd, payload, sent });
      if (sent) daemon.send({ id, cmd, ...payload });
    });
  }

  // Periodic liveness probe so an idle wedged session is healed before the
  // next user action rather than on it. The ping flows through the same
  // pending/timeout machinery, so a missing reply restarts the daemon.
  function pingOnce() {
    if (!ready || !daemon) return;
    const id    = ++seq;
    const timer = setTimer(() => onRequestTimeout(id, 'ping'), REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve: () => {}, timer, cmd: 'ping', payload: {}, sent: true });
    daemon.send({ id, cmd: 'ping' });
  }

  function scheduleHealthCheck() {
    pingTimer = setTimer(() => { pingOnce(); scheduleHealthCheck(); }, PING_INTERVAL_MS);
  }

  function setLocation(lat, lng) {
    lastCoord = { lat, lng };
    ensureStarted();
    return request('set', { lat, lng });
  }

  function clearLocation() {
    lastCoord = null;
    ensureStarted();
    return request('clear', {});
  }

  function getStatus() {
    return new Promise((resolve) => {
      execFile(BIN, ['usbmux', 'list'], (error, stdout) => {
        let online = false;
        if (!error) {
          try {
            const list = JSON.parse(stdout || '[]');
            online = Array.isArray(list) && list.length > 0;
          } catch (_) { online = false; }
        }
        const message = !online ? '無裝置連線' : (ready ? '定位服務就緒' : '通道未就緒');
        resolve({ ok: true, online, ready, message });
      });
    });
  }

  return { setLocation, clearLocation, getStatus };
}

module.exports = { createPmd, resolvePython };
