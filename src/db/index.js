const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'rooms.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    room_number TEXT UNIQUE NOT NULL,
    room_type TEXT NOT NULL,
    bed_type TEXT NOT NULL,
    max_guests INTEGER DEFAULT 2,
    amenities TEXT DEFAULT '[]',
    weekday_price REAL NOT NULL,
    weekend_price REAL NOT NULL,
    status TEXT DEFAULT 'available',
    photos TEXT DEFAULT '[]',
    description TEXT,
    floor INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    address TEXT,
    id_type TEXT,
    id_number TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    booking_ref TEXT UNIQUE NOT NULL,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    adults INTEGER DEFAULT 1,
    children INTEGER DEFAULT 0,
    status TEXT DEFAULT 'confirmed',
    payment_status TEXT DEFAULT 'pending',
    total_amount REAL NOT NULL,
    paid_amount REAL DEFAULT 0,
    notes TEXT,
    special_requests TEXT,
    source TEXT DEFAULT 'direct',
    channel_ref TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    method TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_ref TEXT,
    upi_id TEXT,
    card_last4 TEXT,
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    paid_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    booking_id TEXT REFERENCES bookings(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    channel TEXT DEFAULT 'in_app',
    sent_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    api_key TEXT,
    api_secret TEXT,
    property_id TEXT,
    webhook_url TEXT,
    enabled INTEGER DEFAULT 0,
    status TEXT DEFAULT 'disconnected',
    last_sync TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channel_bookings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    channel_code TEXT NOT NULL,
    booking_id TEXT REFERENCES bookings(id),
    external_ref TEXT NOT NULL,
    guest_name TEXT NOT NULL,
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'confirmed',
    raw_json TEXT,
    synced_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pricing_rules (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    adjustment_type TEXT NOT NULL,
    value REAL NOT NULL,
    start_date TEXT,
    end_date TEXT,
    days_of_week TEXT DEFAULT '[]',
    room_type TEXT DEFAULT 'all',
    priority INTEGER DEFAULT 10,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT,
    user_name TEXT NOT NULL,
    user_email TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_check_in ON bookings(check_in);
  CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
  CREATE INDEX IF NOT EXISTS idx_channels_code ON channels(code);
  CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
`);

// Migration helpers for columns if adding to existing tables
try { db.exec("ALTER TABLE bookings ADD COLUMN source TEXT DEFAULT 'direct'"); } catch { }
try { db.exec("ALTER TABLE bookings ADD COLUMN channel_ref TEXT"); } catch { }

// ── Seed data ────────────────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  const hashAdmin = bcrypt.hashSync('Admin@123', 10);
  const hashManager = bcrypt.hashSync('Manager@123', 10);
  const hashStaff = bcrypt.hashSync('Staff@123', 10);

  const insUser = db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)`);
  insUser.run('Admin User', 'admin@roomsadmin.com', hashAdmin, 'admin');
  insUser.run('Hotel Manager', 'manager@roomsadmin.com', hashManager, 'manager');
  insUser.run('Front Desk Officer', 'frontdesk@roomsadmin.com', hashStaff, 'front_desk');
}

// Ensure custom requested account exists
const customUser = db.prepare('SELECT id FROM users WHERE email = ?').get('drgopigopal@gmail.com');
const customHash = bcrypt.hashSync('gopi123@', 10);
if (!customUser) {
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)`)
    .run('Dr Gopi Gopal', 'drgopigopal@gmail.com', customHash, 'admin');
} else {
  db.prepare(`UPDATE users SET password_hash = ?, role = 'admin' WHERE email = ?`)
    .run(customHash, 'drgopigopal@gmail.com');
}


const roomCount = db.prepare('SELECT COUNT(*) as c FROM rooms').get();
if (roomCount.c === 0) {
  const insert = db.prepare(`INSERT INTO rooms (id, room_number, room_type, bed_type, max_guests, amenities, weekday_price, weekend_price, status, description, floor, photos)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const rooms = [
    ['101', 'Standard', 'Double', 2, '["WiFi","AC","TV","Bathroom"]', 1200, 1500, 'available', 'Cozy standard room on first floor', 1, '["http://localhost:4000/uploads/room_101.jpg"]'],
    ['102', 'Standard', 'Twin', 2, '["WiFi","AC","TV","Bathroom"]', 1100, 1400, 'occupied', 'Standard twin-bed room', 1, '["http://localhost:4000/uploads/room_102.jpg"]'],
    ['103', 'Deluxe', 'King', 3, '["WiFi","AC","TV","Bathroom","Minibar","Balcony"]', 2200, 2800, 'available', 'Spacious deluxe room with balcony', 1, '["http://localhost:4000/uploads/room_103.jpg"]'],
    ['201', 'Deluxe', 'Queen', 2, '["WiFi","AC","TV","Bathroom","Minibar","City View"]', 2000, 2500, 'available', 'Deluxe room with city view', 2, '["http://localhost:4000/uploads/room_101.jpg"]'],
    ['202', 'Suite', 'King', 4, '["WiFi","AC","TV","Bathroom","Living Room","Kitchen","Balcony","Jacuzzi"]', 4500, 5500, 'maintenance', 'Luxury suite with private jacuzzi', 2, '["http://localhost:4000/uploads/room_104.jpg"]'],
    ['203', 'Suite', 'King', 4, '["WiFi","AC","TV","Bathroom","Living Room","Kitchen","Balcony"]', 4000, 5000, 'available', 'Executive suite', 2, '["http://localhost:4000/uploads/room_104.jpg"]'],
    ['301', 'Standard', 'Single', 1, '["WiFi","AC","TV","Bathroom"]', 900, 1100, 'available', 'Single occupancy standard room', 3, '["http://localhost:4000/uploads/room_102.jpg"]'],
    ['302', 'Deluxe', 'King', 3, '["WiFi","AC","TV","Bathroom","Minibar","Balcony","Mountain View"]', 2400, 3000, 'available', 'Deluxe mountain view room', 3, '["http://localhost:4000/uploads/room_103.jpg"]'],
  ];
  rooms.forEach(r => insert.run(...r));
}

// Update existing rooms to ensure they all have photos set
db.prepare(`UPDATE rooms SET photos = '["http://localhost:4000/uploads/room_101.jpg"]' WHERE room_number = '101'`).run();
db.prepare(`UPDATE rooms SET photos = '["http://localhost:4000/uploads/room_102.jpg"]' WHERE room_number = '102'`).run();
db.prepare(`UPDATE rooms SET photos = '["http://localhost:4000/uploads/room_103.jpg"]' WHERE room_number = '103'`).run();
db.prepare(`UPDATE rooms SET photos = '["http://localhost:4000/uploads/room_101.jpg"]' WHERE room_number = '201'`).run();
db.prepare(`UPDATE rooms SET photos = '["http://localhost:4000/uploads/room_104.jpg"]' WHERE room_number = '202'`).run();
db.prepare(`UPDATE rooms SET photos = '["http://localhost:4000/uploads/room_104.jpg"]' WHERE room_number = '203'`).run();
db.prepare(`UPDATE rooms SET photos = '["http://localhost:4000/uploads/room_102.jpg"]' WHERE room_number = '301'`).run();
db.prepare(`UPDATE rooms SET photos = '["http://localhost:4000/uploads/room_103.jpg"]' WHERE room_number = '302'`).run();


const custCount = db.prepare('SELECT COUNT(*) as c FROM customers').get();
if (custCount.c === 0) {
  const ins = db.prepare(`INSERT INTO customers (id, name, email, phone, address, id_type, id_number)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)`);
  [
    ['Rahul Sharma', 'rahul.sharma@email.com', '9876543210', '12 MG Road, Bangalore', 'aadhar', 'XXXX-XXXX-1234'],
    ['Priya Patel', 'priya.patel@email.com', '9876543211', '45 Linking Road, Mumbai', 'passport', 'A1234567'],
    ['Amit Kumar', 'amit.kumar@email.com', '9876543212', '78 CP, New Delhi', 'driving_license', 'DL-0119850001234'],
    ['Sneha Reddy', 'sneha.reddy@email.com', '9876543213', '23 Jubilee Hills, Hyderabad', 'aadhar', 'XXXX-XXXX-5678'],
    ['Vikram Singh', 'vikram.singh@email.com', '9876543214', '90 Anna Nagar, Chennai', 'passport', 'B9876543'],
  ].forEach(c => ins.run(...c));
}

const channelCount = db.prepare('SELECT COUNT(*) as c FROM channels').get();
if (channelCount.c === 0) {
  const insChan = db.prepare(`INSERT INTO channels (id, name, code, api_key, property_id, enabled, status, last_sync)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)`);
  insChan.run('Booking.com', 'booking_com', 'BK_LIVE_API_99812', 'PROP_BCOM_7721', 1, 'connected', new Date().toISOString());
  insChan.run('MakeMyTrip', 'makemytrip', 'MMT_SEC_KEY_33419', 'MMT_PROP_1092', 1, 'connected', new Date().toISOString());
  insChan.run('Agoda', 'agoda', 'AGD_PARTNER_KEY_77', 'AGD_HOTEL_881', 0, 'disconnected', null);
  insChan.run('Airbnb', 'airbnb', 'AIRBNB_OAUTH_TOKEN_01', 'HOST_AIRBNB_552', 1, 'connected', new Date().toISOString());
}

const pricingCount = db.prepare('SELECT COUNT(*) as c FROM pricing_rules').get();
if (pricingCount.c === 0) {
  const insRule = db.prepare(`INSERT INTO pricing_rules (id, name, rule_type, adjustment_type, value, days_of_week, room_type, priority, enabled)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)`);
  insRule.run('Weekend Premium', 'days_of_week', 'percentage', 15.0, '["5","6"]', 'all', 1, 1);
  insRule.run('Suite Special Surge', 'room_type', 'flat', 500.0, '[]', 'Suite', 2, 1);
  insRule.run('Long Stay Discount', 'date_range', 'percentage', -10.0, '[]', 'all', 3, 1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const all = (sql, params = []) => {
  const rows = db.prepare(sql).all(...params);
  return rows.map(parseRow);
};

const get = (sql, params = []) => {
  const row = db.prepare(sql).get(...params);
  return row ? parseRow(row) : null;
};

const run = (sql, params = []) => db.prepare(sql).run(...params);

const JSON_COLS = new Set(['amenities', 'photos', 'days_of_week']);
const BOOL_COLS = new Set(['is_read', 'enabled']);
const parseRow = (row) => {
  const out = { ...row };
  for (const k of JSON_COLS) {
    if (k in out && typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k]); } catch { out[k] = []; }
    }
  }
  for (const k of BOOL_COLS) {
    if (k in out) out[k] = out[k] === 1 || out[k] === true;
  }
  return out;
};

const newId = () => {
  const bytes = require('crypto').randomBytes(16);
  return bytes.toString('hex');
};

module.exports = { db, all, get, run, newId };
