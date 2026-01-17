const MaintenanceRequest = require('../models/MaintenanceRequest');
const { sendMaintenanceRequestNotification, sendCompletionNotification, sendOverdueNotification } = require('../services/notification.service');
const {
  canCreateRequest,
  canAssignTechnician,
  canSelfAssign,
  canMoveRequestStatus,
  canScrapeEquipment,
  canDeleteRequest,
  canViewRequest,
  getRequestPermissions
} = require('../services/authorization.service');

// @desc    Create a new maintenance request
// @route   POST /api/requests
// @access  Private (Any authenticated user)
const createRequest = async (req, res) => {
  try {
    // Check if user can create a request
    if (!canCreateRequest(req.user)) {
      return res.status(403).json({
        message: 'Access denied: You do not have permission to create maintenance requests'
      });
    }

    const {
      subject,
      equipment,
      category,
      maintenanceType,
      team,
      technician,
      requestDate,
      scheduledDate,
      durationHours,
      priority,
      company,
      notes,
      instructions,
    } = req.body;

    // When a regular user creates a request, it should have status "New" and no assigned technician
    // Only managers can pre-assign technicians at creation time
    let assignedTechnician = null;
    if (technician && req.user.role === 'manager') {
      assignedTechnician = technician;
    }

    const newRequest = new MaintenanceRequest({
      subject,
      createdBy: req.user.id,
      requestDate: requestDate || undefined,
      equipment,
      category,
      maintenanceType,
      team,
      technician: assignedTechnician,
      scheduledDate,
      durationHours,
      priority,
      company,
      status: 'New', // Always create with "New" status
      notes,
      instructions,
    });

    const savedRequest = await newRequest.save();

    // Send notifications if technician is assigned
    if (assignedTechnician) {
      try {
        await sendMaintenanceRequestNotification(null, assignedTechnician, savedRequest, 'assigned');
      } catch (notificationError) {
        console.error('Error sending notification:', notificationError);
        // Don't fail the request if notification fails
      }
    }

    res.status(201).json(savedRequest);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get all maintenance requests (filtered by role)
// @route   GET /api/requests
// @access  Private
const getAllRequests = async (req, res) => {
  try {
    let query = {};

    // Admins and managers can see all requests
    // Technicians can only see requests assigned to them or created by them
    if (req.user.role === 'technician') {
      query = {
        $or: [
          { technician: req.user._id },
          { createdBy: req.user._id }
        ]
      };
    }

    const requests = await MaintenanceRequest.find(query)
      .populate('createdBy', 'firstName lastName')
      .populate('equipment', 'name')
      .populate('team', 'teamName')
      .populate('technician', 'firstName lastName');

    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get a maintenance request by ID
// @route   GET /api/requests/:id
// @access  Private
const getRequestById = async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id)
      .populate('createdBy', 'firstName lastName')
      .populate('equipment', 'name')
      .populate('team', 'teamName')
      .populate('technician', 'firstName lastName');

    if (!request) {
      return res.status(404).json({ message: 'Maintenance request not found' });
    }

    // Check if user has permission to view this request
    const permission = canViewRequest(req.user, request);
    if (!permission.allowed) {
      return res.status(403).json({ message: permission.reason });
    }

    // Add permissions info to response
    const response = request.toObject();
    response.permissions = getRequestPermissions(req.user, request);

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Update a maintenance request
// @route   PUT /api/requests/:id
// @access  Private (Role-based)
const updateRequest = async (req, res) => {
  try {
    const {
      subject,
      equipment,
      category,
      maintenanceType,
      team,
      technician,
      scheduledDate,
      durationHours,
      priority,
      company,
      status,
      notes,
      instructions,
    } = req.body;

    const request = await MaintenanceRequest.findById(req.params.id).populate('technician');

    if (!request) {
      return res.status(404).json({ message: 'Maintenance request not found' });
    }

    // Check if user can view this request (basic access control)
    const viewPermission = canViewRequest(req.user, request);
    if (!viewPermission.allowed && req.user.role !== 'manager' && req.user.role !== 'admin') {
      return res.status(403).json({ message: viewPermission.reason });
    }

    const oldStatus = request.status;
    const oldTechnician = request.technician ? String(request.technician._id) : null;

    /**
     * HANDLE TECHNICIAN ASSIGNMENT
     * Rules:
     * - Only managers can assign technicians
     * - Technicians can only self-assign when status is "New"
     */
    if (technician !== undefined && String(technician) !== oldTechnician) {
      if (String(technician) === req.user._id.toString() && req.user.role === 'technician') {
        // Technician self-assignment
        const selfAssignPermission = canSelfAssign(req.user, request);
        if (!selfAssignPermission.allowed) {
          return res.status(403).json({ message: selfAssignPermission.reason });
        }
        request.technician = technician;
      } else {
        // Assigning to another technician
        const assignPermission = canAssignTechnician(req.user, request, technician);
        if (!assignPermission.allowed) {
          return res.status(403).json({ message: assignPermission.reason });
        }
        request.technician = technician;
      }
    }

    /**
     * HANDLE STATUS CHANGES
     * Rules:
     * - Managers can move to any status (including Scrap for equipment scrapping)
     * - Technicians can only move their assigned requests through workflow
     * - Admins cannot modify request status
     */
    if (status !== undefined && status !== oldStatus) {
      const statusPermission = canMoveRequestStatus(req.user, request, status);
      if (!statusPermission.allowed) {
        return res.status(403).json({ message: statusPermission.reason });
      }
      request.status = status;
    }

    /**
     * HANDLE OTHER FIELD UPDATES
     * Rules:
     * - Managers can update most fields
     * - Technicians can update notes/instructions only for their assigned requests
     * - Admins cannot update requests
     */
    if (req.user.role === 'manager' || req.user.role === 'admin') {
      // Managers and admins can update all fields
      if (subject !== undefined) request.subject = subject;
      if (equipment !== undefined) request.equipment = equipment;
      if (category !== undefined) request.category = category;
      if (maintenanceType !== undefined) request.maintenanceType = maintenanceType;
      if (team !== undefined) request.team = team;
      if (scheduledDate !== undefined) request.scheduledDate = scheduledDate;
      if (durationHours !== undefined) request.durationHours = durationHours;
      if (priority !== undefined) request.priority = priority;
      if (company !== undefined) request.company = company;
      if (notes !== undefined) request.notes = notes;
      if (instructions !== undefined) request.instructions = instructions;
    } else if (req.user.role === 'technician') {
      // Technicians can only update notes and instructions for their assigned requests
      const isAssignedToTechnician =
        request.technician && String(request.technician._id) === req.user._id.toString();

      if (!isAssignedToTechnician) {
        return res.status(403).json({
          message: 'You can only update notes and instructions for requests assigned to you'
        });
      }

      if (notes !== undefined) request.notes = notes;
      if (instructions !== undefined) request.instructions = instructions;

      // Prevent technicians from changing other fields
      if (
        subject !== undefined ||
        equipment !== undefined ||
        category !== undefined ||
        maintenanceType !== undefined ||
        team !== undefined ||
        scheduledDate !== undefined ||
        durationHours !== undefined ||
        priority !== undefined ||
        company !== undefined
      ) {
        return res.status(403).json({
          message: 'Technicians can only update notes and instructions'
        });
      }
    }

    const updatedRequest = await request.save();
    const response = updatedRequest.toObject();
    response.permissions = getRequestPermissions(req.user, updatedRequest);

    // Send notifications based on changes
    try {
      // If technician changed, notify new technician
      if (technician && String(technician) !== oldTechnician) {
        await sendMaintenanceRequestNotification(null, technician, updatedRequest, 'assigned');
      }

      // If status changed to "Repaired", notify creator
      if (status === 'Repaired' && oldStatus !== 'Repaired') {
        await sendCompletionNotification(null, updatedRequest.createdBy, updatedRequest);
      }
    } catch (notificationError) {
      console.error('Error sending notification:', notificationError);
      // Don't fail the request if notification fails
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Delete a maintenance request
// @route   DELETE /api/requests/:id
// @access  Private (Manager/Admin only)
const deleteRequest = async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: 'Maintenance request not found' });
    }

    const deletePermission = canDeleteRequest(req.user, request);
    if (!deletePermission.allowed) {
      return res.status(403).json({ message: deletePermission.reason });
    }

    await request.deleteOne();
    res.json({ message: 'Maintenance request removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Check for overdue maintenance requests and send notifications
// @route   POST /api/requests/check-overdue
// @access  Private (Manager/Admin only)
const checkOverdueRequests = async (req, res) => {
  try {
    // Only managers and admins can check overdue requests
    if (!['manager', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        message: 'Only managers and admins can check overdue requests'
      });
    }

    const now = new Date();
    const overdueRequests = await MaintenanceRequest.find({
      status: { $in: ['New', 'In Progress'] },
      scheduledDate: { $lt: now }
    }).populate('technician', 'firstName lastName');

    let notificationsSent = 0;

    for (const request of overdueRequests) {
      if (request.technician) {
        try {
          await sendOverdueNotification(null, request.technician._id, request);
          notificationsSent++;
        } catch (notificationError) {
          console.error('Error sending overdue notification:', notificationError);
        }
      }
    }

    res.json({
      message: `Checked ${overdueRequests.length} overdue requests, sent ${notificationsSent} notifications`
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

module.exports = {
  createRequest,
  getAllRequests,
  getRequestById,
  updateRequest,
  deleteRequest,
  checkOverdueRequests,
};
