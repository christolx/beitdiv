require('dotenv').config();
const express = require('express');
const dbConfig = require('../config/dbConfig');
const { body, validationResult } = require('express-validator');
const authenticateJWT = require('../Middleware/authenticateJWT');


const router = express.Router();

const VALID_API_KEY = process.env.ADMIN_APIKEY;



router.post('/add-seat-reservation',
    [
        body('showtime_id').isInt().withMessage('Showtime ID must be an integer'),
        body('seat_number').notEmpty().withMessage('Seat number is required'),
        body('reservation_status')
            .isIn(['Available', 'Reserved'])
            .withMessage('Reservation status must be one of: Available, Reserved')
    ], authenticateJWT, 
    async (req, res) => {
        const user_id = req.user.id;
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { showtime_id, seat_number, reservation_status } = req.body;

        try {
            const pool = await dbConfig.connectToDatabase();

            await pool.request()
                .input('showtime_id', showtime_id)
                .input('seat_number', seat_number)
                .input('user_id', user_id)
                .input('reservation_status', reservation_status)
                .query(`
                    INSERT INTO seat_reservations (showtime_id, seat_number, user_id, reservation_status)
                    VALUES (@showtime_id, @seat_number, @user_id, @reservation_status)
                `);

            res.status(201).json({ message: 'Seat reservation added successfully' });
        } catch (err) {
            console.error('Error adding seat reservation:', err.stack || err.message);
            res.status(500).json({ message: 'Error adding seat reservation', error: err.message });
        }
    }
);

// GET method to fetch all seat reservations for a specific showtime_id
router.get('/get-seat-reservations/:showtime_id', authenticateJWT, async (req, res) => {
    const { showtime_id } = req.params;

    try {
        const pool = await dbConfig.connectToDatabase();

        const result = await pool.request()
            .input('showtime_id', showtime_id)
            .query(`
                SELECT showtime_id, seat_number, user_id, reservation_status
                FROM seat_reservations
                WHERE showtime_id = @showtime_id
            `);
      
        res.status(200).json(result.recordset.length > 0 ? result.recordset : []);
    } catch (err) {
        console.error('Error fetching seat reservations:', err.stack || err.message);
        res.status(500).json({ message: 'Error fetching seat reservations', error: err.message });
    }
});


// DELETE method to remove a seat reservation based on showtime_id and seat_number
router.delete('/delete-seat-reservation/:showtime_id/:seat_number',
    authenticateJWT,
    async (req, res) => {
        const { showtime_id, seat_number } = req.params;

        try {
            const pool = await dbConfig.connectToDatabase();

            // Delete the seat reservation for the specific showtime and seat number
            const result = await pool.request()
                .input('showtime_id', showtime_id)
                .input('seat_number', seat_number)
                .query(`
                    DELETE FROM seat_reservations
                    WHERE showtime_id = @showtime_id AND seat_number = @seat_number
                `);

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ message: 'Seat reservation not found' });
            }

            res.status(200).json({ message: 'Seat reservation deleted successfully' });
        } catch (err) {
            console.error('Error deleting seat reservation:', err.stack || err.message);
            res.status(500).json({ message: 'Error deleting seat reservation', error: err.message });
        }
    }
);


module.exports = router;
