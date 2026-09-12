const pool = require('../config/database');

function generateTicketNumber() {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `BT-${year}-${rand}`;
}

exports.createBooking = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { trip_id } = req.body;
    const user_id = req.user.user_id;

    if (!trip_id) {
      return res.status(400).json({ success: false, message: 'Trip ID is required' });
    }

    await connection.beginTransaction();

    // Lock trip row to prevent concurrent overbooking
    const [tripRows] = await connection.query(
      'SELECT * FROM trips WHERE trip_id = ? FOR UPDATE',
      [trip_id]
    );

    if (tripRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const trip = tripRows[0];

    if (trip.status !== 'scheduled') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This trip is no longer available' });
    }

    if (trip.confirmed_passengers >= trip.capacity) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'This bus is fully booked' });
    }

    // Check if user already has an active booking for this trip
    const [existingBooking] = await connection.query(
      `SELECT booking_id FROM bookings 
       WHERE user_id = ? AND trip_id = ? AND booking_status IN ('pending_payment', 'confirmed')`,
      [user_id, trip_id]
    );

    if (existingBooking.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'You already have an active booking for this trip' });
    }

    const ticket_number = generateTicketNumber();

    const [result] = await connection.query(
      `INSERT INTO bookings (user_id, trip_id, ticket_number, booking_status, payment_status, amount_paid)
       VALUES (?, ?, ?, 'pending_payment', 'unpaid', ?)`,
      [user_id, trip_id, ticket_number, trip.price]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Booking created. Please complete payment.',
      data: {
        booking_id: result.insertId,
        ticket_number,
        trip_id,
        origin: trip.origin,
        destination: trip.destination,
        departure_date: trip.departure_date,
        departure_time: trip.departure_time,
        price: trip.price,
        booking_status: 'pending_payment'
      }
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'You already have an active booking for this trip' });
    }
    res.status(500).json({ success: false, message: 'Unable to create booking. Please try again.' });
  } finally {
    connection.release();
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

    if (bookings.length === 0) return res.status(404).json({ success: false, message: 'Booking not found' });

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
    const { status, payment_status, origin, destination, date, search } = req.query;

    let query = `
      SELECT b.*, t.origin, t.destination, t.departure_date, t.departure_time,
             t.price as trip_price, bu.bus_name, bu.bus_number,
             u.full_name as passenger_name, u.registration_number, u.email as passenger_email
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN buses bu ON t.bus_id = bu.bus_id
      JOIN users u ON b.user_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (status) { query += ' AND b.booking_status = ?'; params.push(status); }
    if (payment_status) { query += ' AND b.payment_status = ?'; params.push(payment_status); }
    if (origin) { query += ' AND t.origin = ?'; params.push(origin); }
    if (destination) { query += ' AND t.destination = ?'; params.push(destination); }
    if (date) { query += ' AND t.departure_date = ?'; params.push(date); }
    if (search) {
      query += ' AND (b.ticket_number LIKE ? OR u.registration_number LIKE ? OR u.full_name LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY b.created_at DESC';

    const [bookings] = await pool.query(query, params);
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
  }
};

exports.rejectBooking = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await connection.beginTransaction();
    const [bookings] = await connection.query(
      "SELECT * FROM bookings WHERE booking_id = ? AND booking_status = 'confirmed' FOR UPDATE",
      [id]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Confirmed booking not found' });
    }

    await connection.query(
      "UPDATE bookings SET booking_status = 'rejected', rejection_reason = ? WHERE booking_id = ?",
      [reason || 'Rejected by administrator', id]
    );

    await connection.query(
      'UPDATE trips SET confirmed_passengers = GREATEST(confirmed_passengers - 1, 0) WHERE trip_id = ?',
      [bookings[0].trip_id]
    );

    // Notify user
    await connection.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, 'Booking Rejected', ?, 'booking')`,
      [bookings[0].user_id, `Your booking (Ticket: ${bookings[0].ticket_number}) has been rejected. Reason: ${reason || 'Rejected by administrator'}`]
    );

    // Audit log
    await connection.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values) VALUES (?, ?, ?, ?, ?)',
      [req.user.user_id, 'reject_booking', 'booking', id, JSON.stringify({ booking_status: 'confirmed' })]
    );

    await connection.commit();
    res.json({ success: true, message: 'Booking rejected' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to reject booking' });
  } finally {
    connection.release();
  }
};

exports.rescheduleBooking = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { new_trip_id } = req.body;

    if (!new_trip_id) return res.status(400).json({ success: false, message: 'New trip ID is required' });

    await connection.beginTransaction();

    const [bookings] = await connection.query(
      "SELECT * FROM bookings WHERE booking_id = ? AND booking_status = 'confirmed' FOR UPDATE",
      [id]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Confirmed booking not found' });
    }

    const oldBooking = bookings[0];

    // Check new trip availability
    const [newTrips] = await connection.query(
      'SELECT * FROM trips WHERE trip_id = ? FOR UPDATE',
      [new_trip_id]
    );

    if (newTrips.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'New trip not found' });
    }

    const newTrip = newTrips[0];

    // Verify route compatibility
    const [oldTrip] = await connection.query('SELECT * FROM trips WHERE trip_id = ?', [oldBooking.trip_id]);
    if (oldTrip[0].origin !== newTrip.origin || oldTrip[0].destination !== newTrip.destination) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'New trip must have the same origin and destination' });
    }

    if (newTrip.confirmed_passengers >= newTrip.capacity) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'New trip is fully booked' });
    }

    // Decrement old trip, increment new trip
    await connection.query(
      'UPDATE trips SET confirmed_passengers = GREATEST(confirmed_passengers - 1, 0) WHERE trip_id = ?',
      [oldBooking.trip_id]
    );
    await connection.query(
      'UPDATE trips SET confirmed_passengers = confirmed_passengers + 1 WHERE trip_id = ?',
      [new_trip_id]
    );

    // Update booking
    await connection.query(
      "UPDATE bookings SET trip_id = ?, booking_status = 'confirmed', rescheduled_from = ? WHERE booking_id = ?",
      [new_trip_id, oldBooking.trip_id, id]
    );

    // Generate new ticket number
    const newTicket = `BT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    await connection.query('UPDATE bookings SET ticket_number = ? WHERE booking_id = ?', [newTicket, id]);

    // Notify user
    await connection.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, 'Booking Rescheduled', ?, 'schedule_change')`,
      [
        oldBooking.user_id,
        `Your booking (Ticket: ${oldBooking.ticket_number}) has been rescheduled to ${newTrip.origin} → ${newTrip.destination} on ${newTrip.departure_date} at ${newTrip.departure_time}. New ticket: ${newTicket}`
      ]
    );

    // Audit log
    await connection.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.user_id, 'reschedule_booking', 'booking', id,
       JSON.stringify({ trip_id: oldBooking.trip_id, ticket_number: oldBooking.ticket_number }),
       JSON.stringify({ trip_id: new_trip_id, ticket_number: newTicket })]
    );

    await connection.commit();

    const [updated] = await connection.query(
      `SELECT b.*, t.origin, t.destination, t.departure_date, t.departure_time, bu.bus_name, bu.bus_number
       FROM bookings b JOIN trips t ON b.trip_id = t.trip_id JOIN buses bu ON t.bus_id = bu.bus_id
       WHERE b.booking_id = ?`, [id]
    );

    res.json({ success: true, message: 'Booking rescheduled', data: updated[0] });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Unable to reschedule. Please try again.' });
  } finally {
    connection.release();
  }
};

exports.cancelBooking = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;

    await connection.beginTransaction();
    const [bookings] = await connection.query(
      "SELECT * FROM bookings WHERE booking_id = ? AND booking_status IN ('pending_payment', 'confirmed') FOR UPDATE",
      [id]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Active booking not found' });
    }

    if (req.user.role !== 'admin' && bookings[0].user_id !== user_id) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const booking = bookings[0];
    await connection.query("UPDATE bookings SET booking_status = 'cancelled' WHERE booking_id = ?", [id]);

    if (booking.booking_status === 'confirmed') {
      await connection.query(
        'UPDATE trips SET confirmed_passengers = GREATEST(confirmed_passengers - 1, 0) WHERE trip_id = ?',
        [booking.trip_id]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to cancel booking' });
  } finally {
    connection.release();
  }
};

exports.markNoShow = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      "SELECT * FROM bookings WHERE booking_id = ? AND booking_status = 'confirmed' FOR UPDATE",
      [id]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Confirmed booking not found' });
    }

    await connection.query(
      "UPDATE bookings SET booking_status = 'no_show' WHERE booking_id = ?", [id]
    );
    await connection.query(
      'UPDATE trips SET confirmed_passengers = GREATEST(confirmed_passengers - 1, 0) WHERE trip_id = ?',
      [bookings[0].trip_id]
    );

    await connection.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, 'Missed Bus Notice', 'You missed your scheduled bus. Please note that missed buses are non-refundable.', 'info')`,
      [bookings[0].user_id]
    );

    await connection.commit();
    res.json({ success: true, message: 'Marked as no-show' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to mark no-show' });
  } finally {
    connection.release();
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
    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?',
      [req.params.id, req.user.user_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};

exports.getAuditLog = async (req, res) => {
  try {
    const [logs] = await pool.query(`
      SELECT a.*, u.full_name as admin_name
      FROM audit_log a LEFT JOIN users u ON a.user_id = u.user_id
      ORDER BY a.created_at DESC LIMIT 50
    `);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch audit log' });
  }
};
