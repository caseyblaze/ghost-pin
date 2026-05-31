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

  function setLocation(lat, lng) {
    return run([
      'developer', 'dvt', 'simulate-location', 'set', '--tunnel', '',
      '--', String(lat), String(lng),
    ]);
  }

  function clearLocation() {
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
