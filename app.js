const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const passport = require('passport');
const cors = require('cors');
require('./Strategy/LokalStrategy');

const app = express(); 

app.use(cors());
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
const TransactionRouter = require('./routes/transaction');
const PaymentRouter = require('./routes/payments');
const TicketGroupsRouter = require('./routes/GroupTicket');

app.use('/users', usersRouter);
app.use('/films', filmsRouter);
app.use('/theaters', theaterRouter);
app.use('/showtimes', showtimesRouter);
app.use('/seats', seatsRouter);
app.use('/tickets', ticketsRouter);
app.use('/transaction', TransactionRouter);
app.use('/payments', PaymentRouter);
app.use('/TicketGroup', TicketGroupsRouter);

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