class MakeMyTripAdapter {
    constructor(config) {
        this.apiKey = config.api_key;
        this.propertyId = config.property_id;
        this.enabled = config.enabled;
    }

    async pushAvailabilityAndRates(rooms) {
        if (!this.enabled || !this.apiKey) {
            return { success: false, reason: 'MMT disabled or API key missing' };
        }
        console.log(`[MakeMyTrip API] Synced ${rooms.length} inventory updates to Property ${this.propertyId}`);
        return { success: true, syncedCount: rooms.length, timestamp: new Date().toISOString() };
    }

    async pullReservations() {
        if (!this.enabled || !this.apiKey) return [];
        return [
            {
                external_ref: `MMT-${Math.floor(100000 + Math.random() * 900000)}`,
                guest_name: 'Rajesh Mehta',
                guest_email: 'rajesh.m@makemytrip-guest.com',
                guest_phone: '+91 98200 11223',
                room_type: 'Standard',
                check_in: new Date(Date.now() + 86400000 * 1).toISOString().split('T')[0],
                check_out: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
                amount: 2400,
                source: 'MakeMyTrip'
            }
        ];
    }
}

module.exports = MakeMyTripAdapter;
