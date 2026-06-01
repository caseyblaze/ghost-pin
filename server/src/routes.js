const express = require('express');
const { validateCoords } = require('./validate');

function createRoutes(pmd) {
  const router = express.Router();

  router.post('/location', (req, res) => {
    const { lat, lng } = req.body || {};
    const v = validateCoords(lat, lng);
    if (!v.ok) {
      res.status(400).json({ ok: false, message: v.message });
      return;
    }
    res.json({ ok: true, message: 'ok' });
    pmd.setLocation(v.lat, v.lng);
  });

  router.post('/reset', (_req, res) => {
    res.json({ ok: true, message: 'ok' });
    pmd.clearLocation();
  });

  router.get('/status', async (req, res) => {
    const result = await pmd.getStatus();
    res.status(200).json({ ok: result.ok, message: result.message, data: { online: result.online } });
  });

  return router;
}

module.exports = { createRoutes };
