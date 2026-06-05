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
    kill: () => { d.killed = true; bus.emit('exit', -1, 'killed'); },
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

  test('a delivered request that times out restarts the wedged daemon', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    const p = pmd.setLocation(3, 3);
    spawnDaemon.latest().ready();          // request delivered
    jest.advanceTimersByTime(5000);        // no reply -> wedge -> kill -> exit
    const res = await p;
    expect(res.ok).toBe(false);
    jest.advanceTimersByTime(1000);        // backoff restart
    expect(spawnDaemon.created.length).toBe(2);
  });

  test('periodic ping restarts an idle wedged daemon', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    const p = pmd.setLocation(4, 4);
    const d = spawnDaemon.latest();
    d.ready();
    d.reply(d.sent[0].id, true);           // initial set succeeds
    await p;
    jest.advanceTimersByTime(10000);       // ping fires
    expect(d.sent).toContainEqual({ id: expect.any(Number), cmd: 'ping' });
    jest.advanceTimersByTime(5000);        // ping unanswered -> wedge -> kill -> exit
    jest.advanceTimersByTime(1000);        // backoff restart
    expect(spawnDaemon.created.length).toBe(2);
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

  test('ignores a duplicate exit from the same daemon (no double restart)', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    pmd.setLocation(1, 1);
    const d = spawnDaemon.latest();
    d.ready();
    d.exit(1, 'died');
    d.exit(-1, 'error after exit');   // stale second event must be ignored
    jest.advanceTimersByTime(1000);
    expect(spawnDaemon.created.length).toBe(2);  // exactly one restart, not two
  });

  test('settles a pre-ready request when daemon exits before ready', async () => {
    const spawnDaemon = daemonFactory();
    const pmd = createPmd({ spawnDaemon, execFile: fakeExecFile(ONLINE) });
    const p = pmd.setLocation(9, 9);             // queued before ready
    spawnDaemon.latest().exit(1, 'died early');  // never reached ready
    const res = await p;
    expect(res.ok).toBe(false);
    jest.advanceTimersByTime(1000);
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
    d2.ready();                                   // no active request -> re-apply lastCoord
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
