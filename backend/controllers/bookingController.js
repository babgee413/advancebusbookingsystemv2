const pool = require('../config/database');
const crypto = require('crypto');

function generateTicketNumber() {
  return `BT-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
}

// Find or create a pending booking for a user+trip (handles payment retry).
function findOrCreatePendingBooking(connection, user_id, trip_id, ticket_number, amount) {
  return connection.query(
    `SELECT * FROM bookings WHERE user_id = ? AND trip_id = ? AND booking_status IN ('pending_payment','confirmed') LIMIT 1 FOR UPDATE`,
    [user_id, trip_id]
  );
}

// Randomly pick a free seat for a trip. Caller MUST already hold the trip row lock (FOR UPDATE).
async function pickAvailableSeat(connection, trip_id, capacity) {
  const [rows] = await connection.query(
    `SELECT seat_number FROM bookings
     WHERE trip_id = ? AND seat_number IS NOT NULL
       AND booking_status IN ('pending_payment','confirmed')`,
    [trip_id]
  );
  const taken = new Set(rows.map(r => String(r.seat_number)));
  const free = [];
  for (let i = 1; i <= capacity; i++) {
    const seat = String(i);
    if (!taken.has(seat)) free.push(seat);
  }
  if (free.length === 0) return null;
  return free[crypto.randomInt(free.length)];
}

exports.createBooking = async (req, res) => {
  let connection;
  try {
    const { trip_id, notes } = req.body;
    const user_id = req.user.user_id;

    if (!trip_id) {
      return res.status(400).json({ success: false, message: 'Trip ID is required' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [trips] = await connection.query(
      'SELECT * FROM trips WHERE trip_id = ? FOR UPDATE',
      [trip_id]
    );

    if (trips.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const trip = trips[0];

    if (trip.status !== 'scheduled') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This trip is not available for booking' });
    }

    const [existing] = await findOrCreatePendingBooking(connection, user_id, trip_id);

    if (existing.length > 0) {
      const booking = existing[0];
      await connection.rollback();
      return res.status(200).json({
        success: true,
        message: 'You already have a booking for this trip',
        data: {
          booking_id: booking.booking_id,
          ticket_number: booking.ticket_number,
          seat_number: booking.seat_number,
          booking_status: booking.booking_status,
          payment_status: booking.payment_status,
          amount_paid: booking.amount_paid,
          origin: trip.origin,
          destination: trip.destination,
          departure_date: trip.departure_date,
          departure_time: trip.departure_time,
          existing_booking: true
        }
      });
    }

    let ticket_number = generateTicketNumber();
    let seat_number = await pickAvailableSeat(connection, trip_id, trip.capacity);

    if (!seat_number) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Sorry, this bus is fully booked. No seats are available for this trip.'
      });
    }

    let insertResult = null;
    let attempts = 0;

    while (!insertResult && attempts < 5) {
      try {
        const [result] = await connection.query(
          `INSERT INTO bookings (user_id, trip_id, ticket_number, seat_number, booking_status, payment_status, amount_paid, notes)
           VALUES (?, ?, ?, ?, 'pending_payment', 'unpaid', ?, ?)`,
          [user_id, trip_id, ticket_number, seat_number, trip.price, notes || null]
        );
        insertResult = result;
      } catch (insertErr) {
        if (insertErr.code === 'ER_DUP_ENTRY' && insertErr.message.includes('unique_trip_seat')) {
          seat_number = await pickAvailableSeat(connection, trip_id, trip.capacity);
          if (!seat_number) {
            await connection.rollback();
            return res.status(409).json({
              success: false,
              message: 'Sorry, this bus is fully booked. No seats are available for this trip.'
            });
          }
          attempts++;
        } else if (insertErr.code === 'ER_DUP_ENTRY' && insertErr.message.includes('ticket_number')) {
          ticket_number = generateTicketNumber();
          attempts++;
        } else {
          throw insertErr;
        }
      }
    }

    if (!insertResult) {
      await connection.rollback();
      return res.status(500).json({ success: false, message: 'Unable to create booking. Please try again.' });
    }

    const booking_id = insertResult.insertId;
    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Booking created. Please complete payment.',
      data: {
        booking_id,
        ticket_number,
        seat_number,
        booking_status: 'pending_payment',
        payment_status: 'unpaid',
        amount_paid: trip.price,
        origin: trip.origin,
        destination: trip.destination,
        departure_date: trip.departure_date,
        departure_time: trip.departure_time
      }
    });
  } catch (error) {
    console.error('createBooking error:', error.code, error.message);
    if (connection) await connection.rollback().catch(() => {});
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({ success: false, message: "We're having trouble connecting right now. Please try again in a moment." });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'You already have an active booking for this trip.' });
    }
    res.status(500).json({ success: false, message: 'Unable to create booking. Please try again.' });
  } finally {
    if (connection) connection.release();
  }
};

exports.getMyBookings = async (req, res) => {
  try {
    const [bookings] = await pool.query(`
      SELECT b.*, t.origin, t.destination, t.departure_date, t.departure_time,
             t.price as trip_price, bu.bus_name, bu.bus_number
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN buses bu ON t.bus_id = bu.bus_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `, [req.user.user_id]);
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const [bookings] = await pool.query(`
      SELECT b.*, t.origin, t.destination, t.departure_date, t.departure_time,
             t.price as trip_price, bu.bus_name, bu.bus_number,
             u.full_name as passenger_name, u.registration_number, u.email as passenger_email
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN buses bu ON t.bus_id = bu.bus_id
      JOIN users u ON b.user_id = u.user_id
      WHERE b.booking_id = ?
    `, [req.params.id]);

    if (bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (req.user.role !== 'admin' && bookings[0].user_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: bookings[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch booking' });
  }
};

exports.getAllBookings = async (req, res) => {
  try {
    let query = `
      SELECT b.*, t.origin, t.destination, t.departure_date, t.departure_time,
             bu.bus_name, bu.bus_number,
             u.full_name as passenger_name, u.registration_number, u.email as passenger_email
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN buses bu ON t.bus_id = bu.bus_id
      JOIN users u ON b.user_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    const { status, payment_status, origin, destination, date, search } = req.query;

    if (status) {
      query += ' AND b.booking_status = ?';
      params.push(status);
    }
    if (payment_status) {
      query += ' AND b.payment_status = ?';
      params.push(payment_status);
    }
    if (origin) {
      query += ' AND t.origin = ?';
      params.push(origin);
    }
    if (destination) {
      query += ' AND t.destination = ?';
      params.push(destination);
    }
    if (date) {
      query += ' AND t.departure_date = ?';
      params.push(date);
    }
    if (search) {
      query += ' AND (b.ticket_number LIKE ? OR u.registration_number LIKE ? OR u.full_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY b.created_at DESC';

    const [bookings] = await pool.query(query, params);
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
  }
};

exports.rejectBooking = async (req, res) => {
  let connection;
  try {
    const { reason } = req.body;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      "SELECT * FROM bookings WHERE booking_id = ? AND booking_status = 'confirmed' FOR UPDATE",
      [req.params.id]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Confirmed booking not found' });
    }

    const booking = bookings[0];

    await connection.query(
      "UPDATE bookings SET booking_status = 'rejected', seat_number = NULL, rejection_reason = ? WHERE booking_id = ?",
      [reason || 'Rejected by administrator', req.params.id]
    );
    await connection.query(
      'UPDATE trips SET confirmed_passengers = GREATEST(confirmed_passengers - 1, 0) WHERE trip_id = ?',
      [booking.trip_id]
    );
    await connection.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, 'Booking Rejected', ?, 'booking')`,
      [booking.user_id, `Your booking ${booking.ticket_number} was rejected.${reason ? ' Reason: ' + reason : ''}`]
    );
    await connection.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values) VALUES (?, ?, ?, ?, ?)',
      [req.user.user_id, 'reject_booking', 'booking', req.params.id,
       JSON.stringify({ booking_status: 'confirmed', seat_number: booking.seat_number })]
    );

    await connection.commit();
    res.json({ success: true, message: 'Booking rejected' });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ success: false, message: 'Failed to reject booking' });
  } finally {
    if (connection) connection.release();
  }
};

exports.rescheduleBooking = async (req, res) => {
  let connection;
  try {
    const { new_trip_id } = req.body;
    if (!new_trip_id) {
      return res.status(400).json({ success: false, message: 'New trip ID is required' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      "SELECT * FROM bookings WHERE booking_id = ? AND booking_status = 'confirmed' FOR UPDATE",
      [req.params.id]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Confirmed booking not found' });
    }

    const booking = bookings[0];

    const [newTrips] = await connection.query(
      'SELECT * FROM trips WHERE trip_id = ? FOR UPDATE',
      [new_trip_id]
    );
    if (newTrips.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'New trip not found' });
    }
    const newTrip = newTrips[0];

    const [oldTrips] = await connection.query('SELECT * FROM trips WHERE trip_id = ?', [booking.trip_id]);
    const oldTrip = oldTrips[0];

    if (oldTrip.origin !== newTrip.origin || oldTrip.destination !== newTrip.destination) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'New trip must have the same origin and destination' });
    }

    if (newTrip.status !== 'scheduled') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'New trip is not available for booking' });
    }

    const newSeat = await pickAvailableSeat(connection, new_trip_id, newTrip.capacity);
    if (!newSeat) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'New trip is fully booked. No seats are available.' });
    }

    await connection.query(
      'UPDATE trips SET confirmed_passengers = GREATEST(confirmed_passengers - 1, 0) WHERE trip_id = ?',
      [booking.trip_id]
    );
    await connection.query(
      'UPDATE trips SET confirmed_passengers = confirmed_passengers + 1 WHERE trip_id = ?',
      [new_trip_id]
    );

    const newTicketNumber = generateTicketNumber();
    await connection.query(
      `UPDATE bookings SET trip_id = ?, booking_status = 'confirmed', rescheduled_from = ?, ticket_number = ?, seat_number = ?
       WHERE booking_id = ?`,
      [new_trip_id, booking.trip_id, newTicketNumber, newSeat, req.params.id]
    );

    await connection.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, 'Trip Rescheduled', ?, 'schedule_change')`,
      [booking.user_id, `Your booking ${booking.ticket_number} has been rescheduled. New ticket: ${newTicketNumber}, Seat: ${newSeat}. New departure: ${newTrip.departure_date} at ${newTrip.departure_time}.`]
    );
    await connection.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.user_id, 'reschedule_booking', 'booking', req.params.id,
       JSON.stringify({ trip_id: booking.trip_id, ticket_number: booking.ticket_number, seat_number: booking.seat_number }),
       JSON.stringify({ trip_id: new_trip_id, ticket_number: newTicketNumber, seat_number: newSeat })]
    );

    await connection.commit();

    const [updated] = await pool.query(`
      SELECT b.*, t.origin, t.destination, t.departure_date, t.departure_time,
             bu.bus_name, bu.bus_number,
             u.full_name as passenger_name, u.registration_number
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN buses bu ON t.bus_id = bu.bus_id
      JOIN users u ON b.user_id = u.user_id
      WHERE b.booking_id = ?
    `, [req.params.id]);

    res.json({ success: true, message: 'Booking rescheduled', data: updated[0] });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ success: false, message: 'Failed to reschedule booking' });
  } finally {
    if (connection) connection.release();
  }
};

exports.cancelBooking = async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      "SELECT * FROM bookings WHERE booking_id = ? AND booking_status IN ('pending_payment','confirmed') FOR UPDATE",
      [req.params.id]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found or cannot be cancelled' });
    }

    const booking = bookings[0];

    if (req.user.role !== 'admin' && booking.user_id !== req.user.user_id) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await connection.query(
      "UPDATE bookings SET booking_status = 'cancelled', seat_number = NULL WHERE booking_id = ?",
      [req.params.id]
    );

    if (booking.booking_status === 'confirmed') {
      await connection.query(
        'UPDATE trips SET confirmed_passengers = GREATEST(confirmed_passengers - 1, 0) WHERE trip_id = ?',
        [booking.trip_id]
      );
    }

    if (booking.payment_status === 'paid') {
      await connection.query(
        "UPDATE bookings SET payment_status = 'refunded' WHERE booking_id = ?",
        [req.params.id]
      );
    }

    await connection.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values) VALUES (?, ?, ?, ?, ?)',
      [req.user.user_id, 'cancel_booking', 'booking', req.params.id,
       JSON.stringify({ booking_status: booking.booking_status, payment_status: booking.payment_status, seat_number: booking.seat_number })]
    );

    await connection.commit();
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ success: false, message: 'Failed to cancel booking' });
  } finally {
    if (connection) connection.release();
  }
};

exports.markNoShow = async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      "SELECT * FROM bookings WHERE booking_id = ? AND booking_status = 'confirmed' FOR UPDATE",
      [req.params.id]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Confirmed booking not found' });
    }

    const booking = bookings[0];

    await connection.query(
      "UPDATE bookings SET booking_status = 'no_show', seat_number = NULL WHERE booking_id = ?",
      [req.params.id]
    );
    await connection.query(
      'UPDATE trips SET confirmed_passengers = GREATEST(confirmed_passengers - 1, 0) WHERE trip_id = ?',
      [booking.trip_id]
    );
    await connection.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, 'Marked No-Show', 'You were marked as a no-show for your scheduled bus. Missed buses are non-refundable.', 'info')`,
      [booking.user_id]
    );
    await connection.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values) VALUES (?, ?, ?, ?, ?)',
      [req.user.user_id, 'mark_no_show', 'booking', req.params.id,
       JSON.stringify({ booking_status: 'confirmed', seat_number: booking.seat_number })]
    );

    await connection.commit();
    res.json({ success: true, message: 'Passenger marked as no-show' });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ success: false, message: 'Failed to mark no-show' });
  } finally {
    if (connection) connection.release();
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user.user_id]
    );
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?',
      [req.params.id, req.user.user_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
};

exports.getAuditLog = async (req, res) => {
  try {
    const [logs] = await pool.query(`
      SELECT a.*, u.full_name as admin_name
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.user_id
      ORDER BY a.created_at DESC
      LIMIT 50
    `);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch audit log' });
  }
};
