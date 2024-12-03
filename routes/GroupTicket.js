const express = require('express');
const dbConfig = require('../config/dbConfig');
const authenticateJWT = require('../Middleware/authenticateJWT');

const router = express.Router();

const { body, validationResult } = require('express-validator');

router.post('/add-group-ticket',
    authenticateJWT,
    body('ticket_id').isArray().withMessage('ticket_id harus berupa array').isLength({ min: 1 }).withMessage('ticket_id harus memiliki minimal 1 elemen'),
    async (req, res) => {
        const user_id = req.user.id;
        const { ticket_id } = req.body;

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
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
    }
);

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

        const groupTicketResult = await pool.request()
            .input('group_ticket_id', group_ticket_id)
            .query(`
                SELECT ticket_id, showtime_id, seat_number 
                FROM GroupTicket 
                WHERE ticket_id = @group_ticket_id
            `);

        if (groupTicketResult.recordset.length === 0) {
            return res.status(404).json({ message: 'GroupTicket not found' });
        }

        const groupTicket = groupTicketResult.recordset[0];
        const showtime_id = groupTicket.showtime_id;
        const seatNumbers = groupTicket.seat_number.split(' ');

        const paymentsResult = await pool.request()
            .input('group_ticket_id', group_ticket_id)
            .query(`
                DELETE FROM payments 
                WHERE ticket_id = @group_ticket_id
            `);

        const deletedPaymentCount = paymentsResult.rowsAffected[0];

        const ticketIdsResult = await pool.request()
            .input('showtime_id', showtime_id)
            .input('seat_numbers', seatNumbers.join(','))
            .query(`
                SELECT ticket_id 
                FROM tickets 
                WHERE showtime_id = @showtime_id AND seat_number IN (${seatNumbers.map(seat => `'${seat}'`).join(',')})
            `);

        const relatedTicketIds = ticketIdsResult.recordset.map(ticket => ticket.ticket_id);

        if (relatedTicketIds.length > 0) {
            await pool.request()
                .query(`
                    DELETE FROM tickets 
                    WHERE ticket_id IN (${relatedTicketIds.join(',')})
                `);
        }

        if (seatNumbers.length > 0) {
            await pool.request()
                .input('showtime_id', showtime_id)
                .query(`
                    DELETE FROM seat_reservations 
                    WHERE showtime_id = @showtime_id AND seat_number IN (${seatNumbers.map(seat => `'${seat}'`).join(',')})
                `);
        }

        await pool.request()
            .input('group_ticket_id', group_ticket_id)
            .query(`
                DELETE FROM GroupTicket 
                WHERE ticket_id = @group_ticket_id
            `);

        res.status(200).json({
            message: 'GroupTicket and associated data deleted successfully',
            deleted_payments: deletedPaymentCount,
            deleted_ticket_ids: relatedTicketIds,
            deleted_seat_numbers: seatNumbers
        });
    } catch (err) {
        console.error('Error deleting group ticket:', err.message || err.stack);
        res.status(500).json({ message: 'Error deleting group ticket', error: err.message });
    }
});


module.exports = router;