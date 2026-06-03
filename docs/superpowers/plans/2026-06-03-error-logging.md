# Error Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically append pymobiledevice3 failures to `errors.log` on the Mac server, with a 1 MB size cap.

**Architecture:** Add `logError` to `pmd.js`, call it in the two pymobiledevice3 failure paths (`setLocation` spawn close + `spawnPmd` close). Also make `spawnFn` injectable in `createPmd` so tests can verify spawn args — fixing 3 tests broken by the prior spawn refactor.

**Tech Stack:** Node.js `fs`, `child_process.spawn`, Jest

---

### Task 1: Fix broken tests by making spawn injectable

The prior refactor moved `setLocation` and `clearLocation` to use `spawn` directly, breaking the test harness that only injects `execFile`.

**Files:**
- Modify: `server/src/pmd.js`
- Modify: `server/tests/pmd.test.js`

- [ ] **Step 1: Add fakeSpawn helper to test file**

Replace the contents of `server/tests/pmd.test.js` with:

```js
const { EventEmitter } = require('events');
const { createPmd } = require('../src/pmd');

function fakeExecFile(results) {
  // results: array of { error?, stdout?, stderr? } consumed in order
  if (!Array.isArray(results)) results = [results];
  const calls = [];
  const fn = (file, args, cb) => {
    calls.push({ file, args });
    const r = results.shift() || { stdout: '[]' };
    if (r.error) cb(r.error, '', r.stderr || '');
    else cb(null, r.stdout || '', '');
  };
  fn.calls = calls;
  return fn;
}

function fakeSpawn({ code = 0, stderr = '' } = {}) {
  const calls = [];
  const fn = (file, args) => {
    calls.push({ file, args });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    process.nextTick(() => {
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code, null);
    });
    return child;
  };
  fn.calls = calls;
  return fn;
}

// usbmux list response with one device (UDID = 'ABC123')
const ONE_DEVICE = { stdout: '[{"SerialNumber":"ABC123"}]' };
const NO_DEVICE  = { stdout: '[]' };

describe('pmd', () => {
  test('setLocation builds dvt set command with UDID and coords', async () => {
    const exec  = fakeExecFile(ONE_DEVICE);
    const spawn = fakeSpawn();
    const pmd   = createPmd(exec, spawn);
    const res   = await pmd.setLocation(25.0330, 121.5654);
    expect(res).toEqual({ ok: true, message: '' });
    expect(spawn.calls[0].file).toBe('pymobiledevice3');
    expect(spawn.calls[0].args).toEqual([
      'developer', 'dvt', 'simulate-location', 'set', '--tunnel', 'ABC123',
      '--', '25.033', '121.5654',
    ]);
  });

  test('setLocation falls back to empty tunnel when no device', async () => {
    const exec  = fakeExecFile(NO_DEVICE);
    const spawn = fakeSpawn();
    const pmd   = createPmd(exec, spawn);
    await pmd.setLocation(0, 0);
    expect(spawn.calls[0].args).toContain('--tunnel');
    const tunnelIdx = spawn.calls[0].args.indexOf('--tunnel');
    expect(spawn.calls[0].args[tunnelIdx + 1]).toBe('');
  });

  test('clearLocation builds dvt clear command with UDID', async () => {
    const exec  = fakeExecFile(ONE_DEVICE);
    const spawn = fakeSpawn();
    const pmd   = createPmd(exec, spawn);
    const res   = await pmd.clearLocation();
    expect(res).toEqual({ ok: true, message: '' });
    expect(spawn.calls[0].args).toEqual([
      'developer', 'dvt', 'simulate-location', 'clear', '--tunnel', 'ABC123',
    ]);
  });

  test('getStatus returns online when usbmux lists a device', async () => {
    const exec = fakeExecFile({ stdout: '[{"SerialNumber":"abc123"}]' });
    const pmd  = createPmd(exec);
    const res  = await pmd.getStatus();
    expect(res).toEqual({ ok: true, online: true, message: '裝置已連線' });
    expect(exec.calls[0].args).toEqual(['usbmux', 'list']);
  });

  test('getStatus returns offline when usbmux lists nothing', async () => {
    const exec = fakeExecFile(NO_DEVICE);
    const pmd  = createPmd(exec);
    const res  = await pmd.getStatus();
    expect(res).toEqual({ ok: true, online: false, message: '無裝置連線' });
  });

  test('setLocation wraps CLI failure with stderr summary', async () => {
    const exec  = fakeExecFile(ONE_DEVICE);
    const spawn = fakeSpawn({ code: 1, stderr: 'Tunnel not found' });
    const pmd   = createPmd(exec, spawn);
    const res   = await pmd.setLocation(0, 0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Tunnel not found');
  });
});
```

- [ ] **Step 2: Make spawnFn injectable in createPmd**

In `server/src/pmd.js`, move `spawnPmd` inside `createPmd` and add `spawnFn = spawn` parameter:

```js
const { execFile: nodeExecFile, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const BIN      = 'pymobiledevice3';
const LOG_PATH = path.join(__dirname, '..', '..', 'errors.log');

function getUdid(execFile) {
  return new Promise((resolve) => {
    execFile(BIN, ['usbmux', 'list'], (error, stdout) => {
      if (error) { resolve(null); return; }
      try {
        const list = JSON.parse(stdout || '[]');
        resolve((Array.isArray(list) && list.length > 0) ? list[0].SerialNumber : null);
      } catch (_) { resolve(null); }
    });
  });
}

function createPmd(execFile = nodeExecFile, spawnFn = spawn) {
  function spawnPmd(args) {
    return new Promise((resolve) => {
      const child = spawnFn(BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (code) => {
        if (code !== 0) {
          resolve({ ok: false, message: `pymobiledevice3 失敗: ${stderr.trim()}` });
        } else {
          resolve({ ok: true, message: stdout.trim() });
        }
      });
      child.on('error', (err) => {
        resolve({ ok: false, message: `pymobiledevice3 失敗: ${err.message}` });
      });
    });
  }

  let activeSetProcess = null;

  function setLocation(lat, lng) {
    if (activeSetProcess) {
      activeSetProcess.kill();
      activeSetProcess = null;
    }
    return getUdid(execFile).then((udid) => new Promise((resolve) => {
      const child = spawnFn(BIN, [
        'developer', 'dvt', 'simulate-location', 'set', '--tunnel', udid || '',
        '--', String(lat), String(lng),
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d; });

      child.on('close', (code, signal) => {
        if (child === activeSetProcess) activeSetProcess = null;
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
          resolve({ ok: false, message: `pymobiledevice3 失敗: ${stderr.trim()}` });
        } else {
          resolve({ ok: true, message: '' });
        }
      });
      child.on('error', (err) => {
        resolve({ ok: false, message: `pymobiledevice3 失敗: ${err.message}` });
      });

      activeSetProcess = child;
    }));
  }

  function clearLocation() {
    if (activeSetProcess) {
      activeSetProcess.kill();
      activeSetProcess = null;
    }
    return getUdid(execFile).then((udid) =>
      spawnPmd(['developer', 'dvt', 'simulate-location', 'clear', '--tunnel', udid || ''])
    );
  }

  function getStatus() {
    return new Promise((resolve) => {
      execFile(BIN, ['usbmux', 'list'], (error, stdout) => {
        if (error) {
          resolve({ ok: false, online: false, message: '無法查詢裝置狀態' });
          return;
        }
        let online = false;
        try {
          const list = JSON.parse(stdout || '[]');
          online = Array.isArray(list) && list.length > 0;
        } catch (_) {
          online = false;
        }
        resolve({ ok: true, online, message: online ? '裝置已連線' : '無裝置連線' });
      });
    });
  }

  return { setLocation, clearLocation, getStatus };
}

module.exports = { createPmd };
```

- [ ] **Step 3: Run tests and confirm all pass**

```bash
cd server && npx jest tests/pmd.test.js --no-coverage
```

Expected: all 6 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/pmd.js server/tests/pmd.test.js
git commit -m "refactor: make spawnFn injectable in createPmd, fix broken pmd tests"
```

---

### Task 2: Add logError and wire up call sites

**Files:**
- Modify: `server/src/pmd.js` (add `logError`, call in 2 failure paths)
- Modify: `.gitignore`
- Modify: `server/tests/pmd.test.js` (add logError tests)

- [ ] **Step 1: Write the failing tests first**

Add these two tests to the `describe('pmd')` block in `server/tests/pmd.test.js`:

```js
describe('logError', () => {
  let appendSpy, statSyncSpy, existsSyncSpy;

  beforeEach(() => {
    appendSpy    = jest.spyOn(require('fs'), 'appendFileSync').mockImplementation(() => {});
    statSyncSpy  = jest.spyOn(require('fs'), 'statSync').mockReturnValue({ size: 0 });
    existsSyncSpy = jest.spyOn(require('fs'), 'existsSync').mockReturnValue(false);
  });

  afterEach(() => jest.restoreAllMocks());

  test('setLocation failure writes to errors.log', async () => {
    const exec  = fakeExecFile(ONE_DEVICE);
    const spawn = fakeSpawn({ code: 1, stderr: 'tunnel error' });
    const pmd   = createPmd(exec, spawn);
    await pmd.setLocation(1, 2);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const written = appendSpy.mock.calls[0][1];
    expect(written).toMatch(/set-location 1 2/);
    expect(written).toMatch(/tunnel error/);
  });

  test('clearLocation failure writes to errors.log', async () => {
    const exec  = fakeExecFile(ONE_DEVICE);
    const spawn = fakeSpawn({ code: 1, stderr: 'clear error' });
    const pmd   = createPmd(exec, spawn);
    await pmd.clearLocation();
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const written = appendSpy.mock.calls[0][1];
    expect(written).toMatch(/clear-location/);
    expect(written).toMatch(/clear error/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && npx jest tests/pmd.test.js --no-coverage
```

Expected: the 2 new logError tests FAIL (logError not implemented yet).

- [ ] **Step 3: Add logError and wire up call sites in pmd.js**

Add `logError` after the `getUdid` function, and call it in both failure paths:

```js
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
```

In `spawnPmd`, replace the failure resolve with:

```js
child.on('close', (code) => {
  if (code !== 0) {
    const msg = `pymobiledevice3 失敗: ${stderr.trim()}`;
    logError(args.slice(0, 4).join(' '), msg);   // e.g. "developer dvt simulate-location clear"
    resolve({ ok: false, message: msg });
  } else {
    resolve({ ok: true, message: stdout.trim() });
  }
});
```

In `setLocation` close handler, replace the failure resolve with:

```js
if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
  const msg = `pymobiledevice3 失敗: ${stderr.trim()}`;
  logError(`set-location ${lat} ${lng}`, msg);
  resolve({ ok: false, message: msg });
} else {
  resolve({ ok: true, message: '' });
}
```

In `spawnPmd`, the `args.slice(0,4).join(' ')` produces `developer dvt simulate-location clear` which is clear enough, but for the test to match `clear-location` we need an explicit label. Change `spawnPmd` signature to accept an optional label:

```js
function spawnPmd(args, label) {
  return new Promise((resolve) => {
    // ...
    child.on('close', (code) => {
      if (code !== 0) {
        const msg = `pymobiledevice3 失敗: ${stderr.trim()}`;
        logError(label || args.slice(0, 4).join(' '), msg);
        resolve({ ok: false, message: msg });
      } else {
        resolve({ ok: true, message: stdout.trim() });
      }
    });
```

And call it from `clearLocation` as:

```js
spawnPmd(['developer', 'dvt', 'simulate-location', 'clear', '--tunnel', udid || ''], 'clear-location')
```

And `setLocation`'s label is `set-location ${lat} ${lng}`.

The full updated `pmd.js` after this task:

```js
const { execFile: nodeExecFile, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const BIN      = 'pymobiledevice3';
const LOG_PATH = path.join(__dirname, '..', '..', 'errors.log');

function getUdid(execFile) {
  return new Promise((resolve) => {
    execFile(BIN, ['usbmux', 'list'], (error, stdout) => {
      if (error) { resolve(null); return; }
      try {
        const list = JSON.parse(stdout || '[]');
        resolve((Array.isArray(list) && list.length > 0) ? list[0].SerialNumber : null);
      } catch (_) { resolve(null); }
    });
  });
}

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

function createPmd(execFile = nodeExecFile, spawnFn = spawn) {
  function spawnPmd(args, label) {
    return new Promise((resolve) => {
      const child = spawnFn(BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (code) => {
        if (code !== 0) {
          const msg = `pymobiledevice3 失敗: ${stderr.trim()}`;
          logError(label || args.slice(0, 4).join(' '), msg);
          resolve({ ok: false, message: msg });
        } else {
          resolve({ ok: true, message: stdout.trim() });
        }
      });
      child.on('error', (err) => {
        resolve({ ok: false, message: `pymobiledevice3 失敗: ${err.message}` });
      });
    });
  }

  let activeSetProcess = null;

  function setLocation(lat, lng) {
    if (activeSetProcess) {
      activeSetProcess.kill();
      activeSetProcess = null;
    }
    return getUdid(execFile).then((udid) => new Promise((resolve) => {
      const child = spawnFn(BIN, [
        'developer', 'dvt', 'simulate-location', 'set', '--tunnel', udid || '',
        '--', String(lat), String(lng),
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d; });

      child.on('close', (code, signal) => {
        if (child === activeSetProcess) activeSetProcess = null;
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
          const msg = `pymobiledevice3 失敗: ${stderr.trim()}`;
          logError(`set-location ${lat} ${lng}`, msg);
          resolve({ ok: false, message: msg });
        } else {
          resolve({ ok: true, message: '' });
        }
      });
      child.on('error', (err) => {
        resolve({ ok: false, message: `pymobiledevice3 失敗: ${err.message}` });
      });

      activeSetProcess = child;
    }));
  }

  function clearLocation() {
    if (activeSetProcess) {
      activeSetProcess.kill();
      activeSetProcess = null;
    }
    return getUdid(execFile).then((udid) =>
      spawnPmd(
        ['developer', 'dvt', 'simulate-location', 'clear', '--tunnel', udid || ''],
        'clear-location',
      )
    );
  }

  function getStatus() {
    return new Promise((resolve) => {
      execFile(BIN, ['usbmux', 'list'], (error, stdout) => {
        if (error) {
          resolve({ ok: false, online: false, message: '無法查詢裝置狀態' });
          return;
        }
        let online = false;
        try {
          const list = JSON.parse(stdout || '[]');
          online = Array.isArray(list) && list.length > 0;
        } catch (_) {
          online = false;
        }
        resolve({ ok: true, online, message: online ? '裝置已連線' : '無裝置連線' });
      });
    });
  }

  return { setLocation, clearLocation, getStatus };
}

module.exports = { createPmd };
```

- [ ] **Step 4: Add errors.log to .gitignore**

Append to `<project-root>/.gitignore`:

```
errors.log
```

- [ ] **Step 5: Run all tests and verify they pass**

```bash
cd server && npx jest --no-coverage
```

Expected: all 18 tests PASS (6 pmd + 2 logError + existing routes + validate).

- [ ] **Step 6: Commit**

```bash
git add server/src/pmd.js server/tests/pmd.test.js ../.gitignore
git commit -m "feat: log pymobiledevice3 errors to errors.log"
```
