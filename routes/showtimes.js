require('dotenv').config();
const express = require('express');
const dbConfig = require('../config/dbConfig');
const { body, validationResult } = require('express-validator');
const authenticateJWT = require('../Middleware/authenticateJWT');

const router = express.Router();

const VALID_API_KEY = process.env.ADMIN_APIKEY;

// GET Method for fetching showtimes, with optional queries for additional filtering needs
router.get('/get-all-showtimes', async (req, res) => {
    const { theater_id, movie_id, date } = req.query;

    try {
        const pool = await dbConfig.connectToDatabase();
        let query = `
            SELECT 
                s.*, 
                t.theater_name, 
                m.movie_name
            FROM 
                showtimes s
            JOIN 
                theaters t ON s.theater_id = t.theater_id
            JOIN 
                movies m ON s.movie_id = m.movie_id
            WHERE 1=1
        `;

        const request = pool.request();

        if (theater_id) {
            query += ` AND s.theater_id = @theater_id`;
            request.input('theater_id', theater_id);
        }

        if (movie_id) {
            query += ` AND s.movie_id = @movie_id`;
            request.input('movie_id', movie_id);
        }

        if (date) {
            query += ` AND CAST(s.showtime AS DATE) = @date`;
            request.input('date', date);
        }

        query += ` ORDER BY s.showtime`;

        const result = await request.query(query);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                message: 'No showtimes found',
                filters: { theater_id, movie_id, date }
            });
        }

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching all showtimes:', err.stack || err.message);
        res.status(500).json({
            message: 'Error fetching showtimes',
            error: err.message
        });
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

router.post('/add-multiple-showtimes',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== VALID_API_KEY) {
                return res.status(403).json({ message: 'Forbidden: Invalid API Key' });
            }
            next();
        },
        body('showtimes')
            .isArray()
            .withMessage('Showtimes must be an array')
            .custom((value) => {
                value.forEach((showtime, index) => {
                    if (!showtime.movie_id || !Number.isInteger(showtime.movie_id) || showtime.movie_id < 1) {
                        throw new Error(`Movie ID at index ${index} must be a positive integer`);
                    }
                    if (!showtime.theater_id || !Number.isInteger(showtime.theater_id) || showtime.theater_id < 1) {
                        throw new Error(`Theater ID at index ${index} must be a positive integer`);
                    }
                    if (!showtime.showtime || !Date.parse(showtime.showtime)) {
                        throw new Error(`Showtime at index ${index} must be a valid date and time`);
                    }
                    if (!showtime.available_seats || !Number.isInteger(showtime.available_seats) || showtime.available_seats < 1) {
                        throw new Error(`Available seats at index ${index} must be a positive integer`);
                    }
                });
                return true;
            })
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const showtimes = req.body.showtimes;

        try {
            const pool = await dbConfig.connectToDatabase();
            const insertPromises = showtimes.map(showtime => {
                return pool.request()
                    .input('movie_id', showtime.movie_id)
                    .input('theater_id', showtime.theater_id)
                    .input('showtime', showtime.showtime)
                    .input('available_seats', showtime.available_seats)
                    .query(`
                        INSERT INTO showtimes (movie_id, theater_id, showtime, available_seats)
                        VALUES (@movie_id, @theater_id, @showtime, @available_seats)
                    `);
            });

            await Promise.all(insertPromises);

            res.status(201).json({ message: 'Showtimes added successfully' });
        } catch (err) {
            console.error('Error adding showtimes:', err.stack || err.message);
            res.status(500).json({ message: 'Error adding showtimes', error: err.message });
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
