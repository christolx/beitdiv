const express = require('express');
const coreApi = require('../config/midtransConfig');
const authenticateJWT = require('../Middleware/authenticateJWT');
const dbConfig = require('../config/dbConfig');
const crypto = require('crypto');

const router = express.Router();

function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

router.post('/create-transaction', authenticateJWT, async (req, res) => {
    const { ticket_id, gross_amount, bank } = req.body;

    if (!ticket_id || !gross_amount || gross_amount <= 0 || !bank) {
        return res.status(400).json({ message: 'Ticket ID, valid gross amount, and bank are required' });
    }

    const randomString = generateRandomString(15);
    const order_id = `${randomString}${ticket_id}`;

    console.log('Generated Order ID:', order_id);

    const parameter = {
        payment_type: 'bank_transfer',
        transaction_details: {
            order_id: order_id,
            gross_amount: gross_amount,
        },
        bank_transfer: {
            bank: bank,
        },
        customer_details: {
            email: req.user.email,
            phone: req.user.phone_number,
        },
    };

    try {
        const transaction = await coreApi.charge(parameter);

        console.log('Midtrans Response:', transaction);
        res.status(201).json({
            message: 'Transaction created successfully',
            transaction,
        });
    } catch (error) {
        console.error('Error creating transaction:', error.response?.data || error.message);
        res.status(500).json({ message: 'Error creating transaction', error: error.message });
    }
});

router.post('/notification', async (req, res) => {
    const notification = req.body;

    try {
        // Uncomment kode berikut jika ingin mengaktifkan validasi signature key
        /*
        const signatureKey = req.headers['x-callback-signature'];
        const bodyString = JSON.stringify(notification);
        const expectedSignature = crypto
            .createHmac('sha512', process.env.MIDTRANS_SERVER_KEY)
            .update(bodyString)
            .digest('hex');

        console.log("Calculated HMAC SHA512 Signature:", expectedSignature);

        if (signatureKey !== expectedSignature) {
            console.error('Invalid signature from Midtrans');
            return res.status(403).send('Invalid signature');
        }
        */

        const { order_id, transaction_status, payment_type, gross_amount } = notification;

        // Ambil ticket_id dengan menghapus 15 karakter awal dari order_id
        const ticketId = order_id.slice(15);

        console.log(`Order ID: ${order_id}`);
        console.log(`Ticket ID: ${ticketId}`);
        console.log(`Transaction Status: ${transaction_status}`);
        console.log(`Payment Type: ${payment_type}`);
        console.log(`Gross Amount: ${gross_amount}`);

        const pool = await dbConfig.connectToDatabase();

        await pool.request()
            .input('ticket_id', ticketId)
            .input('payment_method', payment_type)
            .input('payment_status', transaction_status)
            .input('amount', gross_amount)
            .input(
                'payment_date',
                transaction_status === 'settlement' ? new Date() : null
            )
            .query(`
                INSERT INTO payments (ticket_id, payment_method, payment_status, amount, payment_date)
                VALUES (@ticket_id, @payment_method, @payment_status, @amount, @payment_date)
            `);

        if (transaction_status === 'settlement') {
            await pool.request()
                .input('ticket_id', ticketId)
                .query(`
                    UPDATE tickets
                    SET status = 'Completed'
                    WHERE ticket_id = @ticket_id
                `);
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error handling notification:', error.message);
        res.status(500).send('Error handling notification');
    }
});

module.exports = router;