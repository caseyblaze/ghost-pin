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
    pmd.setLocation(v.lat, v.lng);
    res.json({ ok: true, message: 'ok' });
  });

  router.post('/reset', async (_req, res) => {
    const result = await pmd.clearLocation();
    res.json({ ok: result.ok, message: result.message });
  });

  router.get('/status', async (req, res) => {
    const result = await pmd.getStatus();
    res.status(200).json({ ok: result.ok, message: result.message, data: { online: result.online } });
  });

  return router;
}

module.exports = { createRoutes };
