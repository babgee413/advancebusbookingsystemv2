const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const config = require('./config/config');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const tripRoutes = require('./routes/tripRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const busRoutes = require('./routes/busRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const ticketRoutes = require('./routes/ticketRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tickets', ticketRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ATBU Bus Booking API is running' });
});

// Frontend pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '../frontend/register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dashboard.html')));
app.get('/trips', (req, res) => res.sendFile(path.join(__dirname, '../frontend/trips.html')));
app.get('/booking', (req, res) => res.sendFile(path.join(__dirname, '../frontend/booking.html')));
app.get('/bookings', (req, res) => res.sendFile(path.join(__dirname, '../frontend/bookings.html')));
app.get('/ticket', (req, res) => res.sendFile(path.join(__dirname, '../frontend/ticket.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin/dashboard.html')));
app.get('/admin/buses', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin/buses.html')));
app.get('/admin/trips', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin/trips.html')));
app.get('/admin/bookings', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin/bookings.html')));

app.use(errorHandler);

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`ATBU Bus Booking Server running on port ${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});

module.exports = app;
