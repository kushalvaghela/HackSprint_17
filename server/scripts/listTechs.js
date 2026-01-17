require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const MaintenanceTeam = require('../models/MaintenanceTeam');
const MaintenanceRequest = require('../models/MaintenanceRequest');

const list = async () => {
  try {
    await connectDB();
    
    console.log('=== ALL TECHNICIANS ===\n');
    const techs = await User.find({ role: 'technician' });
    techs.forEach(t => {
      console.log(`ID: ${t._id}`);
      console.log(`Name: ${t.firstName} ${t.lastName}`);
      console.log(`Email: ${t.email}`);
      console.log('---');
    });

    console.log('\n=== ALL TEAMS ===\n');
    const teams = await MaintenanceTeam.find().populate('members', 'firstName lastName email');
    teams.forEach(t => {
      console.log(`Team: ${t.teamName}`);
      console.log(`Members: ${t.members.map(m => `${m.firstName} ${m.lastName} (${m._id})`).join(', ')}`);
      console.log('---');
    });

    console.log('\n=== ALL MAINTENANCE REQUESTS ===\n');
    const requests = await MaintenanceRequest.find()
      .populate('technician', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName')
      .populate('team', 'teamName');
    requests.forEach(r => {
      console.log(`Task: ${r.subject}`);
      console.log(`Assigned to: ${r.technician?.firstName} ${r.technician?.lastName} (${r.technician?._id})`);
      console.log(`Created by: ${r.createdBy?.firstName} ${r.createdBy?.lastName}`);
      console.log(`Team: ${r.team?.teamName}`);
      console.log('---');
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

list();
