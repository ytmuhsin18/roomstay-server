const express = require('express');
const { all, get, run } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { syncAllChannels } = require('../services/channelManager');
const { logAudit } = require('../services/auditLogger');
const router = express.Router();

// GET /api/channels
router.get('/', authenticate, (req, res) => {
    try {
        const channels = all('SELECT id, name, code, api_key, property_id, enabled, status, last_sync, updated_at FROM channels ORDER BY name');
        res.json({ channels });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// PUT /api/channels/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
    const { api_key, api_secret, property_id, enabled } = req.body;
    try {
        const ch = get('SELECT * FROM channels WHERE id = ?', [req.params.id]);
        if (!ch) return res.status(404).json({ error: 'Channel not found' });

        const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : ch.enabled;
        const newStatus = newEnabled ? 'connected' : 'disconnected';

        run(
            `UPDATE channels SET api_key = COALESCE(?, api_key), api_secret = COALESCE(?, api_secret),
       property_id = COALESCE(?, property_id), enabled = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`,
            [api_key || null, api_secret || null, property_id || null, newEnabled, newStatus, req.params.id]
        );

        logAudit(req, 'UPDATE', 'CHANNEL', req.params.id, { channel: ch.name, enabled: newEnabled, propertyId: property_id });
        res.json({ channel: get('SELECT * FROM channels WHERE id = ?', [req.params.id]) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update channel credentials' });
    }
});

// POST /api/channels/sync
router.post('/sync', authenticate, async (req, res) => {
    try {
        const results = await syncAllChannels();
        logAudit(req, 'SYNC', 'CHANNEL', null, { results });
        res.json({ message: 'Channel sync completed', results });
    } catch (err) {
        res.status(500).json({ error: 'Channel sync failed', details: err.message });
    }
});

// GET /api/channels/bookings
router.get('/bookings', authenticate, (req, res) => {
    try {
        const channelBookings = all(
            `SELECT cb.*, c.name as channel_name, b.booking_ref, b.room_id, r.room_number
       FROM channel_bookings cb
       LEFT JOIN channels c ON cb.channel_code = c.code
       LEFT JOIN bookings b ON cb.booking_id = b.id
       LEFT JOIN rooms r ON b.room_id = r.id
       ORDER BY cb.synced_at DESC LIMIT 50`
        );
        res.json({ channel_bookings: channelBookings });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch channel bookings' });
    }
});

module.exports = router;
