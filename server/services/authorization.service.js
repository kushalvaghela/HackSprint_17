/**
 * Authorization Service
 * Handles role-based access control logic for maintenance request operations
 * 
 * Rules:
 * - Any authenticated user can create a request
 * - Only managers can assign technicians to requests
 * - Technicians can only self-assign (assign themselves) when status is "New"
 * - Admins cannot assign or work on maintenance requests
 * - Only technicians can move requests through workflow (In Progress, Repaired)
 */

/**
 * Check if user can create a maintenance request
 * Only managers and technicians can create maintenance requests
 * @param {Object} user - The user object
 * @returns {boolean} - True if allowed
 */
const canCreateRequest = (user) => {
  if (!user || !user.role) return false;
  // Only managers and technicians can create requests
  return ['manager', 'technician'].includes(user.role);
};

/**
 * Check if user can assign a technician to a request
 * @param {Object} user - The user object (the person trying to assign)
 * @param {Object} request - The maintenance request object
 * @param {string} technicianId - The ID of the technician being assigned
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
const canAssignTechnician = (user, request, technicianId) => {
  if (!user || !user.role) {
    return { allowed: false, reason: 'User not authenticated' };
  }

  // Only managers can assign technicians
  if (user.role === 'manager') {
    return { allowed: true };
  }

  // Technicians can only self-assign
  if (user.role === 'technician') {
    return {
      allowed: false,
      reason: 'Technicians cannot assign other technicians. Use self-assignment for your own tasks.'
    };
  }

  // Admins cannot assign
  if (user.role === 'admin') {
    return {
      allowed: false,
      reason: 'Admins cannot assign or work on maintenance requests'
    };
  }

  return { allowed: false, reason: 'Unknown role' };
};

/**
 * Check if user can self-assign a request
 * @param {Object} user - The user object (technician)
 * @param {Object} request - The maintenance request object
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
const canSelfAssign = (user, request) => {
  if (!user || !user.role) {
    return { allowed: false, reason: 'User not authenticated' };
  }

  // Only technicians can self-assign
  if (user.role !== 'technician') {
    return {
      allowed: false,
      reason: 'Only technicians can self-assign tasks'
    };
  }

  // Request must be in "New" status
  if (request.status !== 'New') {
    return {
      allowed: false,
      reason: `Cannot self-assign a request with status "${request.status}". Only "New" requests can be self-assigned.`
    };
  }

  // User can only assign themselves
  return {
    allowed: true,
    userId: user._id.toString()
  };
};

/**
 * Check if user can move a request to the next status
 * @param {Object} user - The user object
 * @param {Object} request - The maintenance request object
 * @param {string} newStatus - The new status being set
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
const canMoveRequestStatus = (user, request, newStatus) => {
  if (!user || !user.role) {
    return { allowed: false, reason: 'User not authenticated' };
  }

  const validStatuses = ['New', 'In Progress', 'Repaired', 'Scrap'];
  if (!validStatuses.includes(newStatus)) {
    return { allowed: false, reason: `Invalid status: ${newStatus}` };
  }

  // Managers can scrap or manage any status
  if (user.role === 'manager') {
    return { allowed: true };
  }

  // Technicians can only move their assigned requests
  if (user.role === 'technician') {
    const isAssignedToTechnician =
      request.technician && request.technician.toString() === user._id.toString();

    if (!isAssignedToTechnician) {
      return {
        allowed: false,
        reason: 'You can only manage requests assigned to you'
      };
    }

    // Technicians can move status for their assigned requests
    // Typically: New -> In Progress -> Repaired
    const validTransitions = {
      'New': ['In Progress'],
      'In Progress': ['Repaired', 'New'],
      'Repaired': [], // Cannot move out of Repaired
      'Scrap': []
    };

    const allowed = validTransitions[request.status]?.includes(newStatus);
    if (!allowed && newStatus !== request.status) {
      return {
        allowed: false,
        reason: `Cannot move request from "${request.status}" to "${newStatus}"`
      };
    }

    return { allowed: true };
  }

  // Admins cannot work on maintenance requests
  if (user.role === 'admin') {
    return {
      allowed: false,
      reason: 'Admins cannot modify maintenance request status'
    };
  }

  return { allowed: false, reason: 'Unknown role' };
};

/**
 * Check if user can scrap equipment (mark request as Scrap)
 * @param {Object} user - The user object
 * @param {Object} request - The maintenance request object
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
const canScrapeEquipment = (user, request) => {
  if (!user || !user.role) {
    return { allowed: false, reason: 'User not authenticated' };
  }

  // Only managers and admins can scrap equipment
  if (['manager', 'admin'].includes(user.role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Only managers and admins can scrap equipment'
  };
};

/**
 * Check if user can delete a request
 * @param {Object} user - The user object
 * @param {Object} request - The maintenance request object
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
const canDeleteRequest = (user, request) => {
  if (!user || !user.role) {
    return { allowed: false, reason: 'User not authenticated' };
  }

  // Only admins and managers can delete
  if (['admin', 'manager'].includes(user.role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Only managers and admins can delete requests'
  };
};

/**
 * Check if user can view a request
 * @param {Object} user - The user object
 * @param {Object} request - The maintenance request object
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
const canViewRequest = (user, request) => {
  if (!user || !user.role) {
    return { allowed: false, reason: 'User not authenticated' };
  }

  // Admins and managers can view all requests
  if (['admin', 'manager'].includes(user.role)) {
    return { allowed: true };
  }

  // Technicians can view requests assigned to them or created by them
  if (user.role === 'technician') {
    const isAssignedToTechnician =
      request.technician && request.technician.toString() === user._id.toString();
    const isCreatedByTechnician =
      request.createdBy && request.createdBy.toString() === user._id.toString();

    if (isAssignedToTechnician || isCreatedByTechnician) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'You can only view requests assigned to you or created by you'
    };
  }

  return { allowed: false, reason: 'Insufficient permissions' };
};

/**
 * Get all available actions for a user on a specific request
 * @param {Object} user - The user object
 * @param {Object} request - The maintenance request object
 * @returns {Object} - Object with boolean flags for each action
 */
const getRequestPermissions = (user, request) => {
  return {
    canView: canViewRequest(user, request).allowed,
    canAssignTechnician: canAssignTechnician(user, request, null).allowed,
    canSelfAssign: canSelfAssign(user, request).allowed,
    canMoveStatus: canMoveRequestStatus(user, request, 'In Progress').allowed,
    canScrapEquipment: canScrapeEquipment(user, request).allowed,
    canDelete: canDeleteRequest(user, request).allowed,
    userRole: user?.role
  };
};

module.exports = {
  canCreateRequest,
  canAssignTechnician,
  canSelfAssign,
  canMoveRequestStatus,
  canScrapeEquipment,
  canDeleteRequest,
  canViewRequest,
  getRequestPermissions
};
