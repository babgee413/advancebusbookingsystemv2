const pool = require('../config/database');
const migrate = require('./migrate');

async function reset() {
  const connection = await pool.getConnection();
  
  try {
    console.log('Resetting database...');

    // Drop tables in reverse order of dependencies
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('DROP TABLE IF EXISTS bookings');
    await connection.query('DROP TABLE IF EXISTS seats');
    await connection.query('DROP TABLE IF EXISTS trips');
    await connection.query('DROP TABLE IF EXISTS users');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✓ Tables dropped');

    connection.release();

    // Run migrations
    await migrate();

    // Run seed
    const seed = require('./seed');
    await seed();

    console.log('\nDatabase reset completed!');
  } catch (error) {
    console.error('Reset failed:', error.message);
    connection.release();
    throw error;
  }
}

if (require.main === module) {
  reset()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = reset;
