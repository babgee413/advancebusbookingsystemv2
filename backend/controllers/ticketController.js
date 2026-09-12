const pool = require('../config/database');

exports.getTicket = async (req, res) => {
  try {
    const [bookings] = await pool.query(`
      SELECT b.booking_id, b.ticket_number, b.booking_status, b.payment_status,
             b.amount_paid, b.payment_date, b.created_at as booking_date,
             t.origin, t.destination, t.departure_date, t.departure_time,
             t.price as trip_price,
             bu.bus_name, bu.bus_number,
             u.full_name as passenger_name, u.registration_number, u.email as passenger_email
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

    // Allow users to only see their own tickets, unless admin
    if (req.user.role !== 'admin') {
      const [owner] = await pool.query('SELECT user_id FROM bookings WHERE ticket_number = ?', [req.params.ticket_number]);
      if (owner.length === 0 || owner[0].user_id !== req.user.user_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Get payment info
    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE booking_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
      [ticket.booking_id, 'successful']
    );

    ticket.payment_reference = payments.length > 0 ? payments[0].reference : null;
    ticket.payment_method = payments.length > 0 ? payments[0].method : null;

    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
};

exports.getMyTickets = async (req, res) => {
  try {
    const [tickets] = await pool.query(`
      SELECT b.booking_id, b.ticket_number, b.booking_status, b.payment_status,
             b.amount_paid, b.payment_date, b.created_at as booking_date,
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
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
};
