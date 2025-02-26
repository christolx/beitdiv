const express = require('express');
const coreApi = require('../config/midtransConfig');
const authenticateJWT = require('../Middleware/authenticateJWT');
const dbConfig = require('../config/dbConfig');

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

    const pool = await dbConfig.connectToDatabase();

    try {
        const existingPayment = await pool.request()
        .input('ticket_id', ticket_id)
        .query(`
          SELECT COUNT(*) AS count 
          FROM payments 
          WHERE ticket_id = @ticket_id 
            AND payment_status = 'settlement'
        `);

        if (existingPayment.recordset[0].count > 0) {
            return res.status(400).json({ message: 'This ticket has already been purchased by someone else.' });
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
            phone: req.user.phone,
        },
    };

  
        const transaction = await coreApi.charge(parameter);

        console.log('Midtrans Response:', transaction);
        res.status(201).json({
            message: 'Transaction created successfully',
            order_id: order_id,
            transaction,
        });
    } catch (error) {
        console.error('Error creating transaction:', error.response?.data || error.message);
        res.status(500).json({ message: 'Error creating transaction', error: error.message });
    }
});

module.exports = router;