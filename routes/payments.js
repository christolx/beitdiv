require('dotenv').config();
const express = require('express');
const dbConfig = require('../config/dbConfig');
const authenticateJWT = require('../Middleware/authenticateJWT');

const router = express.Router();

router.get('/payment/:payment_id',
    authenticateJWT, 
    async (req, res) => {
        const { payment_id } = req.params;

        try {
            const pool = await dbConfig.connectToDatabase();

            const result = await pool
                .request()
                .input('payment_id', payment_id)
                .query(`
                    SELECT 
                        payment_id,
                        ticket_id,
                        payment_method,
                        payment_status,
                        amount,
                        payment_date
                    FROM payments
                    WHERE payment_id = @payment_id
                `);

            if (result.recordset.length === 0) {
                return res.status(404).json({ message: 'Payment not found for the provided payment_id' });
            }

            res.status(200).json({
                payment_id: result.recordset[0].payment_id,
                ticket_id: result.recordset[0].ticket_id,
                payment_method: result.recordset[0].payment_method,
                payment_status: result.recordset[0].payment_status,
                amount: result.recordset[0].amount,
                payment_date: result.recordset[0].payment_date,
            });
        } catch (error) {
            console.error('Error retrieving payment details:', error.message);
            res.status(500).json({ message: 'Error retrieving payment details', error: error.message });
        }
    }
);

module.exports = router;
