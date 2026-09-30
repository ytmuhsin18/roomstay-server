const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { run, newId } = require('../db');

// Transporter lazy setup
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}

// Twilio lazy setup
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Dispatch multi-channel notification (in_app, email, sms, whatsapp)
 */
const sendNotification = async ({ booking_id = null, type, title, message, channels = ['in_app'], recipient = {} }) => {
    const results = {};

    // 1. In-App Notification (Always saved)
    if (channels.includes('in_app')) {
        const id = newId();
        run(
            `INSERT INTO notifications (id, booking_id, type, title, message, channel) VALUES (?, ?, ?, ?, ?, 'in_app')`,
            [id, booking_id, type, title, message]
        );
        results.in_app = { status: 'sent', id };
    }

    // 2. Email Notification
    if (channels.includes('email')) {
        if (transporter && recipient.email) {
            try {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || '"RoomAdmin System" <noreply@roomsadmin.com>',
                    to: recipient.email,
                    subject: title,
                    text: message,
                    html: `<div style="font-family: sans-serif; padding: 20px; background: #0f172a; color: #f1f5f9; border-radius: 8px;">
            <h2 style="color: #3b82f6;">${title}</h2>
            <p>${message}</p>
            <hr style="border-color: #1e293b;" />
            <p style="font-size: 12px; color: #64748b;">Sent by Room Management Admin Panel</p>
          </div>`
                });
                results.email = { status: 'sent', recipient: recipient.email };
            } catch (err) {
                console.error('Email Dispatch Error:', err.message);
                results.email = { status: 'failed', error: err.message };
            }
        } else {
            console.log(`[Email Simulation] To: ${recipient.email || 'guest@example.com'} | Subject: ${title} | Body: ${message}`);
            results.email = { status: 'simulated', recipient: recipient.email || 'guest@example.com' };
        }
    }

    // 3. SMS Notification
    if (channels.includes('sms')) {
        if (twilioClient && recipient.phone && process.env.TWILIO_PHONE_NUMBER) {
            try {
                const sms = await twilioClient.messages.create({
                    body: `${title}: ${message}`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: recipient.phone
                });
                results.sms = { status: 'sent', sid: sms.sid };
            } catch (err) {
                console.error('SMS Dispatch Error:', err.message);
                results.sms = { status: 'failed', error: err.message };
            }
        } else {
            console.log(`[SMS Simulation] To: ${recipient.phone || '+919876543210'} | Text: ${title}: ${message}`);
            results.sms = { status: 'simulated', recipient: recipient.phone || '+919876543210' };
        }
    }

    // 4. WhatsApp Notification
    if (channels.includes('whatsapp')) {
        const waPhone = recipient.phone ? (recipient.phone.startsWith('whatsapp:') ? recipient.phone : `whatsapp:${recipient.phone}`) : 'whatsapp:+919876543210';
        const fromWa = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

        if (twilioClient) {
            try {
                const waMsg = await twilioClient.messages.create({
                    body: `*${title}*\n\n${message}`,
                    from: fromWa,
                    to: waPhone
                });
                results.whatsapp = { status: 'sent', sid: waMsg.sid };
            } catch (err) {
                console.error('WhatsApp Dispatch Error:', err.message);
                results.whatsapp = { status: 'failed', error: err.message };
            }
        } else {
            console.log(`[WhatsApp Simulation] To: ${waPhone} | Body: *${title}*\n\n${message}`);
            results.whatsapp = { status: 'simulated', recipient: waPhone };
        }
    }

    return results;
};

module.exports = { sendNotification };
