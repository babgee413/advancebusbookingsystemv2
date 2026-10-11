const pool = require('../config/database');
const QRCode = require('qrcode');

// Build a QR data URL for a ticket's QR token or ticket number.
async function buildQrDataUrl(payload) {
  return QRCode.toDataURL(payload, { width: 200, margin: 1 });
}

exports.getTicket = async (req, res) => {
  try {
    const [bookings] = await pool.query(`
      SELECT b.booking_id, b.ticket_number, b.seat_number, b.booking_status, b.payment_status,
             b.amount_paid, b.payment_date, b.created_at as booking_date,
             b.qr_token, b.check_in_status, b.checked_in_at,
             t.origin, t.destination, t.departure_date, t.departure_time,
             t.price as trip_price,
             bu.bus_name, bu.bus_number,
             u.full_name as passenger_name, u.registration_number, u.email as passenger_email,
             b.user_id as owner_user_id
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN buses bu ON t.bus_id = bu.bus_id
      JOIN users u ON b.user_id = u.user_id
      WHERE b.ticket_number = ?
    `, [req.params.ticket_number]);

    if (bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = bookings[0];
    const ownerId = ticket.owner_user_id;
    delete ticket.owner_user_id;

    if (req.user.role !== 'admin' && ownerId !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE booking_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
      [ticket.booking_id, 'successful']
    );

    ticket.payment_reference = payments.length > 0 ? payments[0].reference : null;
    ticket.payment_method = payments.length > 0 ? payments[0].method : null;

    // QR encodes a verifiable token; ticket number as fallback.
    const qrPayload = ticket.qr_token || ticket.ticket_number;
    ticket.qr_data_url = await buildQrDataUrl(`ATBUBUS:${qrPayload}`);

    res.json({ success: true, data: ticket });
  } catch (error) {
    console.error('getTicket error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
};

exports.getMyTickets = async (req, res) => {
  try {
    const [tickets] = await pool.query(`
      SELECT b.booking_id, b.ticket_number, b.seat_number, b.booking_status, b.payment_status,
             b.amount_paid, b.payment_date, b.created_at as booking_date,
             b.check_in_status,
             t.origin, t.destination, t.departure_date, t.departure_time,
             bu.bus_name, bu.bus_number
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN buses bu ON t.bus_id = bu.bus_id
      WHERE b.user_id = ? AND b.booking_status IN ('confirmed', 'completed')
      ORDER BY t.departure_date DESC, t.departure_time DESC
    `, [req.user.user_id]);
    res.json({ success: true, data: tickets });
  } catch (error) {
    console.error('getMyTickets error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
};

// Public verification: no auth required (called from the /verify page when scanning).
exports.verifyTicket = async (req, res) => {
  try {
    const code = (req.params.code || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, message: 'Verification code is required' });
    }

    // Accept both raw ticket numbers and QR tokens (with optional ATBUBUS: prefix).
    const cleanCode = code.replace(/^ATBUBUS:/i, '');

    const [bookings] = await pool.query(`
      SELECT b.booking_id, b.ticket_number, b.seat_number, b.booking_status, b.payment_status,
             b.check_in_status, b.checked_in_at,
             t.origin, t.destination, t.departure_date, t.departure_time,
             bu.bus_name, bu.bus_number,
             u.full_name as passenger_name, u.registration_number
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN buses bu ON t.bus_id = bu.bus_id
      JOIN users u ON b.user_id = u.user_id
      WHERE b.qr_token = ? OR b.ticket_number = ?
      LIMIT 1
    `, [cleanCode, cleanCode]);

    if (bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found', data: null });
    }

    const t = bookings[0];
    res.json({
      success: true,
      data: {
        booking_id: t.booking_id,
        ticket_number: t.ticket_number,
        seat_number: t.seat_number,
        passenger_name: t.passenger_name,
        registration_number: t.registration_number,
        origin: t.origin,
        destination: t.destination,
        departure_date: t.departure_date,
        departure_time: t.departure_time,
        bus_name: t.bus_name,
        bus_number: t.bus_number,
        booking_status: t.booking_status,
        payment_status: t.payment_status,
        check_in_status: t.check_in_status,
        checked_in_at: t.checked_in_at,
        is_valid: t.booking_status === 'confirmed' && t.payment_status === 'paid'
      }
    });
  } catch (error) {
    console.error('verifyTicket error:', error.message);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

// Admin check-in: marks a valid ticket as checked in (idempotent).
exports.checkInTicket = async (req, res) => {
  let connection;
  try {
    const code = (req.params.code || '').trim().replace(/^ATBUBUS:/i, '');
    if (!code) {
      return res.status(400).json({ success: false, message: 'Verification code is required' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      `SELECT * FROM bookings WHERE qr_token = ? OR ticket_number = ? LIMIT 1 FOR UPDATE`,
      [code, code]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const booking = bookings[0];

    if (booking.booking_status !== 'confirmed' || booking.payment_status !== 'paid') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Ticket is not valid for boarding (status: ${booking.booking_status}, payment: ${booking.payment_status})`
      });
    }

    if (booking.check_in_status === 'checked_in') {
      await connection.rollback();
      return res.status(200).json({
        success: true,
        message: 'Already checked in',
        already_checked_in: true,
        data: { ticket_number: booking.ticket_number, seat_number: booking.seat_number, checked_in_at: booking.checked_in_at }
      });
    }

    await connection.query(
      `UPDATE bookings SET check_in_status = 'checked_in', checked_in_at = NOW(), checked_in_by = ?
       WHERE booking_id = ?`,
      [req.user.user_id, booking.booking_id]
    );

    await connection.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?)',
      [req.user.user_id, 'ticket_checked_in', 'booking', booking.booking_id,
       JSON.stringify({ ticket_number: booking.ticket_number })]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Check-in successful',
      data: { ticket_number: booking.ticket_number, seat_number: booking.seat_number, checked_in_at: new Date() }
    });
  } catch (error) {
    console.error('checkInTicket error:', error.message);
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ success: false, message: 'Check-in failed' });
  } finally {
    if (connection) connection.release();
  }
};

// Admin: list recent check-ins / verify by ticket number in the admin UI.
exports.getCheckInStatus = async (req, res) => {
  try {
    const code = (req.params.code || '').trim().replace(/^ATBUBUS:/i, '');
    const [bookings] = await pool.query(`
      SELECT b.booking_id, b.ticket_number, b.seat_number, b.booking_status, b.payment_status,
             b.check_in_status, b.checked_in_at,
             t.origin, t.destination, t.departure_date, t.departure_time,
             bu.bus_name, bu.bus_number,
             u.full_name as passenger_name, u.registration_number,
             checker.full_name as checked_in_by_name
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      JOIN buses bu ON t.bus_id = bu.bus_id
      JOIN users u ON b.user_id = u.user_id
      LEFT JOIN users checker ON b.checked_in_by = checker.user_id
      WHERE b.qr_token = ? OR b.ticket_number = ?
      LIMIT 1
    `, [code, code]);

    if (bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found', data: null });
    }

    res.json({ success: true, data: bookings[0] });
  } catch (error) {
    console.error('getCheckInStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket status' });
  }
};
