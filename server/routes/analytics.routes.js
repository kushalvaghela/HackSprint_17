const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { protect } = require('../middleware/auth.middleware');

// Routes for analytics
router.get('/calendar-events', protect, analyticsController.getCalendarEvents);
router.get('/dashboard-data', protect, analyticsController.getDashboardData);
router.get('/maintenance-trends', protect, analyticsController.getMaintenanceTrends);
router.post('/create-sample-events', protect, analyticsController.createSampleEvents);

module.exports = router;