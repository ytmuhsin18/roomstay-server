const express = require('express');
const { all, get, run, newId } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/notifications
router.get('/', authenticate, (req, res) => {
    try {
        const { unread_only } = req.query;
        let sql = `SELECT n.*, b.booking_ref FROM notifications n LEFT JOIN bookings b ON n.booking_id = b.id`;
        if (unread_only === 'true') sql += ' WHERE n.is_read = 0';
        sql += ' ORDER BY n.created_at DESC LIMIT 100';
        const unread_count = get('SELECT COUNT(*) as v FROM notifications WHERE is_read=0').v;
        res.json({ notifications: all(sql), unread_count });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch notifications' }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, (req, res) => {
    run('UPDATE notifications SET is_read=1 WHERE id=?', [req.params.id]);
    res.json({ message: 'Marked as read' });
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, (req, res) => {
    run('UPDATE notifications SET is_read=1 WHERE is_read=0');
    res.json({ message: 'All marked as read' });
});

// POST /api/notifications/send-reminder
router.post('/send-reminder', authenticate, (req, res) => {
    const { booking_id, type, message } = req.body;
    const booking = get('SELECT * FROM bookings WHERE id=?', [booking_id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const id = newId();
    run(`INSERT INTO notifications (id,booking_id,type,title,message,channel) VALUES (?,?,?,?,?,?)`,
        [id, booking_id, type || 'reminder', `Reminder: ${booking.booking_ref}`, message || `Reminder for booking ${booking.booking_ref}`, 'in_app']);
    res.status(201).json({ notification: get('SELECT * FROM notifications WHERE id=?', [id]) });
});

// DELETE /api/notifications/:id
router.delete('/:id', authenticate, (req, res) => {
    run('DELETE FROM notifications WHERE id=?', [req.params.id]);
    res.json({ message: 'Notification deleted' });
});

module.exports = router;
