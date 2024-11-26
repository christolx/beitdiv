require('dotenv').config();
const express = require('express');
const dbConfig = require('../config/dbConfig');
const {body, validationResult} = require('express-validator');

const router = express.Router();

const VALID_API_KEY = process.env.ADMIN_APIKEY;

router.post('/add-ticket',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== VALID_API_KEY) {
                return res.status(403).json({message: 'Forbidden: Invalid API Key'});
            }
            next();
        },

        body('user_id').isInt().withMessage('User ID must be an integer'),
        body('showtime_id').isInt().withMessage('Showtime ID must be an integer'),
        body('seat_number').notEmpty().withMessage('Seat number is required'),
        body('ticket_price')
            .isFloat({min: 0})
            .withMessage('Ticket price must be a positive number'),
        body('status')
            .isIn(['Completed', 'Cancelled', 'Booked'])
            .withMessage('Status must be one of: Completed, Cancelled, Booked')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({errors: errors.array()});
        }

        const {user_id, showtime_id, seat_number, ticket_price, status} = req.body;

        try {
            const pool = await dbConfig.connectToDatabase();

            await pool.request()
                .input('user_id', user_id)
                .input('showtime_id', showtime_id)
                .input('seat_number', seat_number)
                .input('ticket_price', ticket_price)
                .input('status', status)
                .query(`
                    INSERT INTO tickets (user_id, showtime_id, seat_number, ticket_price, status)
                    VALUES (@user_id, @showtime_id, @seat_number, @ticket_price, @status)
                `);

            res.status(201).json({message: 'Ticket added successfully'});
        } catch (err) {
            console.error('Error adding ticket:', err.stack || err.message);
            res.status(500).json({message: 'Error adding ticket', error: err.message});
        }
    }
);

router.get('/get-tickets', async (req, res) => {
    try {
        const pool = await dbConfig.connectToDatabase();
        const result = await pool.request().query('SELECT * FROM tickets');

        if (result.recordset.length === 0) {
            return res.status(404).json({message: 'No tickets found'});
        }

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching tickets:', err.stack || err.message);
        res.status(500).json({message: 'Error fetching tickets', error: err.message});
    }
});

// GET method to fetch a specific ticket by ticket_id
router.get('/get-ticket/:ticket_id', async (req, res) => {
    const { ticket_id } = req.params;

    try {
        const pool = await dbConfig.connectToDatabase();

        const result = await pool.request()
            .input('ticket_id', ticket_id)
            .query(`
                SELECT ticket_id, user_id, showtime_id, seat_number, ticket_price, status, created_at
                FROM tickets
                WHERE ticket_id = @ticket_id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching ticket:', err.stack || err.message);
        res.status(500).json({ message: 'Error fetching ticket', error: err.message });
    }
});


router.delete('/delete-ticket/:id',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== VALID_API_KEY) {
                return res.status(403).json({message: 'Forbidden: Invalid API Key'});
            }
            next();
        }
    ], async (req, res) => {
        const {id} = req.params;

        try {
            const pool = await dbConfig.connectToDatabase();
            const result = await pool.request()
                .input('id', id)
                .query('DELETE FROM tickets WHERE ticket_id = @id');

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({message: 'Ticket not found'});
            }

            res.status(200).json({message: 'Ticket deleted successfully'});
        } catch (err) {
            console.error('Error deleting ticket:', err.stack || err.message);
            res.status(500).json({message: 'Error deleting ticket', error: err.message});
        }
    });

// PUT method to update the status of a ticket
router.put('/update-ticket-status/:ticket_id',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== VALID_API_KEY) {
                return res.status(403).json({ message: 'Forbidden: Invalid API Key' });
            }
            next();
        },
        body('status')
            .isIn(['Completed', 'Cancelled', 'Booked'])
            .withMessage('Status must be one of: Completed, Cancelled, Booked')
    ],
    async (req, res) => {
        const { ticket_id } = req.params;
        const { status } = req.body;

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const pool = await dbConfig.connectToDatabase();

            const result = await pool.request()
                .input('ticket_id', ticket_id)
                .input('status', status)
                .query(`
                    UPDATE tickets
                    SET status = @status
                    WHERE ticket_id = @ticket_id
                `);

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ message: 'Ticket not found' });
            }

            res.status(200).json({ message: 'Ticket status updated successfully' });
        } catch (err) {
            console.error('Error updating ticket status:', err.stack || err.message);
            res.status(500).json({ message: 'Error updating ticket status', error: err.message });
        }
    }
);

module.exports = router;
