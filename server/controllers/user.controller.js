const User = require('../models/User');
const MaintenanceTeam = require('../models/MaintenanceTeam');

// @desc    Get all users
// @route   GET /api/users
// @access  Private
// Role-based: Admins/Managers see all users; Technicians see only their team members
const getAllUsers = async (req, res) => {
  try {
    // If user is a technician, only show their team members
    if (req.user.role === 'technician') {
      // Find teams where this technician is a member
      const teams = await MaintenanceTeam.find({
        members: req.user._id
      }).populate('members', '-password');

      // Extract unique team members
      const memberIds = new Set();
      teams.forEach(team => {
        team.members.forEach(member => {
          memberIds.add(member._id.toString());
        });
      });

      // Get all team members
      const users = await User.find({
        _id: { $in: Array.from(memberIds) }
      }).select('-password');

      return res.json(users);
    }

    // Admins and managers see all users
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Create a new user (admin only)
// @route   POST /api/users
// @access  Admin
const createUser = async (req, res) => {
  try {
    const { email, firstName, lastName, username, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'User already exists' });

    user = new User({ email, firstName, lastName, username, password, role });
    await user.save();
    const out = user.toObject();
    delete out.password;
    res.status(201).json(out);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

module.exports = {
  getAllUsers,
  createUser,
};
