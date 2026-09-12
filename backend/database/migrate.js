const pool = require('../config/database');

async function migrate() {
  const connection = await pool.getConnection();
  
  try {
    console.log('Starting database migration...');

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // Drop old tables
    await connection.query('DROP TABLE IF EXISTS seats');
    await connection.query('DROP TABLE IF EXISTS bookings');
    await connection.query('DROP TABLE IF EXISTS trips');
    await connection.query('DROP TABLE IF EXISTS payments');
    await connection.query('DROP TABLE IF EXISTS notifications');
    await connection.query('DROP TABLE IF EXISTS audit_log');

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // Users table (keep if exists, ensure registration_number exists)
    const [usersTable] = await connection.query("SHOW TABLES LIKE 'users'");
    if (usersTable.length === 0) {
      await connection.query(`
        CREATE TABLE users (
          user_id INT AUTO_INCREMENT PRIMARY KEY,
          registration_number VARCHAR(20) DEFAULT NULL,
          full_name VARCHAR(100) NOT NULL,
          email VARCHAR(150) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role ENUM('student', 'admin') DEFAULT 'student',
          phone VARCHAR(20) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY idx_registration_number (registration_number),
          INDEX idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✓ Users table created');
    } else {
      // Ensure registration_number column exists
      const [cols] = await connection.query("SHOW COLUMNS FROM users LIKE 'registration_number'");
      if (cols.length === 0) {
        await connection.query(`ALTER TABLE users ADD COLUMN registration_number VARCHAR(20) DEFAULT NULL AFTER user_id`);
        await connection.query(`CREATE UNIQUE INDEX idx_registration_number ON users(registration_number)`);
      }
      // Ensure phone column exists
      const [phoneCol] = await connection.query("SHOW COLUMNS FROM users LIKE 'phone'");
      if (phoneCol.length === 0) {
        await connection.query(`ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL`);
      }
      console.log('✓ Users table verified');
    }

    // Buses table
    await connection.query(`
      CREATE TABLE buses (
        bus_id INT AUTO_INCREMENT PRIMARY KEY,
        bus_name VARCHAR(100) NOT NULL,
        bus_number VARCHAR(50) NOT NULL UNIQUE,
        capacity INT NOT NULL DEFAULT 12,
        status ENUM('active', 'maintenance', 'retired') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ Buses table created');

    // Trips table
    await connection.query(`
      CREATE TABLE trips (
        trip_id INT AUTO_INCREMENT PRIMARY KEY,
        bus_id INT NOT NULL,
        origin VARCHAR(100) NOT NULL,
        destination VARCHAR(100) NOT NULL,
        departure_date DATE NOT NULL,
        departure_time TIME NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        capacity INT NOT NULL DEFAULT 12,
        confirmed_passengers INT NOT NULL DEFAULT 0,
        status ENUM('scheduled', 'departed', 'completed', 'cancelled') DEFAULT 'scheduled',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (bus_id) REFERENCES buses(bus_id) ON DELETE RESTRICT ON UPDATE CASCADE,
        INDEX idx_origin_destination (origin, destination),
        INDEX idx_departure_date (departure_date),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ Trips table created');

    // Bookings table
    await connection.query(`
      CREATE TABLE bookings (
        booking_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        trip_id INT NOT NULL,
        ticket_number VARCHAR(30) NOT NULL UNIQUE,
        booking_status ENUM('pending_payment', 'confirmed', 'rejected', 'rescheduled', 'cancelled', 'completed', 'no_show') DEFAULT 'pending_payment',
        payment_status ENUM('unpaid', 'paid', 'refunded', 'failed') DEFAULT 'unpaid',
        amount_paid DECIMAL(10,2) DEFAULT 0.00,
        booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        payment_date TIMESTAMP NULL,
        rejection_reason TEXT DEFAULT NULL,
        rescheduled_from INT DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE RESTRICT ON UPDATE CASCADE,
        UNIQUE KEY unique_active_booking (user_id, trip_id, booking_status),
        INDEX idx_ticket_number (ticket_number),
        INDEX idx_booking_status (booking_status),
        INDEX idx_payment_status (payment_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ Bookings table created');

    // Payments table
    await connection.query(`
      CREATE TABLE payments (
        payment_id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        method ENUM('card', 'bank_transfer', 'cash', 'wallet') DEFAULT 'card',
        reference VARCHAR(100) NOT NULL UNIQUE,
        status ENUM('pending', 'successful', 'failed', 'cancelled') DEFAULT 'pending',
        transaction_id VARCHAR(100) DEFAULT NULL,
        verified_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE RESTRICT ON UPDATE CASCADE,
        INDEX idx_reference (reference),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ Payments table created');

    // Audit log table
    await connection.query(`
      CREATE TABLE audit_log (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT DEFAULT NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INT DEFAULT NULL,
        old_values JSON DEFAULT NULL,
        new_values JSON DEFAULT NULL,
        ip_address VARCHAR(45) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        INDEX idx_entity (entity_type, entity_id),
        INDEX idx_action (action)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ Audit log table created');

    // Notifications table
    await connection.query(`
      CREATE TABLE notifications (
        notification_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('info', 'booking', 'payment', 'schedule_change') DEFAULT 'info',
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_user_read (user_id, is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ Notifications table created');

    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrate;
