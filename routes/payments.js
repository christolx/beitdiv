require('dotenv').config();
const express = require('express');
const dbConfig = require('../config/dbConfig');
const authenticateJWT = require('../Middleware/authenticateJWT');
const fetch = require('node-fetch');


const router = express.Router();

async function getMidtransTransactionStatus(order_id) {
    const url = `https://api.sandbox.midtrans.com/v2/${order_id}/status`;
    
    
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
        const { transaction_status, payment_type, gross_amount, order_id: returnedOrderId, va_numbers } = transactionStatus;

        const vaNumber = va_numbers && va_numbers.length > 0 ? va_numbers[0].va_number : null;

        console.log(`Order ID: ${returnedOrderId}`);
        console.log(`Transaction Status: ${transaction_status}`);
        console.log(`Payment Type: ${payment_type}`);
        console.log(`Gross Amount: ${gross_amount}`);
        console.log(`VA Number: ${vaNumber}`);

        const ticketId = order_id.slice(15); 

        const pool = await dbConfig.connectToDatabase();

        const ticketCheck = await pool.request()
        .input('ticket_id', ticketId)
        .query(`
            SELECT COUNT(*) AS count
            FROM payments
            WHERE ticket_id = @ticket_id AND payment_status = 'settlement'
        `);

        if (ticketCheck.recordset[0].count > 0) {
            return res.status(400).json({ message: 'Someone already bought this ticket' });
        }
        
        const existingPayment = await pool.request()
        .input('order_id', order_id)
        .query('SELECT COUNT(*) AS count FROM payments WHERE order_id = @order_id');

        if (existingPayment.recordset[0].count > 0) {
        return res.status(400).json({ message: 'Payment record already exists for this order ID' });
        }

        // Simpan hasil status pembayaran ke dalam database
        await pool.request()
            .input('order_id', order_id)
            .input('ticket_id', ticketId)
            .input('payment_method', payment_type)
            .input('payment_status', transaction_status)
            .input('amount', gross_amount)
            .input('va_number', vaNumber)
            .input(
                'payment_date',
                transaction_status === 'settlement' ? new Date() : null
            )
            .query(`
                INSERT INTO payments (order_id, ticket_id, payment_method, payment_status, amount, va_number, payment_date)
                VALUES (@order_id, @ticket_id, @payment_method, @payment_status, @amount, @va_number, @payment_date)
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

        res.status(201).json({ message: 'Payment status updated successfully', transactionStatus });
    } catch (error) {
        console.error('Error handling payment status:', error.message);
        res.status(500).json({ message: 'Error handling payment status', error: error.message });
    }
});

router.post('/RefreshStatus', authenticateJWT, async (req, res) =>{
    const { order_id } = req.body;

    if(!order_id){
        return res.status(400).json({ message: 'Order ID is required' });
    }

    try{
        const RefreshStatus = await getMidtransTransactionStatus(order_id);
        const { transaction_status, payment_type, gross_amount, order_id: returnedOrderId } = RefreshStatus;

        console.log(`Order ID: ${returnedOrderId}`);
        console.log(`Transaction Status: ${transaction_status}`);
        console.log(`Payment Type: ${payment_type}`);
        console.log(`Gross Amount: ${gross_amount}`);
        const ticket_id = order_id.slice(15); 
        const pool = await dbConfig.connectToDatabase();

        await pool.request()
        .input('order_id', order_id)
        .input('payment_status', transaction_status)
        .input(
            'payment_date',
            transaction_status === 'settlement' ? new Date() : null
        )
        .query(`
           UPDATE payments
            SET payment_status = @payment_status,
                payment_date = @payment_date
            WHERE order_id = @order_id
           `);

        if (transaction_status === 'settlement') {
            await pool.request()
                .input('ticket_id', ticket_id)
                .query(`
                    UPDATE tickets
                    SET status = 'Completed'
                    WHERE ticket_id = @ticket_id
                `);
                return res.status(201).json({ message : 'Payment status updated successfully', transaction_status });
        }

        res.status(200).json({ message: 'Payment status refreshed successfully', transaction_status });

    }catch(error){
        console.error('Error refreshing status:', error.message);
        res.status(500).json({ message: 'Error refreshing status', error: error.message });
    }

})

router.get('/payments', authenticateJWT, async (req, res) => {
    const user_id = req.user.id; 
    console.log(`Fetching payments for user_id: ${user_id}`);  // Log user_id untuk debugging
  
    try {
      const pool = await dbConfig.connectToDatabase();
  
      const result = await pool
        .request()
        .input('user_id', user_id)
        .query(`
          SELECT 
              order_id,
              ticket_id,
              payment_method,
              payment_status,
              amount,
              va_number,
              payment_date
          FROM payments
          WHERE ticket_id IN (
              SELECT ticket_id
              FROM tickets
              WHERE user_id = @user_id
          )
        `);
  
      console.log(result.recordset);  // Log hasil query untuk memastikan data ada
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: 'No payments found for the user' });
      }
  
      res.status(200).json(result.recordset);
    } catch (error) {
      console.error('Error retrieving payment details:', error.message);
      res.status(500).json({ message: 'Error retrieving payment details', error: error.message });
    }
  });

  router.post('/check-ticket-status', authenticateJWT, async (req, res) => {
    const { ticket_id } = req.body;
  
    if (!ticket_id) {
      return res.status(400).json({ message: 'Ticket ID is required.' });
    }
  
    try {
      const pool = await dbConfig.connectToDatabase();
  
      // Query untuk memeriksa apakah ticket_id ada di tabel payments
      const paymentResult = await pool
        .request()
        .input('ticket_id', ticket_id)
        .query(`
          SELECT payment_id
          FROM payments
          WHERE ticket_id = @ticket_id
        `);
  
      // Jika ticket_id sudah ada di payments (berarti sudah dibayar)
      if (paymentResult.recordset.length > 0) {
        return res.status(400).json({ message: 'Someone Already Bought this Ticket.' });
      }
  
      // Jika ticket_id tidak ada di payments, berarti belum dibayar
      return res.status(200).json({ message: 'Ticket is available for booking.' });
  
    } catch (error) {
      console.error('Error checking ticket and payment status:', error);
      res.status(500).json({ message: 'Error checking ticket and payment status', error: error.message });
    }
  });

module.exports = router;