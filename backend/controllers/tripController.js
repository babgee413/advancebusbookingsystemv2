const pool = require('../config/database');

exports.searchTrips = async (req, res) => {
  try {
    const { origin, destination, date } = req.query;
    
    let query = `
      SELECT t.*, b.bus_name, b.bus_number,
        (t.capacity - t.confirmed_passengers) as available_spaces,
        CASE WHEN t.confirmed_passengers >= t.capacity THEN 'fully_booked' ELSE 'available' END as booking_status
      FROM trips t
      JOIN buses b ON t.bus_id = b.bus_id
      WHERE t.status = 'scheduled'
        AND t.departure_date >= CURDATE()
    `;
    const params = [];

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

    query += ' ORDER BY t.departure_date ASC, t.departure_time ASC';

    const [trips] = await pool.query(query, params);
    res.json({ success: true, data: trips });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to search trips' });
  }
};

exports.getTripById = async (req, res) => {
  try {
    const [trips] = await pool.query(`
      SELECT t.*, b.bus_name, b.bus_number,
        (t.capacity - t.confirmed_passengers) as available_spaces,
        CASE WHEN t.confirmed_passengers >= t.capacity THEN 'fully_booked' ELSE 'available' END as booking_status
      FROM trips t
      JOIN buses b ON t.bus_id = b.bus_id
      WHERE t.trip_id = ?
    `, [req.params.id]);

    if (trips.length === 0) return res.status(404).json({ success: false, message: 'Trip not found' });
    res.json({ success: true, data: trips[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch trip' });
  }
};

exports.createTrip = async (req, res) => {
  try {
    const { bus_id, origin, destination, departure_date, departure_time, price } = req.body;
    if (!bus_id || !origin || !destination || !departure_date || !departure_time || !price) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (origin === destination) {
      return res.status(400).json({ success: false, message: 'Origin and destination must be different' });
    }

    const [bus] = await pool.query("SELECT * FROM buses WHERE bus_id = ? AND status = 'active'", [bus_id]);
    if (bus.length === 0) return res.status(404).json({ success: false, message: 'Active bus not found' });

    const [result] = await pool.query(
      `INSERT INTO trips (bus_id, origin, destination, departure_date, departure_time, price, capacity, confirmed_passengers)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [bus_id, origin, destination, departure_date, departure_time, price, bus[0].capacity]
    );

    res.status(201).json({
      success: true,
      message: 'Trip created',
      data: { trip_id: result.insertId, bus_id, origin, destination, departure_date, departure_time, price }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create trip: ' + error.message });
  }
};

exports.updateTrip = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { price, departure_time } = req.body;
    const { id } = req.params;

    const [existing] = await connection.query('SELECT * FROM trips WHERE trip_id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Trip not found' });

    const oldValues = { price: existing[0].price, departure_time: existing[0].departure_time };
    const updates = {};
    if (price !== undefined) updates.price = price;
    if (departure_time !== undefined) updates.departure_time = departure_time;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    await connection.query('UPDATE trips SET ? WHERE trip_id = ?', [updates, id]);

    // Audit log
    const adminId = req.user.user_id;
    await connection.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [adminId, 'update_trip', 'trip', id, JSON.stringify(oldValues), JSON.stringify(updates)]
    );

    // Notify affected passengers if departure_time changed
    if (departure_time && departure_time !== oldValues.departure_time) {
      const [affectedBookings] = await connection.query(
        `SELECT b.user_id, b.ticket_number FROM bookings b WHERE b.trip_id = ? AND b.booking_status = 'confirmed'`,
        [id]
      );
      for (const booking of affectedBookings) {
        await connection.query(
          `INSERT INTO notifications (user_id, title, message, type)
           VALUES (?, ?, ?, 'schedule_change')`,
          [
            booking.user_id,
            'Schedule Change Notice',
            `Your trip (Ticket: ${booking.ticket_number}) departure time has been changed from ${oldValues.departure_time} to ${departure_time}.`
          ]
        );
      }
    }

    const [updated] = await connection.query(
      'SELECT t.*, b.bus_name, b.bus_number FROM trips t JOIN buses b ON t.bus_id = b.bus_id WHERE t.trip_id = ?',
      [id]
    );
    res.json({ success: true, message: 'Trip updated', data: updated[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update trip' });
  } finally {
    connection.release();
  }
};

exports.cancelTrip = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const [existing] = await connection.query('SELECT * FROM trips WHERE trip_id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Trip not found' });

    if (existing[0].status !== 'scheduled') {
      return res.status(400).json({ success: false, message: 'Only scheduled trips can be cancelled' });
    }

    await connection.beginTransaction();
    await connection.query("UPDATE trips SET status = 'cancelled' WHERE trip_id = ?", [id]);
    await connection.query(
      "UPDATE bookings SET booking_status = 'cancelled' WHERE trip_id = ? AND booking_status = 'confirmed'",
      [id]
    );

    // Notify affected passengers
    const [affectedBookings] = await connection.query(
      'SELECT user_id, ticket_number FROM bookings WHERE trip_id = ? AND booking_status = ?',
      [id, 'cancelled']
    );
    for (const b of affectedBookings) {
      await connection.query(
        `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'info')`,
        [b.user_id, 'Trip Cancelled', `Your trip (Ticket: ${b.ticket_number}) has been cancelled. Please contact admin for assistance.`]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Trip cancelled and passengers notified' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to cancel trip' });
  } finally {
    connection.release();
  }
};

exports.getRoutes = async (req, res) => {
  try {
    const [routes] = await pool.query(
      `SELECT DISTINCT origin, destination FROM trips WHERE status = 'scheduled' AND departure_date >= CURDATE()`
    );
    res.json({ success: true, data: routes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch routes' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [tripCount] = await pool.query("SELECT COUNT(*) as c FROM trips WHERE status = 'scheduled' AND departure_date >= CURDATE()");
    const [bookingCount] = await pool.query("SELECT COUNT(*) as c FROM bookings WHERE booking_status = 'confirmed'");
    const [totalPassengers] = await pool.query('SELECT SUM(confirmed_passengers) as c FROM trips');
    const [busCount] = await pool.query("SELECT COUNT(*) as c FROM buses WHERE status = 'active'");
    const [revenue] = await pool.query("SELECT SUM(amount) as c FROM payments WHERE status = 'successful'");
    const [recentBookings] = await pool.query(`
      SELECT b.ticket_number, b.booking_status, b.amount_paid, t.origin, t.destination, t.departure_date,
             u.full_name
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN users u ON b.user_id = u.user_id
      ORDER BY b.created_at DESC LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        total_trips: tripCount[0].c || 0,
        total_bookings: bookingCount[0].c || 0,
        total_passengers: totalPassengers[0].c || 0,
        total_buses: busCount[0].c || 0,
        total_revenue: revenue[0].c || 0,
        recent_bookings: recentBookings
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};
