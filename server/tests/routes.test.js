const express = require('express');
const request = require('supertest');
const { createRoutes } = require('../src/routes');

function makeApp(pmd) {
  const app = express();
  app.use(express.json());
  app.use(createRoutes(pmd));
  return app;
}

describe('routes', () => {
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

  test('POST /reset calls pmd.clearLocation', async () => {
    const pmd = {
      clearLocation: jest.fn().mockResolvedValue({ ok: true, message: 'cleared' }),
    };
    const res = await request(makeApp(pmd)).post('/reset').send();
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(pmd.clearLocation).toHaveBeenCalled();
  });

  test('GET /status returns device status', async () => {
    const pmd = {
      getStatus: jest.fn().mockResolvedValue({ ok: true, online: true, message: '裝置已連線' }),
    };
    const res = await request(makeApp(pmd)).get('/status');
    expect(res.status).toBe(200);
    expect(res.body.data.online).toBe(true);
  });
});
