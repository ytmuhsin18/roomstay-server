const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

const { syncAllChannels } = require('./services/channelManager');

const app = express();
const PORT = process.env.PORT || 4000;

// Create uploads dir
const uploadsDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(uploadsDir));

// Core Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));

// Enterprise & Channel Manager Routes
app.use('/api/channels', require('./routes/channels'));
app.use('/api/pricing', require('./routes/pricing'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/users', require('./routes/users'));

// Background Auto-Sync Cron (Every 15 minutes)
cron.schedule('*/15 * * * *', async () => {
    console.log('[Cron Job] Triggering periodic OTA channel sync...');
    try {
        await syncAllChannels();
    } catch (err) {
        console.error('[Cron Job Error]:', err.message);
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`🚀 Room Management API running on http://localhost:${PORT}`);
});

module.exports = app;
