const express = require('express');
const { all, get, run, newId } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/reports/dashboard
router.get('/dashboard', authenticate, (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const firstDay = today.substring(0, 8) + '01';

        const total_rooms = get('SELECT COUNT(*) as v FROM rooms').v;
        const occupied_rooms = get("SELECT COUNT(*) as v FROM rooms WHERE status='occupied'").v;
        const today_bookings = get("SELECT COUNT(*) as v FROM bookings WHERE check_in=? AND status!='cancelled'", [today]).v;
        const month_revenue = get("SELECT COALESCE(SUM(amount),0) as v FROM payments WHERE paid_at>=?", [firstDay]).v;
        const total_customers = get('SELECT COUNT(*) as v FROM customers').v;
        const pending_checkouts = get("SELECT COUNT(*) as v FROM bookings WHERE check_out=? AND status='checked_in'", [today]).v;

        res.json({
            total_rooms, occupied_rooms,
            occupancy_rate: total_rooms > 0 ? Math.round((occupied_rooms / total_rooms) * 100) : 0,
            today_bookings, month_revenue, total_customers, pending_checkouts
        });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch dashboard' }); }
});

// GET /api/reports/revenue?period=daily|monthly&year=&month=
router.get('/revenue', authenticate, (req, res) => {
    try {
        const { period, year, month } = req.query;
        const y = parseInt(year) || new Date().getFullYear();
        if (period === 'daily') {
            const m = String(parseInt(month) || (new Date().getMonth() + 1)).padStart(2, '0');
            const data = all(
                `SELECT date(paid_at) as date, COALESCE(SUM(amount),0) as revenue, COUNT(*) as transactions
         FROM payments WHERE strftime('%Y',paid_at)=? AND strftime('%m',paid_at)=?
         GROUP BY date(paid_at) ORDER BY date`,
                [String(y), m]
            );
            res.json({ period: 'daily', year: y, month: parseInt(m), data });
        } else {
            const data = all(
                `SELECT CAST(strftime('%m',paid_at) AS INTEGER) as month, COALESCE(SUM(amount),0) as revenue, COUNT(*) as transactions
         FROM payments WHERE strftime('%Y',paid_at)=?
         GROUP BY strftime('%m',paid_at) ORDER BY month`,
                [String(y)]
            );
            res.json({ period: 'monthly', year: y, data });
        }
    } catch (err) { res.status(500).json({ error: 'Failed to fetch revenue' }); }
});

// GET /api/reports/occupancy
router.get('/occupancy', authenticate, (req, res) => {
    try {
        const { year } = req.query;
        const y = parseInt(year) || new Date().getFullYear();
        // Monthly occupancy approximation
        const totalRooms = get('SELECT COUNT(*) as v FROM rooms').v || 1;
        const data = [];
        for (let m = 1; m <= 12; m++) {
            const mStr = String(m).padStart(2, '0');
            const daysInMonth = new Date(y, m, 0).getDate();
            const from = `${y}-${mStr}-01`;
            const to = `${y}-${mStr}-${String(daysInMonth).padStart(2, '0')}`;
            const booked = get(
                `SELECT COUNT(DISTINCT room_id) as v FROM bookings WHERE status NOT IN ('cancelled')
         AND check_in <= ? AND check_out >= ?`,
                [to, from]
            ).v;
            data.push({ month: m, occupancy_rate: Math.round((booked / totalRooms) * 100) });
        }
        res.json({ data });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch occupancy' }); }
});

// GET /api/reports/room-stats
router.get('/room-stats', authenticate, (req, res) => {
    try {
        const rooms = all(
            `SELECT r.room_number, r.room_type, r.status,
       COUNT(b.id) as total_bookings,
       COALESCE(SUM(p.amount),0) as total_revenue,
       ROUND(AVG(julianday(b.check_out) - julianday(b.check_in)),1) as avg_stay_nights
       FROM rooms r
       LEFT JOIN bookings b ON r.id=b.room_id AND b.status!='cancelled'
       LEFT JOIN payments p ON b.id=p.booking_id
       GROUP BY r.id ORDER BY r.room_number`
        );
        res.json({ rooms });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch room stats' }); }
});

module.exports = router;
