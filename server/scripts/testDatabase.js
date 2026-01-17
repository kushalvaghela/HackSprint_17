require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const MaintenanceRequest = require('../models/MaintenanceRequest');
const User = require('../models/User');
const Equipment = require('../models/Equipment');
const MaintenanceTeam = require('../models/MaintenanceTeam');

const test = async () => {
  try {
    await connectDB();

    // Check users
    const users = await User.find();
    console.log('Total users:', users.length);
    const admin = users.find(u => u.role === 'admin');
    const manager = users.find(u => u.role === 'manager');
    const technician = users.find(u => u.role === 'technician');
    console.log('Admin:', admin?._id, admin?.email);
    console.log('Manager:', manager?._id, manager?.email);
    console.log('Technician:', technician?._id, technician?.email);

    // Check equipment
    const equipment = await Equipment.find();
    console.log('\nTotal equipment:', equipment.length);
    if (equipment.length > 0) {
      console.log('First equipment:', equipment[0]._id, equipment[0].name);
    }

    // Check teams
    const teams = await MaintenanceTeam.find();
    console.log('\nTotal teams:', teams.length);
    if (teams.length > 0) {
      console.log('First team:', teams[0]._id, teams[0].teamName);
    }

    // Check maintenance requests
    const requests = await MaintenanceRequest.find();
    console.log('\nTotal maintenance requests:', requests.length);
    if (requests.length > 0) {
      console.log('First request:', requests[0]._id, requests[0].subject);
      console.log('First request technician:', requests[0].technician);
      console.log('First request createdBy:', requests[0].createdBy);
      console.log('First request team:', requests[0].team);
    }

    console.log('\n✅ Database check complete');
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
};

test();
