const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { all, get, run, newId } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
require('dotenv').config();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../', process.env.UPLOAD_DIR || 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `room-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Images only')) });

// GET /api/rooms
router.get('/', authenticate, (req, res) => {
    try {
        const { status, room_type } = req.query;
        let sql = 'SELECT * FROM rooms';
        const params = [];
        const where = [];
        if (status) { where.push('status = ?'); params.push(status); }
        if (room_type) { where.push('room_type = ?'); params.push(room_type); }
        if (where.length) sql += ' WHERE ' + where.join(' AND ');
        sql += ' ORDER BY room_number';
        res.json({ rooms: all(sql, params) });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch rooms' }); }
});

// GET /api/rooms/:id
router.get('/:id', authenticate, (req, res) => {
    const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ room });
});

// POST /api/rooms
router.post('/', authenticate, (req, res) => {
    const { room_number, room_type, bed_type, max_guests, amenities, weekday_price, weekend_price, status, description, floor } = req.body;
    if (!room_number || !room_type || !bed_type || !weekday_price || !weekend_price)
        return res.status(400).json({ error: 'Missing required fields' });
    try {
        const id = newId();
        run(`INSERT INTO rooms (id,room_number,room_type,bed_type,max_guests,amenities,weekday_price,weekend_price,status,description,floor)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [id, room_number, room_type, bed_type, max_guests || 2, JSON.stringify(amenities || []), weekday_price, weekend_price, status || 'available', description || '', floor || 1]);
        res.status(201).json({ room: get('SELECT * FROM rooms WHERE id = ?', [id]) });
    } catch (err) {
        if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Room number already exists' });
        res.status(500).json({ error: 'Failed to create room' });
    }
});

// PUT /api/rooms/:id
router.put('/:id', authenticate, (req, res) => {
    const { room_number, room_type, bed_type, max_guests, amenities, weekday_price, weekend_price, status, description, floor } = req.body;
    try {
        run(`UPDATE rooms SET room_number=?,room_type=?,bed_type=?,max_guests=?,amenities=?,weekday_price=?,weekend_price=?,status=?,description=?,floor=?,updated_at=datetime('now')
         WHERE id=?`,
            [room_number, room_type, bed_type, max_guests, JSON.stringify(amenities || []), weekday_price, weekend_price, status, description, floor, req.params.id]);
        const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        res.json({ room });
    } catch (err) { res.status(500).json({ error: 'Failed to update room' }); }
});

// DELETE /api/rooms/:id
router.delete('/:id', authenticate, (req, res) => {
    const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    run('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    res.json({ message: 'Room deleted' });
});

// POST /api/rooms/:id/photos
router.post('/:id/photos', authenticate, upload.array('photos', 10), (req, res) => {
    const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const existing = Array.isArray(room.photos) ? room.photos : [];
    const newPhotos = (req.files || []).map(f => `/uploads/${f.filename}`);
    run("UPDATE rooms SET photos=?,updated_at=datetime('now') WHERE id=?", [JSON.stringify([...existing, ...newPhotos]), req.params.id]);
    res.json({ room: get('SELECT * FROM rooms WHERE id = ?', [req.params.id]) });
});

// DELETE /api/rooms/:id/photos
router.delete('/:id/photos', authenticate, (req, res) => {
    const { photoUrl } = req.body;
    const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const filtered = (Array.isArray(room.photos) ? room.photos : []).filter(p => p !== photoUrl);
    run("UPDATE rooms SET photos=?,updated_at=datetime('now') WHERE id=?", [JSON.stringify(filtered), req.params.id]);
    res.json({ room: get('SELECT * FROM rooms WHERE id = ?', [req.params.id]) });
});

module.exports = router;
