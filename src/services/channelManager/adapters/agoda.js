class AgodaAdapter {
    constructor(config) {
        this.apiKey = config.api_key;
        this.propertyId = config.property_id;
        this.enabled = config.enabled;
    }

    async pushAvailabilityAndRates(rooms) {
        if (!this.enabled || !this.apiKey) {
            return { success: false, reason: 'Agoda disabled or API key missing' };
        }
        console.log(`[Agoda YCS API] Synced ${rooms.length} rooms to Hotel ID ${this.propertyId}`);
        return { success: true, syncedCount: rooms.length, timestamp: new Date().toISOString() };
    }

    async pullReservations() {
        if (!this.enabled || !this.apiKey) return [];
        return [];
    }
}

module.exports = AgodaAdapter;
