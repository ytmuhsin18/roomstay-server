const express = require('express');
const { all, get, run, newId } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/customers
router.get('/', authenticate, (req, res) => {
    try {
        const { search } = req.query;
        let sql = `SELECT c.*,
      COUNT(b.id) as total_bookings,
      MAX(b.check_in) as last_checkin,
      COALESCE(SUM(b.total_amount), 0) as total_spent
      FROM customers c LEFT JOIN bookings b ON c.id = b.customer_id AND b.status != 'cancelled'`;
        const params = [];
        if (search) { sql += ` WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        sql += ' GROUP BY c.id ORDER BY c.created_at DESC';
        res.json({ customers: all(sql, params) });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch customers' }); }
});

// GET /api/customers/:id
router.get('/:id', authenticate, (req, res) => {
    const customer = get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const bookings = all(
        `SELECT b.*, r.room_number, r.room_type FROM bookings b JOIN rooms r ON b.room_id = r.id
     WHERE b.customer_id = ? ORDER BY b.created_at DESC`,
        [req.params.id]
    );
    res.json({ customer, bookings });
});

// POST /api/customers
router.post('/', authenticate, (req, res) => {
    const { name, email, phone, address, id_type, id_number } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
    const id = newId();
    run(`INSERT INTO customers (id,name,email,phone,address,id_type,id_number) VALUES (?,?,?,?,?,?,?)`,
        [id, name, email || '', phone, address || '', id_type || '', id_number || '']);
    res.status(201).json({ customer: get('SELECT * FROM customers WHERE id=?', [id]) });
});

// PUT /api/customers/:id
router.put('/:id', authenticate, (req, res) => {
    const { name, email, phone, address, id_type, id_number } = req.body;
    run(`UPDATE customers SET name=?,email=?,phone=?,address=?,id_type=?,id_number=?,updated_at=datetime('now') WHERE id=?`,
        [name, email || '', phone, address || '', id_type || '', id_number || '', req.params.id]);
    const customer = get('SELECT * FROM customers WHERE id=?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ customer });
});

// DELETE /api/customers/:id
router.delete('/:id', authenticate, (req, res) => {
    const c = get('SELECT id FROM customers WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    run('DELETE FROM customers WHERE id=?', [req.params.id]);
    res.json({ message: 'Customer deleted' });
});

module.exports = router;
