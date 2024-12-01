require('dotenv').config();
const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const authenticateJWT = require('../Middleware/authenticateJWT');
const bcrypt = require('bcryptjs');
const dbConfig = require('../config/dbConfig');
const {body, validationResult} = require('express-validator');

const router = express.Router();

router.post('/login',
    [
        body('email').isEmail().withMessage('Invalid email format'),
        body('password').notEmpty().withMessage('Password is required')
    ], async (req, res, next) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({errors: errors.array()});
        }

        passport.authenticate('local', {session: false}, async (err, user, info) => {
            if (err) {
                console.error('Error during authentication:', err);
                return res.status(500).json({message: 'An error occurred', error: err})
            }
            if (!user) {
                console.error('Authentication failed:', info);
                return res.status(401).json({message: 'Invalid credentials'});
            }


            try {
                const payload = {id: user.user_id, email: user.email, phone: user.phone_number};
                const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'});
                const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET);

                const pool = await dbConfig.connectToDatabase();
                await pool.request()
                    .input('user_id', user.user_id)
                    .query('DELETE FROM refresh_tokens WHERE user_id = @user_id');

                await pool.request()
                    .input('user_id', user.user_id)
                    .input('token', refreshToken)
                    .input('expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
                    .query(`
        INSERT INTO refresh_tokens (user_id, token, expires_at)
        VALUES (@user_id, @token, @expires_at)
    `);

                res.json({message: 'Login successful', accessToken, refreshToken});
            } catch (dbError) {
                console.error('Error storing refresh token:', dbError);
                res.status(500).json({message: 'Error storing refresh token', error: dbError.message});
            }
        })(req, res, next);
    });

router.get('/profile', authenticateJWT, async (req, res, next) => {
    try {
        const pool = await dbConfig.connectToDatabase();
        const result = await pool
            .request()
            .input('id', req.user.id)
            .query('SELECT * FROM users WHERE user_id = @id');

        console.log('Fetched User Profile:', result.recordset[0]);

        if (!result.recordset[0]) {
            return res.status(404).json({message: 'User not found'});
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching user profile:', err);
        res.status(500).send('Error fetching profile');
    }
});

router.post('/register',
    [
        body('fullName')
            .isLength({min: 3})
            .withMessage('Full name must be at least 3 characters long'),
        body('email').isEmail().withMessage('Invalid email format'),
        body('password')
            .isLength({min: 8})
            .withMessage('Password must be at least 8 characters long'),
        body('phoneNumber')
            .isMobilePhone()
            .withMessage('Invalid phone number format'),
        body('address').notEmpty().withMessage('Address is required'),
    ], async (req, res, next) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({errors: errors.array()});
        }

        const {fullName, email, password, phoneNumber, address} = req.body;

        if (!fullName || !email || !password || !phoneNumber || !address) {
            console.log(req.body);
            return res.status(400).json({message: 'All fields are required'});
        }

        try {

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const pool = await dbConfig.connectToDatabase();
            await pool
                .request()
                .input('fullName', fullName)
                .input('email', email)
                .input('password', hashedPassword)
                .input('phone_number', phoneNumber)
                .input('address', address)
                .query(`
                INSERT INTO users (full_name, email, password_hash, phone_number, address)
                VALUES (@fullName, @email, @password, @phone_number, @address)
            `);


            res.status(201).json({message: 'User registered successfully'});
        } catch (err) {
            console.error('Error registering user:', err.stack || err.message);
            res.status(500).json({
                message: 'Error registering user',
                error: err.message || 'Unknown error occurred'
            });
        }
    });

router.post('/token', [
        body('token').notEmpty().withMessage('Refresh token is required'),]
    , async (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({errors: errors.array()});
        }

        const {token} = req.body;

        if (!token) {
            return res.status(401).json({message: 'Refresh token is required'}); // Jika token tidak ada
        }

        try {
            const pool = await dbConfig.connectToDatabase();
            const result = await pool.request()
                .input('token', token)
                .query('SELECT * FROM refresh_tokens WHERE token = @token');

            const refreshTokenRecord = result.recordset[0]; // Ambil hasil query

            if (!refreshTokenRecord) {
                return res.status(403).json({message: 'Invalid refresh token'}); // Jika token tidak ditemukan
            }

            if (new Date(refreshTokenRecord.expires_at) < new Date()) {
                return res.status(403).json({message: 'Refresh token expired'});
            }

            jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
                if (err) {
                    return res.status(403).json({message: 'Invalid refresh token'});
                }

                const newAccessToken = jwt.sign({id: user.id, email: user.email}, process.env.ACCESS_TOKEN_SECRET, {
                    expiresIn: '1h',
                });

                res.json({accessToken: newAccessToken});
            });
        } catch (err) {
            console.error('Error validating refresh token:', err);
            res.status(500).json({message: 'Error validating refresh token', error: err.message});
        }
    });

router.post('/logout', [body('token').notEmpty().withMessage('Refresh token is required'),], async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({errors: errors.array()});
    }

    const {token} = req.body;

    if (!token) {
        return res.status(400).json({message: 'Refresh token is required'});
    }

    try {
        const pool = await dbConfig.connectToDatabase();
        const result = await pool.request()
            .input('token', token)
            .query('SELECT * FROM refresh_tokens WHERE token = @token');

        const refreshTokenRecord = result.recordset[0];

        if (!refreshTokenRecord) {
            return res.status(404).json({message: 'Refresh token not found'});
        }

        await pool.request()
            .input('token', token)
            .query('DELETE FROM refresh_tokens WHERE token = @token');

        res.json({message: 'Logged out successfully'});
    } catch (err) {
        console.error('Error deleting refresh token:', err);
        res.status(500).json({message: 'Error deleting refresh token', error: err.message});
    }
});

module.exports = router;