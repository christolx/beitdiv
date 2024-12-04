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
            return res.status(404).json({message: 'No movies found'});
        }

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching movies:', err.stack || err.message);
        res.status(500).json({message: 'Error fetching movies', error: err.message});
    }
});

// Get movie with STATUS () and additional OPTIONAL query for filtering based off of theater id or keyword.
router.get('/movies/:status', async (req, res) => {
    try {
        const {status} = req.params;
        const {theater_id, keyword} = req.query;
        const validStatuses = ['Upcoming', 'Tayang', 'Archived'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                message: 'Invalid status. Valid statuses are Upcomguing, Tayang, or Archived.'
            });
        }

        const pool = await dbConfig.connectToDatabase();
        const request = pool.request();

        let query = `
            SELECT DISTINCT 
                m.movie_id, 
                m.movie_name, 
                m.age_rating, 
                m.duration, 
                m.dimension, 
                m.language, 
                m.release_date, 
                m.poster_link, 
                m.status 
            FROM movies m
        `;

        const whereConditions = [];
        const queryParams = {status};

        whereConditions.push('m.status = @status');

        if (theater_id) {
            query += ` JOIN showtimes s ON m.movie_id = s.movie_id
                       JOIN theaters t ON s.theater_id = t.theater_id`;
            whereConditions.push('t.theater_id = @theater_id');
            queryParams.theater_id = theater_id;
        }

        if (keyword) {
            if (keyword.trim() === '') {
                return res.status(400).json({message: 'Keyword cannot be empty'});
            }
            whereConditions.push('m.movie_name LIKE @keyword');
            queryParams.keyword = `%${keyword}%`;
        }

        query += ` WHERE ${whereConditions.join(' AND ')}`;

        Object.entries(queryParams).forEach(([key, value]) => {
            request.input(key, value);
        });

        const result = await request.query(query);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                message: 'No movies found matching the search criteria',
                searchParams: {status, theater_id, keyword}
            });
        }

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching movies:', err.stack || err.message);
        res.status(500).json({
            message: 'Error fetching movies',
            error: err.message
        });
    }
});

// GET method to fetch a specific movie details by movie_id
router.get('/movie/:movie_id', async (req, res) => {
    const {movie_id} = req.params;

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
            return res.status(404).json({message: 'Movie not found'});
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching movie:', err.stack || err.message);
        res.status(500).json({message: 'Error fetching movie', error: err.message});
    }
});

router.post('/insert-movie',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== FILM_APIKEY) {
                return res.status(403).json({message: 'Forbidden: Invalid API Key'});
            }
            next();
        },
        body('movie_name').notEmpty().withMessage('Movie name is required'),
        body('age_rating').notEmpty().withMessage('Age rating is required'),
        body('duration').isInt({min: 1}).withMessage('Duration must be a positive integer'),
        body('dimension').isIn(['2D', '3D', 'IMAX']).withMessage('Dimension must be either 2D, 3D, or IMAX'),
        body('language').notEmpty().withMessage('Language is required'),
        body('release_date').isDate().withMessage('Invalid release date format'),
        body('poster_link').isURL().withMessage('poster_link should be a String.'),
        body('status')
            .isIn(['Upcoming', 'Tayang', 'Archived'])
            .withMessage('Status must be either Upcoming, Tayang, or Archived'),
        body('genre').optional().isString().withMessage('Genre must be a string'),
        body('producer').optional().isString().withMessage('Producer must be a string'),
        body('director').optional().isString().withMessage('Director must be a string'),
        body('trailer_link').optional().isURL().withMessage('Trailer link must be a valid URL'),
        body('synopsis').optional().isString().withMessage('Synopsis must be a string')
    ],
    async (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({errors: errors.array()});
        }

        const {
            movie_name,
            age_rating,
            duration,
            dimension,
            language,
            release_date,
            poster_link,
            status,
            genre,
            producer,
            director,
            trailer_link,
            synopsis
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
                .input('genre', genre)
                .input('producer', producer)
                .input('director', director)
                .input('trailer_link', trailer_link)
                .input('synopsis', synopsis)
                .query(`
                    INSERT INTO movies 
                    (movie_name, age_rating, duration, dimension, language, release_date, poster_link, status, genre, producer, director, trailer_link, synopsis)
                    VALUES 
                    (@movie_name, @age_rating, @duration, @dimension, @language, @release_date, @poster_link, @status, @genre, @producer, @director, @trailer_link, @synopsis)
                `);

            res.status(201).json({message: 'Movie added successfully'});
        } catch (err) {
            console.error('Error adding movie:', err.stack || err.message);
            res.status(500).json({message: 'Error adding movie', error: err.message});
        }
    }
);

// DELETE method to delete a movie
router.delete('/delete-movie/:movie_id',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== FILM_APIKEY) {
                return res.status(403).json({message: 'Forbidden: Invalid API Key'});
            }
            next();
        }
    ],
    async (req, res) => {
        const {movie_id} = req.params;

        try {
            const pool = await dbConfig.connectToDatabase();

            const result = await pool.request()
                .input('movie_id', movie_id)
                .query(`
                    DELETE FROM movies
                    WHERE movie_id = @movie_id
                `);

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({message: 'Movie not found'});
            }

            res.status(200).json({message: 'Movie deleted successfully'});
        } catch (err) {
            console.error('Error deleting movie:', err.stack || err.message);
            res.status(500).json({message: 'Error deleting movie', error: err.message});
        }
    }
);

// PUT method to update status
router.put('/update-movie-status/:movie_id',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== FILM_APIKEY) {
                return res.status(403).json({message: 'Forbidden: Invalid API Key'});
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
            return res.status(400).json({errors: errors.array()});
        }

        const {status} = req.body;
        const {movie_id} = req.params;

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
                return res.status(404).json({message: 'Movie not found'});
            }

            res.status(200).json({message: 'Movie status updated successfully'});
        } catch (err) {
            console.error('Error updating movie status:', err.stack || err.message);
            res.status(500).json({message: 'Error updating movie status', error: err.message});
        }
    }
);

router.get('/movie-details/:movie_id', async (req, res) => {
    const { movie_id } = req.params;

    try {
        const pool = await dbConfig.connectToDatabase();
        const result = await pool.request()
            .input('movie_id', movie_id)
            .query(`
                SELECT 
                    movie_name,
                    poster_link,
                    genre,
                    producer,
                    director,
                    trailer_link,
                    synopsis,
                    status
                FROM movies
                WHERE movie_id = @movie_id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Movie not found' });
        }

        const movie = result.recordset[0];

        movie.genre = movie.genre ? movie.genre.split(',').map(g => g.trim()) : [];

        res.status(200).json(movie);
    } catch (err) {
        console.error('Error fetching movie details:', err.stack || err.message);
        res.status(500).json({ message: 'Error fetching movie details', error: err.message });
    }
});


module.exports = router;