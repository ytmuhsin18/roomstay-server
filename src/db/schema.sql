-- Room Management Admin Panel - PostgreSQL Schema
-- Run this file to set up the database

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (admin accounts)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Room types enum-like
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_number VARCHAR(20) UNIQUE NOT NULL,
  room_type VARCHAR(100) NOT NULL, -- Standard, Deluxe, Suite, etc.
  bed_type VARCHAR(100) NOT NULL,  -- Single, Double, Twin, King, Queen
  max_guests INTEGER NOT NULL DEFAULT 2,
  amenities TEXT[] DEFAULT '{}',
  weekday_price DECIMAL(10,2) NOT NULL,
  weekend_price DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'available', -- available, occupied, maintenance
  photos TEXT[] DEFAULT '{}',
  description TEXT,
  floor INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20) NOT NULL,
  address TEXT,
  id_type VARCHAR(50), -- passport, driving_license, aadhar, etc.
  id_number VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_ref VARCHAR(20) UNIQUE NOT NULL,
  room_id UUID NOT NULL REFERENCES rooms(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'confirmed', -- confirmed, checked_in, checked_out, cancelled
  payment_status VARCHAR(50) DEFAULT 'pending', -- pending, partial, paid
  total_amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  special_requests TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  method VARCHAR(50) NOT NULL, -- upi, card, cash, bank_transfer
  amount DECIMAL(10,2) NOT NULL,
  transaction_ref VARCHAR(255),
  upi_id VARCHAR(255),
  card_last4 VARCHAR(4),
  notes TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id),
  type VARCHAR(100) NOT NULL, -- booking_confirmed, checkin_reminder, checkout_reminder, payment_received, cancellation
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  channel VARCHAR(50) DEFAULT 'in_app', -- in_app, sms, email
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_check_in ON bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_check_out ON bookings(check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- Seed: Default admin user (password: Admin@123)
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Admin User', 'admin@roomsadmin.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Seed: Sample rooms
INSERT INTO rooms (room_number, room_type, bed_type, max_guests, amenities, weekday_price, weekend_price, status, description, floor) VALUES
  ('101', 'Standard', 'Double', 2, ARRAY['WiFi','AC','TV','Bathroom'], 1200.00, 1500.00, 'available', 'Cozy standard room on first floor', 1),
  ('102', 'Standard', 'Twin', 2, ARRAY['WiFi','AC','TV','Bathroom'], 1100.00, 1400.00, 'occupied', 'Standard twin-bed room', 1),
  ('103', 'Deluxe', 'King', 3, ARRAY['WiFi','AC','TV','Bathroom','Minibar','Balcony'], 2200.00, 2800.00, 'available', 'Spacious deluxe room with balcony', 1),
  ('201', 'Deluxe', 'Queen', 2, ARRAY['WiFi','AC','TV','Bathroom','Minibar','City View'], 2000.00, 2500.00, 'available', 'Deluxe room with city view', 2),
  ('202', 'Suite', 'King', 4, ARRAY['WiFi','AC','TV','Bathroom','Living Room','Kitchen','Balcony','Jacuzzi'], 4500.00, 5500.00, 'maintenance', 'Luxury suite with private jacuzzi', 2),
  ('203', 'Suite', 'King', 4, ARRAY['WiFi','AC','TV','Bathroom','Living Room','Kitchen','Balcony'], 4000.00, 5000.00, 'available', 'Executive suite', 2),
  ('301', 'Standard', 'Single', 1, ARRAY['WiFi','AC','TV','Bathroom'], 900.00, 1100.00, 'available', 'Single occupancy standard room', 3),
  ('302', 'Deluxe', 'King', 3, ARRAY['WiFi','AC','TV','Bathroom','Minibar','Balcony','Mountain View'], 2400.00, 3000.00, 'available', 'Deluxe mountain view room', 3)
ON CONFLICT (room_number) DO NOTHING;

-- Seed: Sample customers
INSERT INTO customers (name, email, phone, address, id_type, id_number) VALUES
  ('Rahul Sharma', 'rahul.sharma@email.com', '9876543210', '12 MG Road, Bangalore', 'aadhar', 'XXXX-XXXX-1234'),
  ('Priya Patel', 'priya.patel@email.com', '9876543211', '45 Linking Road, Mumbai', 'passport', 'A1234567'),
  ('Amit Kumar', 'amit.kumar@email.com', '9876543212', '78 CP, New Delhi', 'driving_license', 'DL-0119850001234'),
  ('Sneha Reddy', 'sneha.reddy@email.com', '9876543213', '23 Jubilee Hills, Hyderabad', 'aadhar', 'XXXX-XXXX-5678'),
  ('Vikram Singh', 'vikram.singh@email.com', '9876543214', '90 Anna Nagar, Chennai', 'passport', 'B9876543')
ON CONFLICT DO NOTHING;
