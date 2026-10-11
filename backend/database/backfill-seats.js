require('dotenv').config();
const pool = require('../config/database');

async function backfillSeats() {
  const connection = await pool.getConnection();
  try {
    console.log('Backfilling seats for active bookings without a seat...');

    const [trips] = await connection.query('SELECT trip_id, capacity FROM trips');

    for (const trip of trips) {
      await connection.beginTransaction();

      const [active] = await connection.query(
        `SELECT booking_id, seat_number FROM bookings
         WHERE trip_id = ? AND booking_status IN ('pending_payment','confirmed')
         FOR UPDATE`,
        [trip.trip_id]
      );

      const taken = new Set(
        active.filter(b => b.seat_number).map(b => String(b.seat_number))
      );
      let next = 1;
      const pickSeat = () => {
        while (next <= trip.capacity) {
          const s = String(next++);
          if (!taken.has(s)) return s;
        }
        return null;
      };

      let assigned = 0;
      for (const b of active) {
        if (b.seat_number) continue;
        const seat = pickSeat();
        if (!seat) {
          console.warn(`  ! Trip ${trip.trip_id}: no free seat for booking ${b.booking_id}`);
          break;
        }
        await connection.query('UPDATE bookings SET seat_number = ? WHERE booking_id = ?', [seat, b.booking_id]);
        taken.add(seat);
        assigned++;
      }

      await connection.commit();
      if (assigned > 0) console.log(`  Trip ${trip.trip_id}: assigned ${assigned} seat(s)`);
    }

    console.log('Backfill complete.');
  } catch (error) {
    console.error('Backfill failed:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  backfillSeats()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = backfillSeats;
