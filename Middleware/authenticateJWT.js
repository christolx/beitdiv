require('dotenv').config();
const jwt = require('jsonwebtoken');

function authenticateJWT(req, res, next) {

    const authHeader = req.headers['authorization']; 
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) {
            console.error('Token verification error:', err);
            return res.status(403).json({ message: 'Invalid token' });
        }

        req.user = user; 
        next(); 
    });
}

module.exports = authenticateJWT;