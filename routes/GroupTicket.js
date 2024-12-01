const express = require('express');
const dbConfig = require('../config/dbConfig');
const authenticateJWT = require('../Middleware/authenticateJWT');

const router = express.Router();

router.post('/add-group-ticket', authenticateJWT, async (req, res) => {
    const user_id = req.user.id; 
    const { ticket_id } = req.body; 

    if (!Array.isArray(ticket_id) || ticket_id.length === 0) {
        return res.status(400).json({ error: 'ticket_id harus berupa array dengan minimal 1 elemen' });
    }

    try {
        const pool = await dbConfig.connectToDatabase();

        const ticketsQuery = `
            SELECT ticket_id, showtime_id, seat_number, ticket_price, status
            FROM tickets
            WHERE ticket_id IN (${ticket_id.map(id => `'${id}'`).join(',')})
        `;

        const ticketsResult = await pool.request().query(ticketsQuery);

        if (ticketsResult.recordset.length !== ticket_id.length) {
            return res.status(404).json({ error: 'Beberapa ticket_id tidak ditemukan' });
        }
        const sampleTicket = ticketsResult.recordset[0];
        const showtime_id = sampleTicket.showtime_id;
        const status = sampleTicket.status;
        const ticket_price = sampleTicket.ticket_price; 

        const jumlahTiket = ticket_id.length;

        const totalPrice = ticket_price * jumlahTiket;

        const seatNumbers = ticketsResult.recordset.map(ticket => ticket.seat_number).join(' ');

        const insertQuery = `
            INSERT INTO GroupTicket (user_id, showtime_id, seat_number, price, status, created_at)
            OUTPUT INSERTED.ticket_id
            VALUES (@user_id, @showtime_id, @seat_number, @price, @status, GETDATE())
        `;

        const insertResult = await pool.request()
            .input('user_id', user_id)
            .input('showtime_id', showtime_id)
            .input('seat_number', seatNumbers)
            .input('price', totalPrice)
            .input('status', status)
            .query(insertQuery);

        const newGroupTicketId = insertResult.recordset[0].ticket_id;

        res.status(201).json({
            message: 'GroupTicket berhasil ditambahkan',
            data: {
                group_ticket_id: newGroupTicketId,
                user_id,
                showtime_id,
                seat_number: seatNumbers,
                total_price: totalPrice,
                status
            }
        });
    } catch (err) {
        console.error('Error adding group ticket:', err.message || err.stack);
        res.status(500).json({ error: 'Terjadi kesalahan pada server', detail: err.message });
    }
});

router.get('/get-group-ticket/:group_ticket_id', authenticateJWT, async (req, res) => {
    const { group_ticket_id } = req.params;

    try {
        const pool = await dbConfig.connectToDatabase();

        const result = await pool.request()
            .input('group_ticket_id', group_ticket_id)
            .query(`
                SELECT 
                    gt.ticket_id AS ticket_id,
                    m.movie_name,
                    th.theater_name,
                    s.showtime,
                    gt.seat_number,
                    gt.price AS ticket_price,
                    gt.status
                FROM 
                    GroupTicket gt
                JOIN 
                    showtimes s ON gt.showtime_id = s.showtime_id
                JOIN 
                    movies m ON s.movie_id = m.movie_id
                JOIN 
                    theaters th ON s.theater_id = th.theater_id
                WHERE 
                    gt.ticket_id = @group_ticket_id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'GroupTicket not found' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching group ticket:', err.message);
        res.status(500).json({ message: 'Error fetching group ticket', error: err.message });
    }
});

router.delete('/delete-group-ticket/:group_ticket_id', authenticateJWT, async (req, res) => {
    const { group_ticket_id } = req.params;

    try {
        const pool = await dbConfig.connectToDatabase();

        const checkResult = await pool.request()
            .input('group_ticket_id', group_ticket_id)
            .query(`
                SELECT ticket_id 
                FROM GroupTicket 
                WHERE ticket_id = @group_ticket_id
            `);

        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ message: 'GroupTicket not found' });
        }
        await pool.request()
            .input('group_ticket_id', group_ticket_id)
            .query(`
                DELETE FROM GroupTicket 
                WHERE ticket_id = @group_ticket_id
            `);

        res.status(200).json({ message: 'GroupTicket deleted successfully' });
    } catch (err) {
        console.error('Error deleting group ticket:', err.message);
        res.status(500).json({ message: 'Error deleting group ticket', error: err.message });
    }
});


module.exports = router;