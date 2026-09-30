const express = require('express');
const PDFDocument = require('pdfkit');
const { all, get, run, newId } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/payments
router.get('/', authenticate, (req, res) => {
    try {
        const { booking_id } = req.query;
        let sql = `SELECT p.*, b.booking_ref, c.name as customer_name, r.room_number
               FROM payments p JOIN bookings b ON p.booking_id = b.id
               JOIN customers c ON b.customer_id = c.id JOIN rooms r ON b.room_id = r.id`;
        const params = [];
        if (booking_id) { sql += ' WHERE p.booking_id = ?'; params.push(booking_id); }
        sql += ' ORDER BY p.paid_at DESC';
        res.json({ payments: all(sql, params) });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch payments' }); }
});

// POST /api/payments
router.post('/', authenticate, (req, res) => {
    const { booking_id, method, amount, transaction_ref, upi_id, card_last4, notes } = req.body;
    if (!booking_id || !method || !amount) return res.status(400).json({ error: 'booking_id, method, and amount are required' });
    const booking = get('SELECT * FROM bookings WHERE id=?', [booking_id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    try {
        const id = newId();
        run(`INSERT INTO payments (id,booking_id,method,amount,transaction_ref,upi_id,card_last4,notes,created_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
            [id, booking_id, method, amount, transaction_ref || '', upi_id || '', card_last4 || '', notes || '', req.user.id]);
        const totalPaid = get('SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE booking_id=?', [booking_id]).total;
        const paymentStatus = totalPaid >= booking.total_amount ? 'paid' : totalPaid > 0 ? 'partial' : 'pending';
        run("UPDATE bookings SET paid_amount=?,payment_status=?,updated_at=datetime('now') WHERE id=?", [totalPaid, paymentStatus, booking_id]);
        run(`INSERT INTO notifications (id,booking_id,type,title,message) VALUES (?,?,?,?,?)`,
            [newId(), booking_id, 'payment_received', 'Payment Received', `₹${amount} received via ${method} for booking ${booking.booking_ref}`]);
        res.status(201).json({ payment: get('SELECT * FROM payments WHERE id=?', [id]), payment_status: paymentStatus, paid_amount: totalPaid });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to record payment' }); }
});

// GET /api/payments/invoice/:booking_id
router.get('/invoice/:booking_id', authenticate, (req, res) => {
    try {
        const booking = get(
            `SELECT b.*, r.room_number, r.room_type, r.bed_type, c.name as customer_name,
       c.phone as customer_phone, c.email as customer_email, c.address as customer_address
       FROM bookings b JOIN rooms r ON b.room_id=r.id JOIN customers c ON b.customer_id=c.id
       WHERE b.id=?`,
            [req.params.booking_id]
        );
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        const payments = all('SELECT * FROM payments WHERE booking_id=? ORDER BY paid_at', [req.params.booking_id]);

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${booking.booking_ref}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(24).fillColor('#1e3a5f').text('ROOM MANAGEMENT', { align: 'center' });
        doc.fontSize(12).fillColor('#666').text('Admin Panel – Invoice', { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#1e3a5f');
        doc.moveDown();

        doc.fontSize(14).fillColor('#000').text('Invoice', { continued: true }).fillColor('#1e3a5f').text(`  #${booking.booking_ref}`, { align: 'right' });
        doc.fontSize(10).fillColor('#666').text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, { align: 'right' });
        doc.moveDown();

        // Customer block
        const bY = doc.y;
        doc.roundedRect(50, bY, 230, 90, 5).stroke('#ddd');
        doc.fontSize(9).fillColor('#999').text('BILL TO', 60, bY + 10);
        doc.fontSize(12).fillColor('#000').text(booking.customer_name, 60, bY + 25, { width: 210 });
        doc.fontSize(10).fillColor('#555')
            .text(booking.customer_phone || '', 60, bY + 42, { width: 210 })
            .text(booking.customer_email || '', 60, bY + 56, { width: 210 })
            .text(booking.customer_address || '', 60, bY + 70, { width: 210 });

        // Booking block
        doc.roundedRect(300, bY, 250, 90, 5).stroke('#ddd');
        doc.fontSize(9).fillColor('#999').text('BOOKING', 310, bY + 10);
        doc.fontSize(10).fillColor('#000')
            .text(`Room: ${booking.room_number} (${booking.room_type})`, 310, bY + 25)
            .text(`Bed: ${booking.bed_type}`, 310, bY + 40)
            .text(`In: ${new Date(booking.check_in).toLocaleDateString('en-IN')}`, 310, bY + 55)
            .text(`Out: ${new Date(booking.check_out).toLocaleDateString('en-IN')}`, 310, bY + 70);

        doc.moveDown(6);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#eee');
        doc.moveDown();

        // Line items
        doc.fillColor('#1e3a5f').fontSize(10).text('DESCRIPTION', 50).text('AMOUNT', 400, doc.y - 14, { width: 150, align: 'right' });
        doc.moveTo(50, doc.y + 2).lineTo(550, doc.y + 2).stroke('#1e3a5f');
        doc.moveDown();
        const nights = Math.ceil((new Date(booking.check_out) - new Date(booking.check_in)) / 86400000);
        doc.fillColor('#000').fontSize(10).text(`Room ${booking.room_number} – ${nights} night(s)`, 50);
        doc.text(`₹${parseFloat(booking.total_amount).toFixed(2)}`, 400, doc.y - 14, { width: 150, align: 'right' });
        doc.moveDown();

        if (payments.length > 0) {
            doc.fillColor('#333').fontSize(9).text('PAYMENTS RECEIVED:', 50);
            payments.forEach(p => {
                doc.fillColor('#555').text(`  ${new Date(p.paid_at).toLocaleDateString('en-IN')} – ${p.method.toUpperCase()}${p.transaction_ref ? ' (' + p.transaction_ref + ')' : ''}`, 50, doc.y, { width: 300 });
                doc.fillColor('#2d8a4e').text(`– ₹${parseFloat(p.amount).toFixed(2)}`, 400, doc.y - 12, { width: 150, align: 'right' });
                doc.moveDown(0.5);
            });
        }

        doc.moveTo(50, doc.y + 4).lineTo(550, doc.y + 4).stroke('#eee');
        doc.moveDown();
        doc.fillColor('#000').fontSize(11).text('Total:', 350).text(`₹${parseFloat(booking.total_amount).toFixed(2)}`, 400, doc.y - 14, { width: 150, align: 'right' });
        doc.moveDown(0.3);
        doc.fillColor('#2d8a4e').text('Paid:', 350).text(`₹${parseFloat(booking.paid_amount || 0).toFixed(2)}`, 400, doc.y - 14, { width: 150, align: 'right' });
        const balance = parseFloat(booking.total_amount) - parseFloat(booking.paid_amount || 0);
        doc.moveDown(0.3);
        if (balance > 0) {
            doc.fillColor('#c0392b').fontSize(12).text('Balance Due:', 350).text(`₹${balance.toFixed(2)}`, 400, doc.y - 16, { width: 150, align: 'right' });
        } else {
            doc.fillColor('#2d8a4e').fontSize(12).text('✓ PAID IN FULL', { align: 'center' });
        }
        doc.moveDown(2).fillColor('#999').fontSize(9).text('Thank you for choosing us!', { align: 'center' });
        doc.end();
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to generate invoice' }); }
});

module.exports = router;
