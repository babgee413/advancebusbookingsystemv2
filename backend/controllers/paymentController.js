const pool = require('../config/database');

exports.simulatePayment = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { booking_id, method } = req.body;
    const user_id = req.user.user_id;

    if (!booking_id) {
      return res.status(400).json({ success: false, message: 'Booking ID is required' });
    }

    await connection.beginTransaction();

    // Lock booking row
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
      return res.status(400).json({ success: false, message: 'Payment already completed' });
    }

    if (booking.booking_status !== 'pending_payment') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This booking cannot accept payment' });
    }

    // Lock the trip to check capacity
    const [trips] = await connection.query(
      'SELECT * FROM trips WHERE trip_id = ? FOR UPDATE',
      [booking.trip_id]
    );

    const trip = trips[0];
    if (trip.confirmed_passengers >= trip.capacity) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'This bus is now fully booked. Payment cannot be processed.' });
    }

    // Simulate payment success (90% success rate for demo)
    const paymentSuccessful = Math.random() > 0.1;
    const reference = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

    if (paymentSuccessful) {
      // Record payment
      await connection.query(
        `INSERT INTO payments (booking_id, amount, method, reference, status, transaction_id, verified_at)
         VALUES (?, ?, ?, ?, 'successful', ?, NOW())`,
        [booking.booking_id, booking.amount_paid, method || 'card', reference, reference]
      );

      // Confirm booking
      await connection.query(
        "UPDATE bookings SET booking_status = 'confirmed', payment_status = 'paid', payment_date = NOW() WHERE booking_id = ?",
        [booking_id]
      );

      // Increment confirmed passengers on trip
      await connection.query(
        'UPDATE trips SET confirmed_passengers = confirmed_passengers + 1 WHERE trip_id = ?',
        [booking.trip_id]
      );

      // Notify user
      await connection.query(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES (?, 'Payment Confirmed', ?, 'payment')`,
        [user_id, `Your payment of ₦${booking.amount_paid.toLocaleString()} for Ticket ${booking.ticket_number} was successful. Your booking is now confirmed!`]
      );

      // Audit log
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
          amount_paid: booking.amount_paid,
          payment_reference: reference,
          booking_status: 'confirmed',
          payment_status: 'paid'
        }
      });
    } else {
      // Payment failed
      await connection.query(
        `INSERT INTO payments (booking_id, amount, method, reference, status)
         VALUES (?, ?, ?, ?, 'failed')`,
        [booking.booking_id, booking.amount_paid, method || 'card', reference]
      );

      await connection.query(
        "UPDATE bookings SET booking_status = 'pending_payment', payment_status = 'failed' WHERE booking_id = ?",
        [booking_id]
      );

      await connection.commit();

      res.status(402).json({
        success: false,
        message: 'Payment failed. Please try again.',
        data: { reference, payment_status: 'failed' }
      });
    }
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Payment processing failed: ' + error.message });
  } finally {
    connection.release();
  }
};

exports.getPaymentByBooking = async (req, res) => {
  try {
    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.booking_id]
    );
    res.json({ success: true, data: payments[0] || null });
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
