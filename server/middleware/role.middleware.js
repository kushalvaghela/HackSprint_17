// Role-based access control middleware
// Usage: requireRole('admin') or requireRole('admin','manager')
const requireRole = (...allowedRoles) => (req, res, next) => {
	try {
		const user = req.user;
		if (!user) return res.status(401).json({ message: 'Not authenticated' });
		if (allowedRoles.length === 0) return next();
		if (!allowedRoles.includes(user.role)) {
			return res.status(403).json({ message: 'Forbidden: insufficient role' });
		}
		return next();
	} catch (error) {
		return res.status(500).json({ message: 'Server error', error: error.message });
	}
};

module.exports = { requireRole };
