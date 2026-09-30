const express = require('express');
const { all, get, run, newId } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const generateBookingRef = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let ref = 'BK';
    for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
    return ref;
};

const calculateTotal = (roomId, checkIn, checkOut) => {
    const room = get('SELECT weekday_price, weekend_price FROM rooms WHERE id = ?', [roomId]);
    if (!room) throw new Error('Room not found');
    let total = 0;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const curr = new Date(start);
    while (curr < end) {
        const d = curr.getDay();
        total += (d === 0 || d === 6) ? room.weekend_price : room.weekday_price;
        curr.setDate(curr.getDate() + 1);
    }
    return total;
};

const bookingJoin = `SELECT b.*, r.room_number, r.room_type, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
  FROM bookings b JOIN rooms r ON b.room_id = r.id JOIN customers c ON b.customer_id = c.id`;

// GET /api/bookings
router.get('/', authenticate, (req, res) => {
    try {
        const { status, room_id, customer_id, from_date, to_date } = req.query;
        let sql = bookingJoin;
        const params = [];
        const where = [];
        if (status) { where.push('b.status = ?'); params.push(status); }
        if (room_id) { where.push('b.room_id = ?'); params.push(room_id); }
        if (customer_id) { where.push('b.customer_id = ?'); params.push(customer_id); }
        if (from_date) { where.push('b.check_in >= ?'); params.push(from_date); }
        if (to_date) { where.push('b.check_out <= ?'); params.push(to_date); }
        if (where.length) sql += ' WHERE ' + where.join(' AND ');
        sql += ' ORDER BY b.created_at DESC';
        res.json({ bookings: all(sql, params) });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch bookings' }); }
});

// GET /api/bookings/calendar
router.get('/calendar', authenticate, (req, res) => {
    try {
        const m = parseInt(req.query.month) || new Date().getMonth() + 1;
        const y = parseInt(req.query.year) || new Date().getFullYear();
        const daysInMonth = new Date(y, m, 0).getDate();
        const from = `${y}-${String(m).padStart(2, '0')}-01`;
        const to = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
        const bookings = all(
            `SELECT b.*, r.room_number, r.room_type, r.floor, c.name as customer_name
       FROM bookings b JOIN rooms r ON b.room_id = r.id JOIN customers c ON b.customer_id = c.id
       WHERE b.status != 'cancelled' AND b.check_in <= ? AND b.check_out >= ?
       ORDER BY r.room_number, b.check_in`,
            [to, from]
        );
        const rooms = all('SELECT id, room_number, room_type, status FROM rooms ORDER BY room_number');
        res.json({ bookings, rooms, month: m, year: y });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch calendar' }); }
});

// GET /api/bookings/:id
router.get('/:id', authenticate, (req, res) => {
    const booking = get(
        `SELECT b.*, r.room_number, r.room_type, r.bed_type, r.weekday_price, r.weekend_price,
     c.name as customer_name, c.phone as customer_phone, c.email as customer_email, c.address as customer_address, c.id as customer_id
     FROM bookings b JOIN rooms r ON b.room_id = r.id JOIN customers c ON b.customer_id = c.id
     WHERE b.id = ?`,
        [req.params.id]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const payments = all('SELECT * FROM payments WHERE booking_id = ? ORDER BY paid_at DESC', [req.params.id]);
    res.json({ booking, payments });
});

// POST /api/bookings
router.post('/', authenticate, (req, res) => {
    const { room_id, customer_id, check_in, check_out, adults, children, notes, special_requests } = req.body;
    if (!room_id || !customer_id || !check_in || !check_out)
        return res.status(400).json({ error: 'room_id, customer_id, check_in, check_out are required' });
    try {
        const conflict = get(
            `SELECT id FROM bookings WHERE room_id = ? AND status NOT IN ('cancelled','checked_out')
       AND NOT (check_out <= ? OR check_in >= ?)`,
            [room_id, check_in, check_out]
        );
        if (conflict) return res.status(409).json({ error: 'Room is not available for the selected dates' });
        const total_amount = calculateTotal(room_id, check_in, check_out);
        let bookingRef;
        for (let i = 0; i < 10; i++) {
            const ref = generateBookingRef();
            if (!get('SELECT id FROM bookings WHERE booking_ref = ?', [ref])) { bookingRef = ref; break; }
        }
        const id = newId();
        run(`INSERT INTO bookings (id,booking_ref,room_id,customer_id,check_in,check_out,adults,children,total_amount,notes,special_requests)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [id, bookingRef, room_id, customer_id, check_in, check_out, adults || 1, children || 0, total_amount, notes || '', special_requests || '']);
        const today = new Date().toISOString().split('T')[0];
        if (check_in === today) run("UPDATE rooms SET status='occupied' WHERE id=?", [room_id]);
        const notifId = newId();
        run(`INSERT INTO notifications (id,booking_id,type,title,message) VALUES (?,?,?,?,?)`,
            [notifId, id, 'booking_confirmed', `Booking Confirmed - ${bookingRef}`, `New booking ${bookingRef} created. Check-in: ${check_in}, Check-out: ${check_out}`]);
        res.status(201).json({ booking: get('SELECT * FROM bookings WHERE id=?', [id]) });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create booking' }); }
});

// PUT /api/bookings/:id
router.put('/:id', authenticate, (req, res) => {
    const booking = get('SELECT * FROM bookings WHERE id=?', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const { check_in, check_out, adults, children, notes, special_requests, status } = req.body;
    const newIn = check_in || booking.check_in;
    const newOut = check_out || booking.check_out;
    const total = (check_in || check_out) ? calculateTotal(booking.room_id, newIn, newOut) : booking.total_amount;
    run(`UPDATE bookings SET check_in=?,check_out=?,adults=?,children=?,notes=?,special_requests=?,
       status=COALESCE(?,status),total_amount=?,updated_at=datetime('now') WHERE id=?`,
        [newIn, newOut, adults ?? booking.adults, children ?? booking.children, notes ?? booking.notes, special_requests ?? booking.special_requests, status || null, total, req.params.id]);
    res.json({ booking: get('SELECT * FROM bookings WHERE id=?', [req.params.id]) });
});

// POST /api/bookings/:id/checkin
router.post('/:id/checkin', authenticate, (req, res) => {
    const b = get("SELECT * FROM bookings WHERE id=? AND status='confirmed'", [req.params.id]);
    if (!b) return res.status(400).json({ error: 'Booking not found or cannot be checked in' });
    run("UPDATE bookings SET status='checked_in',updated_at=datetime('now') WHERE id=?", [req.params.id]);
    run("UPDATE rooms SET status='occupied' WHERE id=?", [b.room_id]);
    run(`INSERT INTO notifications (id,booking_id,type,title,message) VALUES (?,?,?,?,?)`,
        [newId(), req.params.id, 'checkin_done', 'Guest Checked In', `Guest for booking ${b.booking_ref} has checked in`]);
    res.json({ booking: get('SELECT * FROM bookings WHERE id=?', [req.params.id]) });
});

// POST /api/bookings/:id/checkout
router.post('/:id/checkout', authenticate, (req, res) => {
    const b = get("SELECT * FROM bookings WHERE id=? AND status='checked_in'", [req.params.id]);
    if (!b) return res.status(400).json({ error: 'Booking not found or cannot be checked out' });
    run("UPDATE bookings SET status='checked_out',updated_at=datetime('now') WHERE id=?", [req.params.id]);
    run("UPDATE rooms SET status='available' WHERE id=?", [b.room_id]);
    run(`INSERT INTO notifications (id,booking_id,type,title,message) VALUES (?,?,?,?,?)`,
        [newId(), req.params.id, 'checkout_done', 'Guest Checked Out', `Guest for booking ${b.booking_ref} has checked out.`]);
    res.json({ booking: get('SELECT * FROM bookings WHERE id=?', [req.params.id]) });
});

// POST /api/bookings/:id/cancel
router.post('/:id/cancel', authenticate, (req, res) => {
    const b = get("SELECT * FROM bookings WHERE id=? AND status NOT IN ('checked_out','cancelled')", [req.params.id]);
    if (!b) return res.status(400).json({ error: 'Booking not found or cannot be cancelled' });
    run("UPDATE bookings SET status='cancelled',updated_at=datetime('now') WHERE id=?", [req.params.id]);
    run("UPDATE rooms SET status='available' WHERE id=? AND status='occupied'", [b.room_id]);
    run(`INSERT INTO notifications (id,booking_id,type,title,message) VALUES (?,?,?,?,?)`,
        [newId(), req.params.id, 'cancellation', 'Booking Cancelled', `Booking ${b.booking_ref} has been cancelled`]);
    res.json({ booking: get('SELECT * FROM bookings WHERE id=?', [req.params.id]) });
});

module.exports = router;
