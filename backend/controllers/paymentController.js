const pool = require('../config/database');
const crypto = require('crypto');

const VALID_METHODS = ['card', 'bank_transfer', 'cash', 'wallet'];

function generatePaymentReference() {
  return `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function generateQrToken() {
  return crypto.randomBytes(24).toString('hex');
}

exports.simulatePayment = async (req, res) => {
  let connection;
  try {
    const { booking_id, method } = req.body;
    const user_id = req.user.user_id;

    if (!booking_id) {
      return res.status(400).json({ success: false, message: 'Booking ID is required' });
    }

    if (method && !VALID_METHODS.includes(method)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      "SELECT * FROM bookings WHERE booking_id = ? AND user_id = ? FOR UPDATE",
      [booking_id, user_id]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = bookings[0];

    if (booking.booking_status === 'confirmed' && booking.payment_status === 'paid') {
      await connection.rollback();
      return res.status(200).json({
        success: true,
        message: 'Payment already completed',
        data: {
          booking_id,
          ticket_number: booking.ticket_number,
          seat_number: booking.seat_number,
          amount_paid: booking.amount_paid,
          booking_status: booking.booking_status,
          payment_status: booking.payment_status,
          already_paid: true
        }
      });
    }

    if (booking.booking_status !== 'pending_payment') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This booking cannot accept payment' });
    }

    const [trips] = await connection.query(
      'SELECT * FROM trips WHERE trip_id = ? FOR UPDATE',
      [booking.trip_id]
    );

    const trip = trips[0];

    // Seat must be held for this booking (recovery for legacy bookings without a seat).
    if (!booking.seat_number) {
      const [taken] = await connection.query(
        `SELECT seat_number FROM bookings
         WHERE trip_id = ? AND seat_number IS NOT NULL
           AND booking_status IN ('pending_payment','confirmed') AND booking_id != ?`,
        [booking.trip_id, booking_id]
      );
      const takenSet = new Set(taken.map(r => String(r.seat_number)));
      let freeSeat = null;
      for (let i = 1; i <= trip.capacity; i++) {
        if (!takenSet.has(String(i))) { freeSeat = String(i); break; }
      }
      if (!freeSeat) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'This bus is now fully booked. Payment cannot be processed.' });
      }
      await connection.query('UPDATE bookings SET seat_number = ? WHERE booking_id = ?', [freeSeat, booking_id]);
      booking.seat_number = freeSeat;
    }

    const reference = generatePaymentReference();
    const qrToken = generateQrToken();

    await connection.query(
      `INSERT INTO payments (booking_id, amount, method, reference, status, transaction_id, verified_at)
       VALUES (?, ?, ?, ?, 'successful', ?, NOW())`,
      [booking.booking_id, booking.amount_paid, method || 'card', reference, reference]
    );

    await connection.query(
      `UPDATE bookings SET booking_status = 'confirmed', payment_status = 'paid', payment_date = NOW(), qr_token = ?
       WHERE booking_id = ?`,
      [qrToken, booking_id]
    );

    await connection.query(
      'UPDATE trips SET confirmed_passengers = confirmed_passengers + 1 WHERE trip_id = ?',
      [booking.trip_id]
    );

    await connection.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, 'Payment Confirmed', ?, 'payment')`,
      [user_id, `Your payment of ₦${Number(booking.amount_paid).toLocaleString()} for Ticket ${booking.ticket_number} was successful. Your booking is now confirmed!`]
    );

    await connection.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?)',
      [user_id, 'payment_confirmed', 'booking', booking_id, JSON.stringify({ reference, amount: booking.amount_paid })]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Payment successful! Your booking is confirmed.',
      data: {
        booking_id,
        ticket_number: booking.ticket_number,
        seat_number: booking.seat_number,
        amount_paid: booking.amount_paid,
        payment_reference: reference,
        booking_status: 'confirmed',
        payment_status: 'paid',
        qr_token: qrToken
      }
    });
  } catch (error) {
    console.error('Payment error:', error.code, error.message);
    if (connection) {
      await connection.rollback().catch(() => {});
    }
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({ success: false, message: "We're having trouble connecting right now. Please try again in a moment." });
    }
    res.status(500).json({ success: false, message: 'Payment processing failed. Please try again.' });
  } finally {
    if (connection) connection.release();
  }
};

exports.getPaymentByBooking = async (req, res) => {
  try {
    const [payments] = await pool.query(
      `SELECT p.*, b.user_id FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       WHERE p.booking_id = ? ORDER BY p.created_at DESC LIMIT 1`,
      [req.params.booking_id]
    );

    if (payments.length === 0) {
      return res.json({ success: true, data: null });
    }

    if (req.user.role !== 'admin' && payments[0].user_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { user_id, ...payment } = payments[0];
    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payment' });
  }
};

exports.getAllPayments = async (req, res) => {
  try {
    const [payments] = await pool.query(`
      SELECT p.*, b.ticket_number, b.user_id, u.full_name, u.registration_number
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN users u ON b.user_id = u.user_id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payments' });
  }
};
