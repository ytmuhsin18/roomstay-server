const express = require('express');
const { all, get, run, newId } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { calculateDynamicPrice } = require('../services/pricingEngine');
const { logAudit } = require('../services/auditLogger');
const router = express.Router();

// GET /api/pricing
router.get('/', authenticate, (req, res) => {
    try {
        const rules = all('SELECT * FROM pricing_rules ORDER BY priority ASC, created_at DESC');
        res.json({ rules });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch pricing rules' });
    }
});

// POST /api/pricing
router.post('/', authenticate, authorize('admin', 'manager'), (req, res) => {
    const { name, rule_type, adjustment_type, value, start_date, end_date, days_of_week, room_type, priority, enabled } = req.body;
    if (!name || !rule_type || !adjustment_type || value === undefined) {
        return res.status(400).json({ error: 'name, rule_type, adjustment_type, value are required' });
    }
    try {
        const id = newId();
        const daysJson = JSON.stringify(Array.isArray(days_of_week) ? days_of_week : []);
        run(
            `INSERT INTO pricing_rules (id, name, rule_type, adjustment_type, value, start_date, end_date, days_of_week, room_type, priority, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name, rule_type, adjustment_type, parseFloat(value), start_date || null, end_date || null, daysJson, room_type || 'all', parseInt(priority || 10), enabled !== false ? 1 : 0]
        );

        logAudit(req, 'CREATE', 'PRICING_RULE', id, { name, value, rule_type });
        res.status(201).json({ rule: get('SELECT * FROM pricing_rules WHERE id = ?', [id]) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create pricing rule' });
    }
});

// PUT /api/pricing/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
    const { name, rule_type, adjustment_type, value, start_date, end_date, days_of_week, room_type, priority, enabled } = req.body;
    try {
        const existing = get('SELECT * FROM pricing_rules WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'Pricing rule not found' });

        const daysJson = days_of_week !== undefined ? JSON.stringify(Array.isArray(days_of_week) ? days_of_week : []) : JSON.stringify(existing.days_of_week);

        run(
            `UPDATE pricing_rules SET name = COALESCE(?, name), rule_type = COALESCE(?, rule_type),
       adjustment_type = COALESCE(?, adjustment_type), value = COALESCE(?, value),
       start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date),
       days_of_week = ?, room_type = COALESCE(?, room_type),
       priority = COALESCE(?, priority), enabled = COALESCE(?, enabled),
       updated_at = datetime('now') WHERE id = ?`,
            [name, rule_type, adjustment_type, value, start_date, end_date, daysJson, room_type, priority, enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled, req.params.id]
        );

        logAudit(req, 'UPDATE', 'PRICING_RULE', req.params.id, { name, value });
        res.json({ rule: get('SELECT * FROM pricing_rules WHERE id = ?', [req.params.id]) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update pricing rule' });
    }
});

// DELETE /api/pricing/:id
router.delete('/:id', authenticate, authorize('admin', 'manager'), (req, res) => {
    try {
        const existing = get('SELECT * FROM pricing_rules WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'Pricing rule not found' });

        run('DELETE FROM pricing_rules WHERE id = ?', [req.params.id]);
        logAudit(req, 'DELETE', 'PRICING_RULE', req.params.id, { name: existing.name });
        res.json({ message: 'Pricing rule deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete pricing rule' });
    }
});

// POST /api/pricing/preview
router.post('/preview', authenticate, (req, res) => {
    const { room_id, check_in, check_out } = req.body;
    if (!room_id || !check_in || !check_out) {
        return res.status(400).json({ error: 'room_id, check_in, check_out are required' });
    }
    try {
        const result = calculateDynamicPrice(room_id, check_in, check_out);
        res.json({ preview: result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
