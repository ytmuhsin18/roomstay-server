const { run, newId } = require('../db');

/**
 * Logs an administrative action to the audit_logs table.
 * @param {object} req - Express request object (containing req.user & req.ip)
 * @param {string} action - Action identifier (e.g. 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'SYNC')
 * @param {string} entity - Resource type (e.g. 'ROOM', 'BOOKING', 'PAYMENT', 'CHANNEL', 'PRICING')
 * @param {string|null} entity_id - Target resource ID
 * @param {object|string} details - Additional contextual details
 */
const logAudit = (req, action, entity, entity_id = null, details = null) => {
    try {
        const userId = req?.user?.id || null;
        const userName = req?.user?.name || 'System / Guest';
        const userEmail = req?.user?.email || null;
        const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1';
        const detailsStr = typeof details === 'object' ? JSON.stringify(details) : String(details || '');

        const id = newId();
        run(
            `INSERT INTO audit_logs (id, user_id, user_name, user_email, action, entity, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, userId, userName, userEmail, action, entity, entity_id, detailsStr, ipAddress]
        );
    } catch (err) {
        console.error('Audit Log Error:', err.message);
    }
};

module.exports = { logAudit };
