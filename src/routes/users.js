const express = require('express');
const bcrypt = require('bcryptjs');
const { all, get, run, newId } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../services/auditLogger');
const router = express.Router();

// GET /api/users (Admin only)
router.get('/', authenticate, authorize('admin'), (req, res) => {
    try {
        const users = all('SELECT id, name, email, role, created_at, updated_at FROM users ORDER BY name');
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// POST /api/users (Admin only)
router.post('/', authenticate, authorize('admin'), (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'name, email, and password are required' });
    }
    try {
        const existing = get('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) return res.status(400).json({ error: 'Email already registered' });

        const id = newId();
        const hash = bcrypt.hashSync(password, 10);
        const userRole = ['admin', 'manager', 'front_desk'].includes(role) ? role : 'front_desk';

        run(
            `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
            [id, name, email, hash, userRole]
        );

        logAudit(req, 'CREATE', 'USER', id, { name, email, role: userRole });
        res.status(201).json({ user: { id, name, email, role: userRole } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// PUT /api/users/:id (Admin only)
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const existing = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'User not found' });

        let hash = existing.password_hash;
        if (password) hash = bcrypt.hashSync(password, 10);

        const userRole = role && ['admin', 'manager', 'front_desk'].includes(role) ? role : existing.role;

        run(
            `UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), password_hash = ?, role = ?, updated_at = datetime('now') WHERE id = ?`,
            [name, email, hash, userRole, req.params.id]
        );

        logAudit(req, 'UPDATE', 'USER', req.params.id, { name, role: userRole });
        res.json({ user: get('SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = ?', [req.params.id]) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// DELETE /api/users/:id (Admin only)
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
    try {
        if (req.params.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own active admin account' });
        }
        const existing = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'User not found' });

        run('DELETE FROM users WHERE id = ?', [req.params.id]);
        logAudit(req, 'DELETE', 'USER', req.params.id, { email: existing.email });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
