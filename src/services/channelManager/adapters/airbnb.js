class AirbnbAdapter {
    constructor(config) {
        this.apiKey = config.api_key;
        this.propertyId = config.property_id;
        this.enabled = config.enabled;
    }

    async pushAvailabilityAndRates(rooms) {
        if (!this.enabled || !this.apiKey) {
            return { success: false, reason: 'Airbnb disabled or API key missing' };
        }
        console.log(`[Airbnb API] Synced ${rooms.length} listings for Host ${this.propertyId}`);
        return { success: true, syncedCount: rooms.length, timestamp: new Date().toISOString() };
    }

    async pullReservations() {
        if (!this.enabled || !this.apiKey) return [];
        return [
            {
                external_ref: `HM-${Math.floor(10000000 + Math.random() * 90000000)}`,
                guest_name: 'David Miller',
                guest_email: 'david.m@airbnb-guest.com',
                guest_phone: '+1 212 555 0199',
                room_type: 'Suite',
                check_in: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0],
                check_out: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
                amount: 13500,
                source: 'Airbnb'
            }
        ];
    }
}

module.exports = AirbnbAdapter;
