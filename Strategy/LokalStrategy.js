const passport = require('passport');
const { Strategy } = require('passport-local');
const dbConfig = require('../config/dbConfig');
const bcrypt = require('bcryptjs');

passport.use(
    new Strategy(
        {usernameField: 'email', passwordField: 'password'}, async (email, password, done) => {
            try {

                const pool = await dbConfig.connectToDatabase();

                const result = await pool
                    .request()
                    .input('email', email)
                    .query('SELECT * FROM users WHERE email = @email');

                const user = result.recordset[0]; 

                if (!user) {
                    return done(null, false, { message: 'User not found' });
                }

                console.log('Comparing passwords:', { plainPassword: password, hashedPassword: user.password_hash });
                
                const isMatch = await bcrypt.compare(password, user.password_hash);

                if (!isMatch) {
                    return done(null, false, { message: 'Invalid Password' });
                
                }
                    
                return done(null, user);

            } catch (err) {
                return done(err, null);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const pool = await dbConfig.connectToDatabase();
        const result = await pool
            .request()
            .input('id', id)
            .query('SELECT * FROM users WHERE user_id = @id');
        const user = result.recordset[0];
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

