require('dotenv').config();
const express = require('express');
const dbConfig = require('../config/dbConfig');
const {body, validationResult} = require('express-validator');

const router = express.Router();

const VALID_API_KEY = process.env.ADMIN_APIKEY;

router.post('/add-theater',
    [
        (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== VALID_API_KEY) {
                return res.status(403).json({message: 'Forbidden: Invalid API Key'});
            }
            next();
        },

        body('theater_name').notEmpty().withMessage('Theater name is required'),
        body('location').notEmpty().withMessage('Location is required'),
        body('total_seats')
            .isInt({min: 1})
            .withMessage('Total seats must be a positive integer')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({errors: errors.array()});
        }

        const {theater_name, location, total_seats} = req.body;

        try {
            const pool = await dbConfig.connectToDatabase();

            await pool.request()
                .input('theater_name', theater_name)
                .input('location', location)
                .input('total_seats', total_seats)
                .query(`
                    INSERT INTO theaters (theater_name, location, total_seats)
                    VALUES (@theater_name, @location, @total_seats)
                `);

            res.status(201).json({message: 'Theater added successfully'});
        } catch (err) {
            console.error('Error adding theater:', err.stack || err.message);
            res.status(500).json({message: 'Error adding theater', error: err.message});
        }
    }
);

router.get('/get-theaters', async (req, res) => {
    try {
        const pool = await dbConfig.connectToDatabase();
        const result = await pool.request().query('SELECT * FROM theaters');

        if (result.recordset.length === 0) {
            return res.status(404).json({message: 'No theaters found'});
        }

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching theaters:', err.stack || err.message);
        res.status(500).json({message: 'Error fetching theaters', error: err.message});
    }
});

router.delete('/delete-theater/:id',
    [(req, res, next) => {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey !== VALID_API_KEY) {
            return res.status(403).json({message: 'Forbidden: Invalid API Key'});
        }
        next();
    },]
    , async (req, res) => {
        const {id} = req.params;

        try {
            const pool = await dbConfig.connectToDatabase();
            const result = await pool.request()
                .input('id', id)
                .query('DELETE FROM theaters WHERE theater_id = @id');

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({message: 'Theater not found'});
            }

            res.status(200).json({message: 'Theater deleted successfully'});
        } catch (err) {
            console.error('Error deleting theater:', err.stack || err.message);
            res.status(500).json({message: 'Error deleting theater', error: err.message});
        }
    });

module.exports = router;
