require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const seed = async () => {
  try {
    await connectDB();

    const users = [
      { email: 'admin@example.com', firstName: 'Site', lastName: 'Admin', username: 'admin', password: 'Admin@123', role: 'admin' },
      { email: 'tech@example.com', firstName: 'Jane', lastName: 'Tech', username: 'tech', password: 'Tech@123', role: 'technician' },
      { email: 'manager@example.com', firstName: 'Mark', lastName: 'Manager', username: 'manager', password: 'Manager@123', role: 'manager' }
    ];

    for (const u of users) {
      const exists = await User.findOne({ email: u.email });
      if (exists) {
        console.log(`User ${u.email} already exists - updating password and role to ${u.role}`);
        exists.password = u.password; // Update password - will be hashed by pre-save hook
        exists.role = u.role;
        await exists.save();
        console.log(`Updated user ${u.email} with new password and role`);
        continue;
      }

      const user = new User(u);
      await user.save();
      console.log(`Created user ${u.email} with role ${u.role}`);
    }

    console.log('Seeding complete');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

seed();
