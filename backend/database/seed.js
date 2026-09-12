const bcrypt = require('bcryptjs');
const pool = require('../config/database');

function generateTicketNumber() {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `BT-${year}-${rand}`;
}

async function seed() {
  const connection = await pool.getConnection();
  
  try {
    console.log('Starting database seeding...');

    // Seed admin
    const adminHash = await bcrypt.hash('admin123', 10);
    await connection.query(`
      INSERT IGNORE INTO users (registration_number, full_name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `, ['ADMIN001', 'Administrator', 'admin@atbu.edu.ng', adminHash, 'admin']);
    console.log('✓ Admin account seeded');

    // Seed students
    const studentHash = await bcrypt.hash('student123', 10);
    const students = [
      ['21/63227u/6', 'Abubakar Mohammed', 'abubakar@atbu.edu.ng'],
      ['21/63228u/6', 'Fatima Aliyu', 'fatima@atbu.edu.ng'],
      ['21/63229u/6', 'Ibrahim Suleiman', 'ibrahim@atbu.edu.ng'],
      ['21/63230u/6', 'Amina Bello', 'amina@atbu.edu.ng'],
      ['21/63231u/6', 'Usman Danladi', 'usman@atbu.edu.ng']
    ];
    
    for (const [reg, name, email] of students) {
      await connection.query(`
        INSERT IGNORE INTO users (registration_number, full_name, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
      `, [reg, name, email, studentHash, 'student']);
    }
    console.log('✓ Student accounts seeded');

    // Seed buses
    const buses = [
      ['Shuttle A', 'ATBU-001', 12],
      ['Shuttle B', 'ATBU-002', 12],
      ['Shuttle C', 'ATBU-003', 12],
      ['Shuttle D', 'ATBU-004', 12]
    ];

    const busIds = [];
    for (const [name, number, capacity] of buses) {
      const [result] = await connection.query(`
        INSERT IGNORE INTO buses (bus_name, bus_number, capacity)
        VALUES (?, ?, ?)
      `, [name, number, capacity]);
      if (result.insertId > 0) {
        busIds.push(result.insertId);
      }
    }

    // Get existing bus IDs
    const [existingBuses] = await connection.query('SELECT bus_id FROM buses ORDER BY bus_id');
    const allBusIds = existingBuses.map(b => b.bus_id);

    // Seed trips for the next 7 days
    const today = new Date();
    const times = ['08:00:00', '12:00:00', '16:00:00'];

    // Clear existing trips first
    await connection.query('DELETE FROM trips');
    console.log('✓ Cleared existing trips');

    for (let day = 0; day < 7; day++) {
      const date = new Date(today);
      date.setDate(date.getDate() + day);
      const dateStr = date.toISOString().split('T')[0];

      // Yelwa → Gubi trips
      for (let t = 0; t < 3; t++) {
        if (allBusIds[t]) {
          await connection.query(`
            INSERT INTO trips (bus_id, origin, destination, departure_date, departure_time, price, capacity, confirmed_passengers)
            VALUES (?, 'Yelwa Campus', 'Gubi Campus', ?, ?, 500.00, 12, 0)
          `, [allBusIds[t], dateStr, times[t]]);
        }
      }

      // Gubi → Yelwa trips
      for (let t = 0; t < 3; t++) {
        const busIndex = t + 3;
        if (allBusIds[busIndex % allBusIds.length]) {
          await connection.query(`
            INSERT INTO trips (bus_id, origin, destination, departure_date, departure_time, price, capacity, confirmed_passengers)
            VALUES (?, 'Gubi Campus', 'Yelwa Campus', ?, ?, 500.00, 12, 0)
          `, [allBusIds[busIndex % allBusIds.length], dateStr, times[t]]);
        }
      }
    }
    console.log('✓ Trips seeded for 7 days');

    // Create sample bookings with payments
    const [students2] = await connection.query(
      "SELECT user_id FROM users WHERE role = 'student' LIMIT 2"
    );
    const [trips2] = await connection.query(
      'SELECT trip_id, price FROM trips WHERE origin = ? AND departure_date = CURDATE() + INTERVAL 1 DAY LIMIT 2',
      ['Yelwa Campus']
    );

    if (students2.length > 0 && trips2.length > 0) {
      for (let i = 0; i < Math.min(students2.length, trips2.length); i++) {
        const ticketNum = generateTicketNumber();
        const [bookingResult] = await connection.query(`
          INSERT INTO bookings (user_id, trip_id, ticket_number, booking_status, payment_status, amount_paid, payment_date)
          VALUES (?, ?, ?, 'confirmed', 'paid', ?, NOW())
          ON DUPLICATE KEY UPDATE booking_status = booking_status
        `, [students2[i].user_id, trips2[i].trip_id, ticketNum, trips2[i].price]);

        if (bookingResult.insertId > 0) {
          await connection.query(`
            UPDATE trips SET confirmed_passengers = confirmed_passengers + 1 WHERE trip_id = ?
          `, [trips2[i].trip_id]);

          const ref = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          await connection.query(`
            INSERT INTO payments (booking_id, amount, method, reference, status, verified_at)
            VALUES (?, ?, 'card', ?, 'successful', NOW())
          `, [bookingResult.insertId, trips2[i].price, ref]);
        }
      }
      console.log('✓ Sample bookings and payments created');
    }

    console.log('\nSeeding completed successfully!');
    console.log('\nDemo Credentials:');
    console.log('Admin: admin@atbu.edu.ng / admin123');
    console.log('Student: 21/63227u/6 / student123');
    console.log('Student: abubakar@atbu.edu.ng / student123');
  } catch (error) {
    console.error('Seeding failed:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seed;
