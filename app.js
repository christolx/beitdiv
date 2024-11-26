const dbConfig = require('./config/dbConfig');
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const passport = require('passport');
const session = require('express-session');
require('./Strategy/LokalStrategy');

const app = express(); 

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(passport.initialize());

// index router (default expressJS)
app.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

const usersRouter = require('./routes/users');
const filmsRouter = require('./routes/films');
const theaterRouter = require('./routes/theaters');
const showtimesRouter = require('./routes/showtimes');
const seatsRouter = require('./routes/seats');
const ticketsRouter = require('./routes/tickets');

app.use('/users', usersRouter);
app.use('/films', filmsRouter);
app.use('/theaters', theaterRouter);
app.use('/showtimes', showtimesRouter);
app.use('/seats', seatsRouter);
app.use('/tickets', ticketsRouter);

// Catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// Error handler
app.use(function (err, req, res, next) {
  // Set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;