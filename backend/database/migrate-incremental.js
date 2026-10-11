require('dotenv').config();
const pool = require('../config/database');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running incremental migration: QR + check-in + seat fields...');

    const [bookingCols] = await connection.query(
      "SHOW COLUMNS FROM bookings LIKE 'qr_token'"
    );
    if (bookingCols.length === 0) {
      await connection.query(
        "ALTER TABLE bookings ADD COLUMN qr_token VARCHAR(64) NULL, ADD UNIQUE KEY idx_qr_token (qr_token)"
      );
      console.log('  + bookings.qr_token added');
    }

    const [checkInCols] = await connection.query(
      "SHOW COLUMNS FROM bookings LIKE 'check_in_status'"
    );
    if (checkInCols.length === 0) {
      await connection.query(
        "ALTER TABLE bookings ADD COLUMN check_in_status ENUM('not_checked_in','checked_in') NOT NULL DEFAULT 'not_checked_in'"
      );
      console.log('  + bookings.check_in_status added');
    }

    const [checkedInAtCols] = await connection.query(
      "SHOW COLUMNS FROM bookings LIKE 'checked_in_at'"
    );
    if (checkedInAtCols.length === 0) {
      await connection.query(
        "ALTER TABLE bookings ADD COLUMN checked_in_at TIMESTAMP NULL"
      );
      console.log('  + bookings.checked_in_at added');
    }

    const [checkedInByCols] = await connection.query(
      "SHOW COLUMNS FROM bookings LIKE 'checked_in_by'"
    );
    if (checkedInByCols.length === 0) {
      await connection.query(
        "ALTER TABLE bookings ADD COLUMN checked_in_by INT NULL"
      );
      console.log('  + bookings.checked_in_by added');
    }

    const [paymentCols] = await connection.query(
      "SHOW COLUMNS FROM payments LIKE 'failure_reason'"
    );
    if (paymentCols.length === 0) {
      await connection.query(
        "ALTER TABLE payments ADD COLUMN failure_reason VARCHAR(255) NULL"
      );
      console.log('  + payments.failure_reason added');
    }

    const [seatCols] = await connection.query(
      "SHOW COLUMNS FROM bookings LIKE 'seat_number'"
    );
    if (seatCols.length === 0) {
      await connection.query(
        "ALTER TABLE bookings ADD COLUMN seat_number VARCHAR(10) NULL"
      );
      console.log('  + bookings.seat_number added');
    }

    const [seatIdx] = await connection.query(
      "SHOW INDEX FROM bookings WHERE Key_name = 'unique_trip_seat'"
    );
    if (seatIdx.length === 0) {
      await connection.query(
        "ALTER TABLE bookings ADD UNIQUE KEY unique_trip_seat (trip_id, seat_number)"
      );
      console.log('  + bookings unique_trip_seat constraint added');
    }

    console.log('Migration complete.');
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
