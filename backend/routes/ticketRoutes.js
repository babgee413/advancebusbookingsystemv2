const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/my', authenticateToken, ticketController.getMyTickets);
router.get('/:ticket_number', authenticateToken, ticketController.getTicket);

module.exports = router;
