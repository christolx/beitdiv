require('dotenv').config();
const express = require('express');
const dbConfig = require('../config/dbConfig');
const { body, validationResult } = require('express-validator');

const router = express.Router();

const VALID_API_KEY = process.env.ADMIN_APIKEY;

// GET method to fetch all showtimes for a specific theater_id and movie_id
router.get('/get-showtimes/:theater_id/:movie_id', async (req, res) => {
    const { theater_id, movie_id } = req.params;

    try {
        const pool = await dbConfig.connectToDatabase();

        const result = await pool.request()
            .input('theater_id', theater_id)
            .input('movie_id', movie_id)
            .query(`
                SELECT * FROM showtimes
                WHERE theater_id = @theater_id AND movie_id = @movie_id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'No showtimes found for the given theater and movie' });
        }

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching showtimes:', err.stack || err.message);
        res.status(500).json({ message: 'Error fetching showtimes', error: err.message });
    }
});

router.post('/add-showtime',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== VALID_API_KEY) {
                return res.status(403).json({ message: 'Forbidden: Invalid API Key' });
            }
            next();
        },
        body('movie_id')
            .isInt({ min: 1 })
            .withMessage('Movie ID must be a positive integer'),
        body('theater_id')
            .isInt({ min: 1 })
            .withMessage('Theater ID must be a positive integer'),
        body('showtime')
            .isISO8601()
            .withMessage('Showtime must be a valid date and time'),
        body('available_seats')
            .isInt({ min: 1 })
            .withMessage('Available seats must be a positive integer')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { movie_id, theater_id, showtime, available_seats } = req.body;

        try {
            const pool = await dbConfig.connectToDatabase();

            await pool.request()
                .input('movie_id', movie_id)
                .input('theater_id', theater_id)
                .input('showtime', showtime)
                .input('available_seats', available_seats)
                .query(`
                    INSERT INTO showtimes (movie_id, theater_id, showtime, available_seats)
                    VALUES (@movie_id, @theater_id, @showtime, @available_seats)
                `);

            res.status(201).json({ message: 'Showtime added successfully' });
        } catch (err) {
            console.error('Error adding showtime:', err.stack || err.message);
            res.status(500).json({ message: 'Error adding showtime', error: err.message });
        }
    }
);

// DELETE method to remove a specific showtime (requires API Key)
router.delete('/delete-showtime/:showtime_id',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== VALID_API_KEY) {
                return res.status(403).json({ message: 'Forbidden: Invalid API Key' });
            }
            next();
        }
    ],
    async (req, res) => {
        const { showtime_id } = req.params;

        try {
            const pool = await dbConfig.connectToDatabase();

            // Delete the showtime for the specific showtime_id
            const result = await pool.request()
                .input('showtime_id', showtime_id)
                .query(`
                    DELETE FROM showtimes
                    WHERE showtime_id = @showtime_id
                `);

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ message: 'Showtime not found' });
            }

            res.status(200).json({ message: 'Showtime deleted successfully' });
        } catch (err) {
            console.error('Error deleting showtime:', err.stack || err.message);
            res.status(500).json({ message: 'Error deleting showtime', error: err.message });
        }
    }
);


module.exports = router;
