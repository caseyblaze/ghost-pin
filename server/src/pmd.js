const { execFile: nodeExecFile } = require('child_process');

const BIN = 'pymobiledevice3';

// 接受注入的 execFile 以利測試；預設用 node 的 execFile
function createPmd(execFile = nodeExecFile) {
  function run(args) {
    return new Promise((resolve) => {
      execFile(BIN, args, (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr && stderr.trim()) || error.message;
          resolve({ ok: false, message: `pymobiledevice3 失敗: ${detail}` });
          return;
        }
        resolve({ ok: true, message: (stdout || '').trim() });
      });
    });
  }

  let activeSetProcess = null;

  function setLocation(lat, lng) {
    if (activeSetProcess) {
      activeSetProcess.kill();
      activeSetProcess = null;
    }
    return new Promise((resolve) => {
      const child = nodeExecFile(BIN, [
        'developer', 'dvt', 'simulate-location', 'set', '--tunnel', '',
        '--', String(lat), String(lng),
      ], (error, _stdout, stderr) => {
        if (child === activeSetProcess) activeSetProcess = null;
        if (error && error.signal !== 'SIGTERM' && error.signal !== 'SIGKILL') {
          const detail = (stderr && stderr.trim()) || error.message;
          resolve({ ok: false, message: `pymobiledevice3 失敗: ${detail}` });
          return;
        }
        resolve({ ok: true, message: '' });
      });
      activeSetProcess = child;
    });
  }

  function clearLocation() {
    if (activeSetProcess) {
      activeSetProcess.kill();
      activeSetProcess = null;
    }
    return run(['developer', 'dvt', 'simulate-location', 'clear', '--tunnel', '']);
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
