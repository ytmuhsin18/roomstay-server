/**
 * Booking.com Connectivity API Adapter
 * Handles inventory/rate sync and pulls reservation events from Booking.com.
 */
class BookingComAdapter {
    constructor(config) {
        this.apiKey = config.api_key;
        this.propertyId = config.property_id;
        this.enabled = config.enabled;
    }

    async pushAvailabilityAndRates(rooms) {
        if (!this.enabled || !this.apiKey) {
            return { success: false, reason: 'Channel disabled or API key missing' };
        }
        // Simulation / Real HTTP POST to https://connectivity.booking.com/api/v1/availability
        console.log(`[Booking.com API] Synced ${rooms.length} rooms to Property ${this.propertyId} via Key ${this.apiKey.substring(0, 6)}...`);
        return {
            success: true,
            syncedCount: rooms.length,
            timestamp: new Date().toISOString()
        };
    }

    async pullReservations() {
        if (!this.enabled || !this.apiKey) return [];
        // Mock simulation returns a new reservation periodically if configured
        return [
            {
                external_ref: `BCOM-${Math.floor(100000 + Math.random() * 900000)}`,
                guest_name: 'Sarah Jenkins',
                guest_email: 'sarah.j@booking-guest.com',
                guest_phone: '+1 415 890 1234',
                room_type: 'Deluxe',
                check_in: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
                check_out: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
                amount: 8400,
                source: 'Booking.com'
            }
        ];
    }
}

module.exports = BookingComAdapter;
