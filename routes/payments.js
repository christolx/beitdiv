require('dotenv').config();
const express = require('express');
const dbConfig = require('../config/dbConfig');
const authenticateJWT = require('../Middleware/authenticateJWT');
const crypto = require('crypto');
const fetch = require('node-fetch');


const router = express.Router();

async function getMidtransTransactionStatus(order_id) {
    const url = `https://api.midtrans.com/v2/${order_id}/status`;
    
    
    const username = process.env.MIDTRANS_SERVER_KEY;
    const password = '';  

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':').toString('base64'),
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch transaction status: ${response.statusText}`);
        }

        const data = await response.json();
        return data; 
    } catch (error) {
        throw new Error('Error fetching transaction status: ' + error.message);
    }
}

router.post('/check-payment-status', authenticateJWT, async (req, res) => {
    const { order_id } = req.body;

    if (!order_id) {
        return res.status(400).json({ message: 'Order ID is required' });
    }

    try {
        const transactionStatus = await getMidtransTransactionStatus(order_id);
        const { transaction_status, payment_type, gross_amount, order_id: returnedOrderId } = transactionStatus;

        console.log(`Order ID: ${returnedOrderId}`);
        console.log(`Transaction Status: ${transaction_status}`);
        console.log(`Payment Type: ${payment_type}`);
        console.log(`Gross Amount: ${gross_amount}`);

        const ticketId = order_id.slice(15); 

        const pool = await dbConfig.connectToDatabase();

        // Simpan hasil status pembayaran ke dalam database
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

        res.status(200).json({ message: 'Payment status updated successfully', transactionStatus });
    } catch (error) {
        console.error('Error handling payment status:', error.message);
        res.status(500).json({ message: 'Error handling payment status', error: error.message });
    }
});

router.get('/payments', authenticateJWT, async (req, res) => {
    const user_id = req.user.user_id; 

    try {
        const pool = await dbConfig.connectToDatabase();

        const result = await pool
            .request()
            .input('user_id', user_id)
            .query(`
                SELECT 
                    payment_id,
                    ticket_id,
                    payment_method,
                    payment_status,
                    amount,
                    payment_date
                FROM payments
                WHERE ticket_id IN (
                    SELECT ticket_id
                    FROM tickets
                    WHERE user_id = @user_id
                )
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'No payments found for the user' });
        }

        res.status(200).json(result.recordset); 
    } catch (error) {
        console.error('Error retrieving payment details:', error.message);
        res.status(500).json({ message: 'Error retrieving payment details', error: error.message });
    }
});

module.exports = router;