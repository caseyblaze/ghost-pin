# 穩定定位：常駐 DVT session + 三層自動復原 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「每改一次定位就重連 tunnel+DVT」改成「一條常駐 DVT session 持續推座標」，並為 DVT session / daemon / tunneld 三層各自加上自動復原。

**Architecture:** 新增一個常駐 Python daemon（`server/daemon/location_daemon.py`），啟動時用 pymobiledevice3 的 async API 開一條 `DvtProvider + LocationSimulation` session 並持有不關，從 stdin 讀 JSON 指令、把結果寫回 stdout。改寫 `server/src/pmd.js` 成 supervisor：管理 daemon 生命週期、line protocol、逾時、指數 backoff 重啟、重啟後自動重設最後座標。tunneld 改由 launchd LaunchDaemon（`KeepAlive`/`RunAtLoad`）監管。

**Tech Stack:** Node.js (CommonJS, Express, Jest), Python 3.12 (pymobiledevice3 9.16.0, asyncio), macOS launchd, Tkinter launcher。

---

## 背景：關鍵事實（實作前必讀）

- pymobiledevice3 安裝在 pipx venv：`~/.local/pipx/venvs/pymobiledevice3/bin/python`（Python 3.12.10）。daemon 必須用**這個** interpreter 跑才有 pymobiledevice3。
- 正解 API（9.16.0，全為 async）：
  ```python
  from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
  from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation
  from pymobiledevice3.tunneld.api import TUNNELD_DEFAULT_ADDRESS, get_tunneld_devices

  rsds = await get_tunneld_devices(TUNNELD_DEFAULT_ADDRESS)  # 預設 ('127.0.0.1', 49151)
  rsd = rsds[0]
  async with DvtProvider(rsd) as dvt, LocationSimulation(dvt) as loc:
      await loc.set(lat, lng)   # session 開著就能重複呼叫，不必重連
      await loc.clear()
  ```
- CLI 之所以脆：`simulate-location set` 用 `OSUTILS.wait_return()`（讀鍵盤）來卡住維持 session，無 TTY 的 server 環境會在 `termios.tcgetattr` 噴 readchar traceback（正是 `errors.log` 的內容）。daemon 改用「持有 async-with 區塊 + 讀 stdin」維持 session，不碰 TTY。

## Line protocol（supervisor ⇄ daemon，每行一個 JSON）

- 請求：`{"id": 7, "cmd": "set", "lat": 25.03, "lng": 121.56}` / `{"id": 8, "cmd": "clear"}`
- 回覆：`{"id": 7, "ok": true}` 或 `{"id": 7, "ok": false, "error": "..."}`
- daemon 就緒事件：`{"event": "ready"}`（session 已開）
- daemon 致命事件：`{"event": "fatal", "error": "..."}`（隨後 process 退出）

## File Structure

| 檔案 | 責任 |
|------|------|
| `server/daemon/location_daemon.py` | 新增：持有 DVT session、讀 stdin 指令、寫 stdout 回覆 |
| `server/src/pmd.js` | 改寫：daemon supervisor（生命週期 / protocol / 逾時 / backoff / 重設座標） |
| `server/src/routes.js` | 微調：`POST /location` 改 await 真實結果 |
| `server/tests/pmd.test.js` | 改寫：用假 daemon transport 測 supervisor |
| `server/tests/routes.test.js` | 微調：`/location` 回傳真實結果 |
| `scripts/com.ghostpin.tunneld.plist` | 新增：LaunchDaemon plist 範本 |
| `scripts/install-tunneld.sh` | 新增：安裝 / 載入 LaunchDaemon |
| `launcher.py` | 微調：tunneld 狀態改讀 `launchctl` |
| `README.md` | 更新：tunneld 改用 launchd 安裝 |

---

## Task 1: Python location daemon

**Files:**
- Create: `server/daemon/location_daemon.py`
- Test: `server/daemon/test_location_daemon.py`

- [ ] **Step 1: 寫失敗的純函式測試（指令解析）**

純邏輯（解析、回覆組裝）抽成可測函式，不需真機。建立 `server/daemon/test_location_daemon.py`：

```python
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import location_daemon as d  # noqa: E402


class TestProtocol(unittest.TestCase):
    def test_parse_valid_set(self):
        self.assertEqual(
            d.parse_command('{"id": 1, "cmd": "set", "lat": 25.0, "lng": 121.5}'),
            {"id": 1, "cmd": "set", "lat": 25.0, "lng": 121.5},
        )

    def test_parse_blank_returns_none(self):
        self.assertIsNone(d.parse_command("   "))

    def test_parse_invalid_json_returns_none(self):
        self.assertIsNone(d.parse_command("not json"))

    def test_reply_ok(self):
        self.assertEqual(d.reply_ok(3), {"id": 3, "ok": True})

    def test_reply_err(self):
        self.assertEqual(d.reply_err(3, "boom"), {"id": 3, "ok": False, "error": "boom"})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `~/.local/pipx/venvs/pymobiledevice3/bin/python -m unittest server/daemon/test_location_daemon.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'location_daemon'`

- [ ] **Step 3: 寫 daemon 實作**

建立 `server/daemon/location_daemon.py`：

```python
#!/usr/bin/env python3
"""Ghost-Pin location daemon.

Holds a single long-lived DVT LocationSimulation session and applies
set/clear commands received as JSON lines on stdin. Replies as JSON lines
on stdout. Stays deliberately "dumb": on any session error it reports and
exits so the Node supervisor can restart it.
"""
import asyncio
import json
import sys
import threading

from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation
from pymobiledevice3.tunneld.api import TUNNELD_DEFAULT_ADDRESS, get_tunneld_devices


def parse_command(line):
    """Parse one stdin line into a command dict, or None if blank/invalid."""
    line = line.strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except ValueError:
        return None


def reply_ok(req_id):
    return {"id": req_id, "ok": True}


def reply_err(req_id, error):
    return {"id": req_id, "ok": False, "error": error}


def write_line(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


async def _stdin_lines(loop):
    """Yield stdin lines without blocking the event loop (reader thread)."""
    queue = asyncio.Queue()

    def reader():
        for line in sys.stdin:
            loop.call_soon_threadsafe(queue.put_nowait, line)
        loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=reader, daemon=True).start()
    while True:
        line = await queue.get()
        if line is None:
            return
        yield line


async def _pick_rsd(udid):
    rsds = await get_tunneld_devices(TUNNELD_DEFAULT_ADDRESS)
    if not rsds:
        raise RuntimeError("no device available via tunneld")
    if udid:
        for rsd in rsds:
            if getattr(rsd, "udid", None) == udid:
                return rsd
        raise RuntimeError("device %s not found via tunneld" % udid)
    return rsds[0]


async def main():
    loop = asyncio.get_running_loop()
    udid = sys.argv[1] if len(sys.argv) > 1 else ""
    rsd = await _pick_rsd(udid or None)
    async with DvtProvider(rsd) as dvt, LocationSimulation(dvt) as loc:
        write_line({"event": "ready"})
        async for raw in _stdin_lines(loop):
            msg = parse_command(raw)
            if msg is None:
                continue
            req_id = msg.get("id")
            cmd = msg.get("cmd")
            try:
                if cmd == "set":
                    await loc.set(float(msg["lat"]), float(msg["lng"]))
                elif cmd == "clear":
                    await loc.clear()
                elif cmd == "ping":
                    pass
                else:
                    write_line(reply_err(req_id, "unknown cmd: %s" % cmd))
                    continue
                write_line(reply_ok(req_id))
            except Exception as exc:  # session likely dead → report then exit
                write_line(reply_err(req_id, str(exc)))
                raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        write_line({"event": "fatal", "error": str(exc)})
        sys.exit(1)
```

- [ ] **Step 4: 跑測試確認通過**

Run: `~/.local/pipx/venvs/pymobiledevice3/bin/python -m unittest server/daemon/test_location_daemon.py -v`
Expected: PASS（5 tests）

- [ ] **Step 5: 確認 daemon 可被 import 且無語法錯**

Run: `~/.local/pipx/venvs/pymobiledevice3/bin/python -c "import sys; sys.path.insert(0,'server/daemon'); import location_daemon; print('import ok')"`
Expected: `import ok`

- [ ] **Step 6: Commit**

```bash
git add server/daemon/location_daemon.py server/daemon/test_location_daemon.py
git commit -m "feat: add persistent DVT location daemon"
```

---

## Task 2: Node supervisor 改寫（pmd.js）— TDD with fake daemon

**Files:**
- Modify: `server/src/pmd.js`（整檔改寫）
- Modify: `server/tests/pmd.test.js`（整檔改寫）

供測試用的注入點：`createPmd({ spawnDaemon, execFile, setTimeout, clearTimeout })`。`spawnDaemon()` 回傳一個 transport：`{ send(obj), on(event, cb), kill() }`，事件有 `'message'(obj)` 與 `'exit'(code, detail)`。

- [ ] **Step 1: 寫失敗的 supervisor 測試**

整檔取代 `server/tests/pmd.test.js`：

```js
const { EventEmitter } = require('events');
const { createPmd } = require('../src/pmd');

// A controllable in-memory stand-in for the python daemon.
function makeFakeDaemon() {
  const bus = new EventEmitter();
  const d = {
    sent: [],
    killed: false,
    send: (obj) => d.sent.push(obj),
    on: (e, cb) => bus.on(e, cb),
    kill: () => { d.killed = true; },
    // test helpers
    ready: () => bus.emit('message', { event: 'ready' }),
    reply: (id, ok, error) => bus.emit('message', { id, ok, error }),
    fatal: (error) => bus.emit('message', { event: 'fatal', error }),
    exit: (code, detail) => bus.emit('exit', code, detail),
  };
  return d;
}

// spawnDaemon factory that records every daemon it creates.
function daemonFactory() {
  const created = [];
  const fn = () => { const d = makeFakeDaemon(); created.push(d); return d; };
  fn.created = created;
  fn.latest = () => created[created.length - 1];
  return fn;
}

function fakeExecFile(stdout) {
  return (file, args, cb) => cb(null, stdout, '');
}

const ONLINE = '[{"SerialNumber":"ABC123"}]';
const OFFLINE = '[]';

describe('pmd supervisor', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('setLocation spawns daemon and sends set after ready', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    const p = pmd.setLocation(25.03, 121.56);
    const d = spawnDaemon.latest();
    d.ready();                                   // session opens
    expect(d.sent).toContainEqual({ id: expect.any(Number), cmd: 'set', lat: 25.03, lng: 121.56 });
    const id = d.sent[0].id;
    d.reply(id, true);
    await expect(p).resolves.toEqual({ ok: true, message: '' });
  });

  test('setLocation when already ready sends immediately', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    pmd.setLocation(1, 1);
    const d = spawnDaemon.latest();
    d.ready();
    const p = pmd.setLocation(2, 2);
    const last = d.sent[d.sent.length - 1];
    expect(last).toMatchObject({ cmd: 'set', lat: 2, lng: 2 });
    d.reply(last.id, true);
    await expect(p).resolves.toEqual({ ok: true, message: '' });
  });

  test('daemon ok:false resolves failure', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    const p = pmd.setLocation(0, 0);
    const d = spawnDaemon.latest();
    d.ready();
    d.reply(d.sent[0].id, false, 'session boom');
    const res = await p;
    expect(res.ok).toBe(false);
    expect(res.message).toContain('session boom');
  });

  test('request times out when no reply arrives', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    const p = pmd.setLocation(0, 0);
    spawnDaemon.latest().ready();
    jest.advanceTimersByTime(5000);
    const res = await p;
    expect(res.ok).toBe(false);
    expect(res.message).toContain('重啟中');
  });

  test('daemon exit settles pending and schedules backoff restart', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    const p = pmd.setLocation(5, 5);
    spawnDaemon.latest().ready();
    spawnDaemon.latest().exit(1, 'died');
    const res = await p;
    expect(res.ok).toBe(false);
    jest.advanceTimersByTime(1000);              // first backoff = 1s
    expect(spawnDaemon.created.length).toBe(2);  // restarted
  });

  test('after restart re-applies last coordinate', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    const p = pmd.setLocation(7, 8);
    spawnDaemon.latest().ready();
    spawnDaemon.latest().reply(spawnDaemon.latest().sent[0].id, true);
    await p;
    spawnDaemon.latest().exit(1, 'died');
    jest.advanceTimersByTime(1000);
    const d2 = spawnDaemon.latest();
    d2.ready();                                   // no active request → re-apply lastCoord
    expect(d2.sent).toContainEqual({ id: expect.any(Number), cmd: 'set', lat: 7, lng: 8 });
  });

  test('clearLocation stops re-applying last coordinate', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    pmd.setLocation(7, 8);
    spawnDaemon.latest().ready();
    const pc = pmd.clearLocation();
    const d = spawnDaemon.latest();
    d.reply(d.sent[d.sent.length - 1].id, true);
    await pc;
    d.exit(1, 'died');
    jest.advanceTimersByTime(1000);
    const d2 = spawnDaemon.latest();
    d2.ready();
    expect(d2.sent.some((m) => m.cmd === 'set')).toBe(false);
  });

  test('backoff doubles and caps at 30s', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    pmd.setLocation(1, 1);
    let n = spawnDaemon.created.length;
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const delay of delays) {
      spawnDaemon.latest().exit(1, 'died');
      jest.advanceTimersByTime(delay);
      expect(spawnDaemon.created.length).toBe(++n);
    }
  });

  test('getStatus reports online and ready', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    pmd.setLocation(1, 1);
    spawnDaemon.latest().ready();
    const res = await pmd.getStatus();
    expect(res).toEqual({ ok: true, online: true, ready: true, message: '定位服務就緒' });
  });

  test('getStatus reports offline when no device', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(OFFLINE) });
    const res = await pmd.getStatus();
    expect(res).toEqual({ ok: true, online: false, ready: false, message: '無裝置連線' });
  });
});

describe('resolvePython', () => {
  const { resolvePython } = require('../src/pmd');

  test('honours GHOSTPIN_PYTHON env override', () => {
    const py = resolvePython({ env: { GHOSTPIN_PYTHON: '/custom/python' } });
    expect(py).toBe('/custom/python');
  });

  test('reads interpreter from pymobiledevice3 shebang', () => {
    const py = resolvePython({
      env: {},
      execFileSync: () => Buffer.from('/usr/local/bin/pymobiledevice3\n'),
      readFileSync: () => '#!/Users/kc/.local/pipx/venvs/pymobiledevice3/bin/python\nrest',
    });
    expect(py).toBe('/Users/kc/.local/pipx/venvs/pymobiledevice3/bin/python');
  });

  test('falls back to python3 when lookup fails', () => {
    const py = resolvePython({
      env: {},
      execFileSync: () => { throw new Error('not found'); },
    });
    expect(py).toBe('python3');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test --prefix server -- pmd.test.js`
Expected: FAIL — 現有 `pmd.js` 沒有 `spawnDaemon` 注入、沒有 `resolvePython` export。

- [ ] **Step 3: 改寫 pmd.js**

整檔取代 `server/src/pmd.js`：

```js
const { spawn: nodeSpawn, execFile: nodeExecFile, execFileSync: nodeExecFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BIN         = 'pymobiledevice3';
const LOG_PATH    = path.join(__dirname, '..', '..', 'errors.log');
const DAEMON_PATH = path.join(__dirname, '..', 'daemon', 'location_daemon.py');

const REQUEST_TIMEOUT_MS = 5000;
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
  child.on('exit',  (code) => bus.emit('exit', code, stderr.trim()));
  child.on('error', (err)  => bus.emit('exit', -1, err.message));
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
  let started      = false;       // user has requested at least once
  let seq          = 0;
  const pending    = new Map();   // id -> { resolve, timer, cmd, payload, sent }
  let lastCoord    = null;        // {lat,lng} | null
  let backoff      = BACKOFF_START_MS;
  let restartTimer = null;

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
    const timer = setTimer(() => pending.delete(id), REQUEST_TIMEOUT_MS);
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
    daemon = spawnDaemon();
    ready  = false;
    daemon.on('message', onMessage);
    daemon.on('exit', onExit);
  }

  function ensureStarted() {
    started = true;
    if (!daemon && !restartTimer) start();
  }

  function request(cmd, payload) {
    return new Promise((resolve) => {
      const id    = ++seq;
      const timer = setTimer(() => settle(id, { ok: false, message: RESTART_MSG }), REQUEST_TIMEOUT_MS);
      const sent  = !!(ready && daemon);
      pending.set(id, { resolve, timer, cmd, payload, sent });
      if (sent) daemon.send({ id, cmd, ...payload });
    });
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test --prefix server -- pmd.test.js`
Expected: PASS（supervisor 11 + resolvePython 3）

- [ ] **Step 5: Commit**

```bash
git add server/src/pmd.js server/tests/pmd.test.js
git commit -m "feat: rewrite pmd as persistent daemon supervisor"
```

---

## Task 3: routes.js 回傳真實結果

**Files:**
- Modify: `server/src/routes.js:7-16`
- Modify: `server/tests/routes.test.js`

- [ ] **Step 1: 改寫 /location 的測試**

把 `server/tests/routes.test.js` 中三個 `/location` 測試替換為以下兩個（移除原本「always returns ok immediately」那個過時測試）：

```js
  test('POST /location with valid coords returns daemon result', async () => {
    const pmd = { setLocation: jest.fn().mockResolvedValue({ ok: true, message: '' }) };
    const res = await request(makeApp(pmd)).post('/location').send({ lat: 25.033, lng: 121.5654 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, message: '' });
    expect(pmd.setLocation).toHaveBeenCalledWith(25.033, 121.5654);
  });

  test('POST /location surfaces daemon failure', async () => {
    const pmd = { setLocation: jest.fn().mockResolvedValue({ ok: false, message: '定位服務重啟中，請稍後再試' }) };
    const res = await request(makeApp(pmd)).post('/location').send({ lat: 0, lng: 0 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toContain('重啟中');
  });

  test('POST /location with invalid coords returns 400 and does not call pmd', async () => {
    const pmd = { setLocation: jest.fn() };
    const res = await request(makeApp(pmd)).post('/location').send({ lat: 999, lng: 0 });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(pmd.setLocation).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test --prefix server -- routes.test.js`
Expected: FAIL — 現在 `/location` 不 await，回傳 `{ok:true,message:'ok'}` 而非 daemon 結果。

- [ ] **Step 3: 改寫 routes.js 的 /location handler**

把 `server/src/routes.js` 的 `/location` handler 改成：

```js
  router.post('/location', async (req, res) => {
    const { lat, lng } = req.body || {};
    const v = validateCoords(lat, lng);
    if (!v.ok) {
      res.status(400).json({ ok: false, message: v.message });
      return;
    }
    const result = await pmd.setLocation(v.lat, v.lng);
    res.json({ ok: result.ok, message: result.message });
  });
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test --prefix server -- routes.test.js`
Expected: PASS

- [ ] **Step 5: 跑整包後端測試**

Run: `npm test --prefix server`
Expected: 全綠（pmd / routes / validate）

- [ ] **Step 6: Commit**

```bash
git add server/src/routes.js server/tests/routes.test.js
git commit -m "feat: surface real set-location result to client"
```

---

## Task 4: tunneld LaunchDaemon（plist + 安裝腳本）

**Files:**
- Create: `scripts/com.ghostpin.tunneld.plist`
- Create: `scripts/install-tunneld.sh`

- [ ] **Step 1: 建立 plist 範本**

建立 `scripts/com.ghostpin.tunneld.plist`（`__PMD3_BIN__` 由安裝腳本以實際路徑取代）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ghostpin.tunneld</string>
    <key>ProgramArguments</key>
    <array>
        <string>__PMD3_BIN__</string>
        <string>remote</string>
        <string>tunneld</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ghostpin-tunneld.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ghostpin-tunneld.log</string>
</dict>
</plist>
```

- [ ] **Step 2: 建立安裝腳本**

建立 `scripts/install-tunneld.sh`：

```bash
#!/usr/bin/env bash
# Install pymobiledevice3 remote tunneld as a root LaunchDaemon so it
# auto-starts at boot and auto-restarts on crash. Run once with sudo.
set -euo pipefail

LABEL="com.ghostpin.tunneld"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/$LABEL.plist"
PLIST_DST="/Library/LaunchDaemons/$LABEL.plist"

if [ "$(id -u)" -ne 0 ]; then
  echo "請用 sudo 執行：sudo $0" >&2
  exit 1
fi

# Resolve the absolute pymobiledevice3 binary (must be on the invoking user's PATH).
PMD3_BIN="$(command -v pymobiledevice3 || true)"
if [ -z "$PMD3_BIN" ]; then
  PMD3_BIN="$(sudo -u "${SUDO_USER:-$USER}" bash -lc 'command -v pymobiledevice3' || true)"
fi
if [ -z "$PMD3_BIN" ]; then
  echo "找不到 pymobiledevice3，請先 pipx install pymobiledevice3" >&2
  exit 1
fi

sed "s#__PMD3_BIN__#$PMD3_BIN#" "$PLIST_SRC" > "$PLIST_DST"
chown root:wheel "$PLIST_DST"
chmod 644 "$PLIST_DST"

# Reload if already present, then bootstrap.
launchctl bootout system "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap system "$PLIST_DST"
launchctl enable "system/$LABEL"

echo "✓ tunneld LaunchDaemon 已安裝並啟動（$PMD3_BIN）"
echo "  查看狀態： launchctl print system/$LABEL"
echo "  查看日誌： tail -f /tmp/ghostpin-tunneld.log"
```

- [ ] **Step 3: 設定執行權限並驗證語法**

Run: `chmod +x scripts/install-tunneld.sh && bash -n scripts/install-tunneld.sh && echo "syntax ok"`
Expected: `syntax ok`

- [ ] **Step 4: 驗證 plist 範本格式正確（取代佔位符後 plutil 檢查）**

Run: `sed 's#__PMD3_BIN__#/usr/local/bin/pymobiledevice3#' scripts/com.ghostpin.tunneld.plist | plutil -lint -`
Expected: `-: OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/com.ghostpin.tunneld.plist scripts/install-tunneld.sh
git commit -m "feat: supervise tunneld via launchd LaunchDaemon"
```

> 註：實際 `sudo ./scripts/install-tunneld.sh` 的安裝與重啟驗證放在 Task 7 手動清單（需 sudo 與真機）。

---

## Task 5: launcher.py 改讀 launchctl 狀態

**Files:**
- Modify: `launcher.py:18-20`（`is_running` 旁新增 helper）、`launcher.py:79-95`（`_poll` 的 tunneld 區塊）

- [ ] **Step 1: 新增 tunneld 狀態查詢 helper**

在 `launcher.py` 的 `is_running` 函式之後新增：

```python
TUNNELD_LABEL = "com.ghostpin.tunneld"


def tunneld_state():
    """Return one of: 'running', 'stopped', 'absent' based on launchd."""
    result = subprocess.run(
        ["launchctl", "print", f"system/{TUNNELD_LABEL}"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        return "absent"
    return "running" if "state = running" in result.stdout else "stopped"
```

- [ ] **Step 2: 改 `_poll` 的 tunneld 狀態區塊**

把 `_poll` 中這段：

```python
        if is_running("pymobiledevice3 remote tunneld"):
            self.tunneld_status.config(text="● 運行中", fg=GREEN)
        else:
            self.tunneld_status.config(text="● 未啟動", fg=GRAY)
```

替換為：

```python
        state = tunneld_state()
        if state == "running":
            self.tunneld_status.config(text="● 運行中", fg=GREEN)
        elif state == "stopped":
            self.tunneld_status.config(text="● 已停止", fg=GRAY)
        else:
            self.tunneld_status.config(text="● 未安裝（跑 install-tunneld.sh）", fg=GRAY)
```

- [ ] **Step 3: 驗證 launcher.py 可編譯**

Run: `python3 -m py_compile launcher.py && echo "compile ok"`
Expected: `compile ok`

- [ ] **Step 4: Commit**

```bash
git add launcher.py
git commit -m "feat: read tunneld status from launchd in launcher"
```

---

## Task 6: README 更新

**Files:**
- Modify: `README.md`（「一次性設定」第 5 步）

- [ ] **Step 1: 取代設定步驟 5**

把 README「一次性設定」中的：

```
5. 常駐 tunnel（保持開著，Mac 重開後需重跑）：

```bash
sudo pymobiledevice3 remote tunneld
```
```

替換為：

```
5. 安裝常駐 tunnel（一次性，之後開機自動啟動、掛掉自動重啟）：

```bash
sudo ./scripts/install-tunneld.sh
```

狀態與日誌：

```bash
launchctl print system/com.ghostpin.tunneld
tail -f /tmp/ghostpin-tunneld.log
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: install tunneld via launchd instead of manual run"
```

---

## Task 7: 真機整合驗證（手動，需 iPhone + sudo）

> 此任務無自動測試；逐項手動執行並記錄結果。前置：iPhone 已 USB 連線、信任、Developer Mode 開啟。

- [ ] **Step 1: 安裝並確認 tunneld LaunchDaemon**

Run: `sudo ./scripts/install-tunneld.sh && launchctl print system/com.ghostpin.tunneld | grep state`
Expected: 顯示 `state = running`

- [ ] **Step 2: 啟動 server，連續改座標 N 次不重連**

啟動：`npm start --prefix server`
透過前端或 curl 連發 5 次不同座標，例如：
```bash
for c in "25.03 121.56" "24.14 120.68" "22.62 120.31" "25.10 121.55" "23.97 120.97"; do
  set -- $c
  curl -s -X POST localhost:3000/location -H 'content-type: application/json' -d "{\"lat\":$1,\"lng\":$2}"; echo
done
```
Expected: 每次 < 1 秒回 `{"ok":true,...}`；iPhone 地圖每次都跳到新座標；`errors.log` 沒有新增 readchar/termios traceback。

- [ ] **Step 2.5: 確認只有一個 daemon 程序**

Run: `pgrep -f location_daemon.py | wc -l`
Expected: `1`（多次設定不會堆積多個 process）

- [ ] **Step 3: 模擬 session 掛掉 → 自動恢復並重設座標**

設一個座標後，`pkill -f location_daemon.py`，等數秒再查狀態與位置。
Expected: supervisor 在 backoff 後自動重啟 daemon；iPhone 位置自動回到最後設定的座標（re-apply 生效）；前端 `/status` 的 `ready` 短暫 false 後回 true。

- [ ] **Step 4: kill tunneld → launchd 自動重起**

Run: `sudo launchctl kill SIGKILL system/com.ghostpin.tunneld; sleep 3; launchctl print system/com.ghostpin.tunneld | grep state`
Expected: `state = running`（launchd KeepAlive 已自動拉起）；隨後再設定定位仍正常。

- [ ] **Step 5: reboot 後免手動可用（可選，耗時）**

重開機 → 不手動跑任何指令 → 啟動 server → 設定定位。
Expected: tunneld 已由 launchd 於開機時啟動，定位設定成功。

- [ ] **Step 6: 記錄結果**

把上述每步的實際輸出貼到 PR 描述或 commit message，作為驗收證據。

---

## Self-Review 對照（spec → task）

- 常駐 DVT session（不再 per-call 握手）→ Task 1 + Task 2
- Line protocol（set/clear/ping/ready/fatal）→ Task 1（daemon）+ Task 2（supervisor）
- DVT session 掛 → supervisor backoff 重啟 + 重設座標 → Task 2（exit/ready/reapply 測試）
- daemon 連不上 tunneld → backoff 重試 → Task 2（backoff 測試）
- tunneld 掛 / 重開機 → launchd KeepAlive/RunAtLoad → Task 4 + Task 7 Step 4/5
- 重啟期間只暫存最新一筆 → Task 2（lastCoord 取代 queue）+ Task 2 re-apply 測試
- /location 回傳真實結果 + timeout → Task 3 + Task 2（timeout 測試）
- getStatus 區分「沒插手機」vs「通道未就緒」→ Task 2（getStatus 測試，`online`/`ready`）
- launcher tunneld 狀態改讀 launchctl → Task 5
- README 更新 → Task 6
- 手動真機驗證清單 → Task 7
