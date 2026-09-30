const express = require('express');
const { all, get } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// GET /api/audit
router.get('/', authenticate, authorize('admin', 'manager'), (req, res) => {
    try {
        const { action, entity, user_id, limit, offset } = req.query;
        let sql = 'SELECT * FROM audit_logs';
        const params = [];
        const where = [];

        if (action) { where.push('action = ?'); params.push(action); }
        if (entity) { where.push('entity = ?'); params.push(entity); }
        if (user_id) { where.push('user_id = ?'); params.push(user_id); }

        if (where.length) sql += ' WHERE ' + where.join(' AND ');
        sql += ' ORDER BY created_at DESC';

        const maxLimit = parseInt(limit || '100');
        const pageOffset = parseInt(offset || '0');
        sql += ` LIMIT ${maxLimit} OFFSET ${pageOffset}`;

        const logs = all(sql, params);
        const totalCount = get('SELECT COUNT(*) as v FROM audit_logs').v;

        res.json({ audit_logs: logs, total: totalCount });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

module.exports = router;
