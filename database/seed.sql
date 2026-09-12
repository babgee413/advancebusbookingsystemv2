-- ATBU Bus Booking System - Seed Data
-- Run this after schema.sql to populate demo data

-- Admin account (password: admin123)
INSERT INTO users (registration_number, full_name, email, password_hash, role)
VALUES ('ADMIN001', 'Administrator', 'admin@atbu.edu.ng', '$2a$10$8K1p/a0dL1LXMc.0SZ0w3OQH2xKGPKwHFt4EAURT7ORvlvdoUByVq', 'admin')
ON DUPLICATE KEY UPDATE email = email;

-- Student accounts (password: student123)
INSERT INTO users (registration_number, full_name, email, password_hash, role) VALUES
('21/63227u/6', 'Abubakar Mohammed', 'abubakar@atbu.edu.ng', '$2a$10$8K1p/a0dL1LXMc.0SZ0w3OQH2xKGPKwHFt4EAURT7ORvlvdoUByVq', 'student'),
('21/63228u/6', 'Fatima Aliyu', 'fatima@atbu.edu.ng', '$2a$10$8K1p/a0dL1LXMc.0SZ0w3OQH2xKGPKwHFt4EAURT7ORvlvdoUByVq', 'student'),
('21/63229u/6', 'Ibrahim Suleiman', 'ibrahim@atbu.edu.ng', '$2a$10$8K1p/a0dL1LXMc.0SZ0w3OQH2xKGPKwHFt4EAURT7ORvlvdoUByVq', 'student'),
('21/63230u/6', 'Amina Bello', 'amina@atbu.edu.ng', '$2a$10$8K1p/a0dL1LXMc.0SZ0w3OQH2xKGPKwHFt4EAURT7ORvlvdoUByVq', 'student'),
('21/63231u/6', 'Usman Danladi', 'usman@atbu.edu.ng', '$2a$10$8K1p/a0dL1LXMc.0SZ0w3OQH2xKGPKwHFt4EAURT7ORvlvdoUByVq', 'student')
ON DUPLICATE KEY UPDATE email = email;

-- Sample trips
INSERT INTO trips (route, departure_time, capacity) VALUES
('Yelwa Campus → Gubi Campus', DATE_ADD(NOW(), INTERVAL 1 DAY), 30),
('Gubi Campus → Yelwa Campus', DATE_ADD(NOW(), INTERVAL 1 DAY HOUR 1), 30),
('Yelwa Campus → Gubi Campus', DATE_ADD(NOW(), INTERVAL 2 DAY), 30),
('Gubi Campus → Yelwa Campus', DATE_ADD(NOW(), INTERVAL 2 DAY HOUR 1), 30),
('Yelwa Campus → Gubi Campus', DATE_ADD(NOW(), INTERVAL 3 DAY), 25);
