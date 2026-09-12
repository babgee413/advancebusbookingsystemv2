const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const config = require('../config/config');

// Registration number format: 21/63227u/6
const REG_NUMBER_REGEX = /^\d{2}\/\d{5}[a-z]\/\d{1}$/;

function validateRegistrationNumber(regNum) {
  if (!regNum || typeof regNum !== 'string') return false;
  const trimmed = regNum.trim();
  return REG_NUMBER_REGEX.test(trimmed);
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

async function getConnectionWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await pool.getConnection();
      return conn;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

exports.register = async (req, res) => {
  let connection;
  try {
    let { registration_number, full_name, email, password, confirm_password } = req.body;

    // Trim inputs
    if (registration_number) registration_number = registration_number.trim();
    if (full_name) full_name = full_name.trim();
    if (email) email = email.trim();

    // Validate required fields
    if (!registration_number || !full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate registration number format
    if (!validateRegistrationNumber(registration_number)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid registration number (e.g., 21/63227u/6)'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Normalize email
    email = normalizeEmail(email);

    // Validate password
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Validate password confirmation
    if (confirm_password && password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Get a fresh connection for the transaction
    connection = await getConnectionWithRetry();

    // Check for duplicate registration number
    const [existingReg] = await connection.query(
      'SELECT user_id FROM users WHERE registration_number = ?',
      [registration_number]
    );
    if (existingReg.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This registration number is already registered'
      });
    }

    // Check for duplicate email
    const [existingEmail] = await connection.query(
      'SELECT user_id FROM users WHERE email = ?',
      [email]
    );
    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    // Use a transaction to ensure atomicity
    await connection.beginTransaction();

    // Hash password and create user
    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await connection.query(
      'INSERT INTO users (registration_number, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [registration_number, full_name, email, password_hash, 'student']
    );

    const userId = result.insertId;

    // Generate JWT token
    const token = jwt.sign(
      { user_id: userId, email, role: 'student' },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    // Commit the transaction
    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user_id: userId,
        registration_number,
        full_name,
        email,
        role: 'student',
        token
      }
    });
  } catch (error) {
    // Rollback on any error
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'An account with this registration number or email already exists'
      });
    }

    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') {
      return res.status(503).json({
        success: false,
        message: "We're having trouble connecting right now. Please try again in a moment."
      });
    }

    res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.login = async (req, res) => {
  try {
    let { login_identifier, email, registration_number, password } = req.body;

    // Support both login_identifier and specific fields
    const identifier = login_identifier || email || registration_number;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Credentials are required'
      });
    }

    // Trim the identifier
    const trimmedIdentifier = identifier.trim();

    // Determine if the identifier is an email or registration number
    const isEmail = trimmedIdentifier.includes('@');
    const isRegNumber = REG_NUMBER_REGEX.test(trimmedIdentifier);

    let query, params;

    if (isEmail) {
      query = 'SELECT * FROM users WHERE email = ?';
      params = [normalizeEmail(trimmedIdentifier)];
    } else if (isRegNumber) {
      query = 'SELECT * FROM users WHERE registration_number = ?';
      params = [trimmedIdentifier];
    } else {
      // Try both as fallback
      query = 'SELECT * FROM users WHERE email = ? OR registration_number = ?';
      params = [trimmedIdentifier, trimmedIdentifier];
    }

    const [users] = await pool.query(query, params);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user_id: user.user_id,
        registration_number: user.registration_number,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        token
      }
    });
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') {
      return res.status(503).json({
        success: false,
        message: "We're having trouble connecting right now. Please try again in a moment."
      });
    }
    res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT user_id, registration_number, full_name, email, role, created_at FROM users WHERE user_id = ?',
      [req.user.user_id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to load profile. Please try again.'
    });
  }
};
