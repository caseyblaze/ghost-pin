const { createPmd } = require('../src/pmd');

function fakeExecFile(result) {
  // 記錄呼叫並依 result 回呼
  const calls = [];
  const fn = (file, args, cb) => {
    calls.push({ file, args });
    if (result.error) cb(result.error, '', result.stderr || '');
    else cb(null, result.stdout || '', '');
  };
  fn.calls = calls;
  return fn;
}

describe('pmd', () => {
  test('setLocation builds dvt set command with coords as separate args', async () => {
    const exec = fakeExecFile({ stdout: 'ok' });
    const pmd = createPmd(exec);
    const res = await pmd.setLocation(25.0330, 121.5654);
    expect(res).toEqual({ ok: true, message: 'ok' });
    expect(exec.calls[0].file).toBe('pymobiledevice3');
    expect(exec.calls[0].args).toEqual([
      'developer', 'dvt', 'simulate-location', 'set', '--tunnel', '', '--', '25.033', '121.5654'
    ]);
  });

  test('clearLocation builds dvt clear command', async () => {
    const exec = fakeExecFile({ stdout: 'cleared' });
    const pmd = createPmd(exec);
    const res = await pmd.clearLocation();
    expect(res).toEqual({ ok: true, message: 'cleared' });
    expect(exec.calls[0].args).toEqual([
      'developer', 'dvt', 'simulate-location', 'clear', '--tunnel', ''
    ]);
  });

  test('getStatus returns online when usbmux lists a device', async () => {
    const exec = fakeExecFile({ stdout: '[{"Identifier": "abc123"}]' });
    const pmd = createPmd(exec);
    const res = await pmd.getStatus();
    expect(res).toEqual({ ok: true, online: true, message: '裝置已連線' });
    expect(exec.calls[0].args).toEqual(['usbmux', 'list']);
  });

  test('getStatus returns offline when usbmux lists nothing', async () => {
    const exec = fakeExecFile({ stdout: '[]' });
    const pmd = createPmd(exec);
    const res = await pmd.getStatus();
    expect(res).toEqual({ ok: true, online: false, message: '無裝置連線' });
  });

  test('setLocation wraps CLI failure with stderr summary', async () => {
    const exec = fakeExecFile({ error: new Error('exit 1'), stderr: 'Tunnel not found' });
    const pmd = createPmd(exec);
    const res = await pmd.setLocation(0, 0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Tunnel not found');
  });
});
