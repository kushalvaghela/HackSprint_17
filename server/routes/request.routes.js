const express = require('express');
const router = express.Router();

const { protect, requireRole } = require('../middleware/auth.middleware');
const requestController = require('../controllers/request.controller');

/* =========================
   MAINTENANCE REQUEST ROUTES
   
   RBAC Rules:
   - Create: Any authenticated user
   - Read: Admins/Managers see all; Technicians see only assigned/created
   - Update: Managers can update all fields; Technicians can update notes/instructions
   - Delete: Managers/Admins only
   - Assign: Managers only (or technicians self-assign)
   - Status: Managers can move to any; Technicians move only their requests
========================= */

// Check overdue maintenance requests (Manager/Admin only)
router.post(
  '/check-overdue',
  protect,
  requestController.checkOverdueRequests
);

// Create maintenance request (Any authenticated user)
router.post(
  '/',
  protect,
  requestController.createRequest
);

// Get all requests (Filtered by role in controller)
router.get(
  '/',
  protect,
  requestController.getAllRequests
);

// Get a specific request (Permission checked in controller)
router.get(
  '/:id',
  protect,
  requestController.getRequestById
);

// Update a request (Role-based authorization in controller)
// Managers can update any field and assign technicians
// Technicians can only update notes/instructions for their assigned requests
router.put(
  '/:id',
  protect,
  requestController.updateRequest
);

// Delete a request (Manager/Admin only)
router.delete(
  '/:id',
  protect,
  requireRole(['admin', 'manager']),
  requestController.deleteRequest
);

module.exports = router;
