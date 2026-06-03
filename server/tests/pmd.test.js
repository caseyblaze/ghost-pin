const { EventEmitter } = require('events');
const { createPmd } = require('../src/pmd');

function fakeExecFile(results) {
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

  describe('logError', () => {
    let appendSpy, statSyncSpy, existsSyncSpy;

    beforeEach(() => {
      appendSpy     = jest.spyOn(require('fs'), 'appendFileSync').mockImplementation(() => {});
      statSyncSpy   = jest.spyOn(require('fs'), 'statSync').mockReturnValue({ size: 0 });
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
});
