require('dotenv').config();
const express = require('express');
const dbConfig = require('../config/dbConfig');
const {body, validationResult} = require('express-validator');

const router = express.Router();

const FILM_APIKEY = process.env.ADMIN_APIKEY;

// GET method to fetch all movies
router.get('/movies', async (req, res) => {
    try {
        const pool = await dbConfig.connectToDatabase();

        const result = await pool.request()
            .query('SELECT movie_id, movie_name, age_rating, duration, dimension, language, release_date, poster_link, status FROM movies');

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'No movies found' });
        }

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching movies:', err.stack || err.message);
        res.status(500).json({ message: 'Error fetching movies', error: err.message });
    }
});

// GET method to fetch a specific movie by movie_id
router.get('/movie/:movie_id', async (req, res) => {
    const { movie_id } = req.params;

    try {
        const pool = await dbConfig.connectToDatabase();

        const result = await pool.request()
            .input('movie_id', movie_id)
            .query(`
                SELECT movie_id, movie_name, age_rating, duration, dimension, language, release_date, poster_link, status
                FROM movies
                WHERE movie_id = @movie_id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Movie not found' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching movie:', err.stack || err.message);
        res.status(500).json({ message: 'Error fetching movie', error: err.message });
    }
});

router.post('/insert-movie',
    [
        (req, res, next) => {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey !== FILM_APIKEY) {
            return res.status(403).json({ message: 'Forbidden: Invalid API Key' });
        }
        next();
        },
        body('movie_name').notEmpty().withMessage('Movie name is required'),
        body('age_rating').notEmpty().withMessage('Age rating is required'),
        body('duration').isInt({ min: 1 }).withMessage('Duration must be a positive integer'),
        body('dimension').isIn(['2D', '3D', 'IMAX']).withMessage('Dimension must be either 2D, 3D, or IMAX'),
        body('language').notEmpty().withMessage('Language is required'),
        body('release_date').isDate().withMessage('Invalid release date format'),
        body('poster_link').isURL().withMessage('Invalid poster link'),
        body('status')
            .isIn(['Upcoming', 'Tayang', 'Archived'])
            .withMessage('Status must be either Upcoming, Tayang, or Archived')
    ],
    async (req, res) => {


        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            movie_name,
            age_rating,
            duration,
            dimension,
            language,
            release_date,
            poster_link,
            status
        } = req.body;

        try {
            const pool = await dbConfig.connectToDatabase();

            await pool.request()
                .input('movie_name', movie_name)
                .input('age_rating', age_rating)
                .input('duration', duration)
                .input('dimension', dimension)
                .input('language', language)
                .input('release_date', release_date)
                .input('poster_link', poster_link)
                .input('status', status)
                .query(`
                    INSERT INTO movies 
                    (movie_name, age_rating, duration, dimension, language, release_date, poster_link, status)
                    VALUES 
                    (@movie_name, @age_rating, @duration, @dimension, @language, @release_date, @poster_link, @status)
                `);

            res.status(201).json({ message: 'Movie added successfully' });
        } catch (err) {
            console.error('Error adding movie:', err.stack || err.message);
            res.status(500).json({ message: 'Error adding movie', error: err.message });
        }
    }
);

// DELETE method to delete a movie
router.delete('/delete-movie/:movie_id',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== FILM_APIKEY) {
                return res.status(403).json({ message: 'Forbidden: Invalid API Key' });
            }
            next();
        }
    ],
    async (req, res) => {
        const { movie_id } = req.params;

        try {
            const pool = await dbConfig.connectToDatabase();

            const result = await pool.request()
                .input('movie_id', movie_id)
                .query(`
                    DELETE FROM movies
                    WHERE movie_id = @movie_id
                `);

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ message: 'Movie not found' });
            }

            res.status(200).json({ message: 'Movie deleted successfully' });
        } catch (err) {
            console.error('Error deleting movie:', err.stack || err.message);
            res.status(500).json({ message: 'Error deleting movie', error: err.message });
        }
    }
);

// PUT method to update status
router.put('/update-movie-status/:movie_id',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== FILM_APIKEY) {
                return res.status(403).json({ message: 'Forbidden: Invalid API Key' });
            }
            next();
        },
        body('status')
            .isIn(['Upcoming', 'Tayang', 'Archived'])
            .withMessage('Status must be either Upcoming, Tayang, or Archived')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { status } = req.body;
        const { movie_id } = req.params;

        try {
            const pool = await dbConfig.connectToDatabase();

            const result = await pool.request()
                .input('movie_id', movie_id)
                .input('status', status)
                .query(`
                    UPDATE movies
                    SET status = @status
                    WHERE movie_id = @movie_id
                `);

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ message: 'Movie not found' });
            }

            res.status(200).json({ message: 'Movie status updated successfully' });
        } catch (err) {
            console.error('Error updating movie status:', err.stack || err.message);
            res.status(500).json({ message: 'Error updating movie status', error: err.message });
        }
    }
);


module.exports = router;