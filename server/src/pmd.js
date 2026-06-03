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
