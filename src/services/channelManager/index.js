const { all, get, run, newId } = require('../../db');
const BookingComAdapter = require('./adapters/bookingCom');
const MakeMyTripAdapter = require('./adapters/makemytrip');
const AgodaAdapter = require('./adapters/agoda');
const AirbnbAdapter = require('./adapters/airbnb');
const { sendNotification } = require('../notificationService');

const getAdapter = (channel) => {
    switch (channel.code) {
        case 'booking_com': return new BookingComAdapter(channel);
        case 'makemytrip': return new MakeMyTripAdapter(channel);
        case 'agoda': return new AgodaAdapter(channel);
        case 'airbnb': return new AirbnbAdapter(channel);
        default: return null;
    }
};

/**
 * Triggers a full inventory and rate sync across all connected OTAs.
 */
const syncAllChannels = async () => {
    const channels = all('SELECT * FROM channels WHERE enabled = 1');
    const rooms = all('SELECT * FROM rooms');
    const results = [];

    for (const ch of channels) {
        const adapter = getAdapter(ch);
        if (!adapter) continue;

        try {
            // 1. Push room inventory & pricing
            const pushRes = await adapter.pushAvailabilityAndRates(rooms);

            // 2. Pull incoming OTA bookings
            const pullBookings = await adapter.pullReservations();
            let importedCount = 0;

            for (const otaB of pullBookings) {
                // Check if external_ref already imported
                const existing = get('SELECT id FROM channel_bookings WHERE external_ref = ?', [otaB.external_ref]);
                if (!existing) {
                    // Find matching room by room_type
                    const matchRoom = get("SELECT * FROM rooms WHERE room_type = ? AND status = 'available' LIMIT 1", [otaB.room_type])
                        || get("SELECT * FROM rooms WHERE status = 'available' LIMIT 1");

                    if (matchRoom) {
                        // Find or create customer
                        let cust = get('SELECT * FROM customers WHERE phone = ? OR email = ?', [otaB.guest_phone, otaB.guest_email]);
                        if (!cust) {
                            const custId = newId();
                            run(`INSERT INTO customers (id, name, email, phone) VALUES (?, ?, ?, ?)`,
                                [custId, otaB.guest_name, otaB.guest_email, otaB.guest_phone]);
                            cust = { id: custId, name: otaB.guest_name };
                        }

                        // Create booking in PMS and block room
                        const bId = newId();
                        const ref = `OTA-${Math.floor(100000 + Math.random() * 900000)}`;
                        run(
                            `INSERT INTO bookings (id, booking_ref, room_id, customer_id, check_in, check_out, total_amount, paid_amount, payment_status, source, channel_ref)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)`,
                            [bId, ref, matchRoom.id, cust.id, otaB.check_in, otaB.check_out, otaB.amount, otaB.amount, otaB.source, otaB.external_ref]
                        );

                        // Block room across platforms
                        const today = new Date().toISOString().split('T')[0];
                        if (otaB.check_in <= today) {
                            run("UPDATE rooms SET status = 'occupied' WHERE id = ?", [matchRoom.id]);
                        }

                        // Save to channel_bookings log
                        run(
                            `INSERT INTO channel_bookings (id, channel_code, booking_id, external_ref, guest_name, check_in, check_out, amount, raw_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [newId(), ch.code, bId, otaB.external_ref, otaB.guest_name, otaB.check_in, otaB.check_out, otaB.amount, JSON.stringify(otaB)]
                        );

                        // Notify admin
                        sendNotification({
                            booking_id: bId,
                            type: 'booking_confirmed',
                            title: `New Booking from ${otaB.source}`,
                            message: `Ref: ${ref} | Guest: ${otaB.guest_name} | Room ${matchRoom.room_number} blocked across channels.`
                        });

                        importedCount++;
                    }
                }
            }

            // Update channel status & last_sync
            const now = new Date().toISOString();
            run("UPDATE channels SET status = 'connected', last_sync = ?, updated_at = ? WHERE id = ?", [now, now, ch.id]);

            results.push({
                channel: ch.name,
                code: ch.code,
                status: 'success',
                push: pushRes,
                importedBookings: importedCount
            });
        } catch (err) {
            console.error(`Channel Sync Error (${ch.name}):`, err.message);
            run("UPDATE channels SET status = 'error', updated_at = datetime('now') WHERE id = ?", [ch.id]);
            results.push({ channel: ch.name, code: ch.code, status: 'error', error: err.message });
        }
    }

    return results;
};

/**
 * Pushes room block update across all enabled channels when a room status changes.
 */
const notifyRoomBlocked = async (roomId, reason) => {
    const room = get('SELECT * FROM rooms WHERE id = ?', [roomId]);
    const channels = all('SELECT * FROM channels WHERE enabled = 1');

    console.log(`[Channel Orchestrator] Room ${room?.room_number || roomId} blocked (${reason}). Pushing blocks to ${channels.length} channels...`);

    for (const ch of channels) {
        const adapter = getAdapter(ch);
        if (adapter && room) {
            await adapter.pushAvailabilityAndRates([room]);
        }
    }
};

module.exports = { syncAllChannels, notifyRoomBlocked };
