const { all, get } = require('../db');

/**
 * Calculates dynamic room pricing for a room across a date range.
 * Evaluates active pricing rules (flat/percentage additions or discounts).
 */
const calculateDynamicPrice = (roomId, checkInDate, checkOutDate) => {
    const room = get('SELECT * FROM rooms WHERE id = ?', [roomId]);
    if (!room) throw new Error('Room not found');

    const rules = all("SELECT * FROM pricing_rules WHERE enabled = 1 ORDER BY priority ASC");

    let totalPrice = 0;
    const breakDown = [];
    const start = new Date(checkInDate);
    const end = new Date(checkOutDate);
    const curr = new Date(start);

    while (curr < end) {
        const dayOfWeek = String(curr.getDay()); // 0 = Sun, 6 = Sat
        const dateStr = curr.toISOString().split('T')[0];
        const isWeekend = (dayOfWeek === '0' || dayOfWeek === '6');

        let baseRate = isWeekend ? parseFloat(room.weekend_price) : parseFloat(room.weekday_price);
        let finalDayRate = baseRate;
        const appliedRuleNames = [];

        for (const rule of rules) {
            // Check room type filter
            if (rule.room_type !== 'all' && rule.room_type.toLowerCase() !== room.room_type.toLowerCase()) {
                continue;
            }

            // Check date range filter
            if (rule.start_date && dateStr < rule.start_date) continue;
            if (rule.end_date && dateStr > rule.end_date) continue;

            // Check days of week filter
            const days = Array.isArray(rule.days_of_week) ? rule.days_of_week : [];
            if (days.length > 0 && !days.includes(dayOfWeek)) continue;

            // Rule matches! Apply adjustment
            const val = parseFloat(rule.value);
            if (rule.adjustment_type === 'percentage') {
                finalDayRate += (baseRate * (val / 100));
            } else {
                finalDayRate += val;
            }

            appliedRuleNames.push(rule.name);
        }

        finalDayRate = Math.max(0, Math.round(finalDayRate * 100) / 100);
        totalPrice += finalDayRate;

        breakDown.push({
            date: dateStr,
            isWeekend,
            baseRate,
            finalRate: finalDayRate,
            appliedRules: appliedRuleNames
        });

        curr.setDate(curr.getDate() + 1);
    }

    return {
        roomId,
        roomNumber: room.room_number,
        roomType: room.room_type,
        baseTotal: breakDown.reduce((sum, d) => sum + d.baseRate, 0),
        totalPrice: Math.round(totalPrice * 100) / 100,
        nights: breakDown.length,
        breakDown
    };
};

module.exports = { calculateDynamicPrice };
