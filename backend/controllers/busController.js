const pool = require('../config/database');

exports.getAllBuses = async (req, res) => {
  try {
    const [buses] = await pool.query('SELECT * FROM buses ORDER BY bus_id');
    res.json({ success: true, data: buses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch buses' });
  }
};

exports.getBusById = async (req, res) => {
  try {
    const [buses] = await pool.query('SELECT * FROM buses WHERE bus_id = ?', [req.params.id]);
    if (buses.length === 0) return res.status(404).json({ success: false, message: 'Bus not found' });
    res.json({ success: true, data: buses[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch bus' });
  }
};

exports.createBus = async (req, res) => {
  try {
    const { bus_name, bus_number, capacity } = req.body;
    if (!bus_name || !bus_number) {
      return res.status(400).json({ success: false, message: 'Bus name and number are required' });
    }
    const cap = capacity || 12;
    if (cap < 1 || cap > 50) {
      return res.status(400).json({ success: false, message: 'Capacity must be between 1 and 50' });
    }
    const [result] = await pool.query(
      'INSERT INTO buses (bus_name, bus_number, capacity) VALUES (?, ?, ?)',
      [bus_name, bus_number, cap]
    );
    res.status(201).json({
      success: true,
      message: 'Bus created successfully',
      data: { bus_id: result.insertId, bus_name, bus_number, capacity: cap }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'A bus with this number already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create bus' });
  }
};

exports.updateBus = async (req, res) => {
  try {
    const { bus_name, capacity, status } = req.body;
    const updates = {};
    if (bus_name) updates.bus_name = bus_name;
    if (capacity) updates.capacity = capacity;
    if (status) updates.status = status;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    const [existing] = await pool.query('SELECT * FROM buses WHERE bus_id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Bus not found' });

    await pool.query('UPDATE buses SET ? WHERE bus_id = ?', [updates, req.params.id]);
    const [updated] = await pool.query('SELECT * FROM buses WHERE bus_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Bus updated', data: updated[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update bus' });
  }
};

exports.deleteBus = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM buses WHERE bus_id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Bus not found' });

    const [activeTrips] = await pool.query(
      "SELECT COUNT(*) as cnt FROM trips WHERE bus_id = ? AND status = 'scheduled' AND departure_date >= CURDATE()",
      [req.params.id]
    );
    if (activeTrips[0].cnt > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete bus with active scheduled trips' });
    }

    await pool.query('DELETE FROM buses WHERE bus_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Bus deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete bus' });
  }
};
