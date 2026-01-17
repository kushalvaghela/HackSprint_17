require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Equipment = require('../models/Equipment');
const MaintenanceTeam = require('../models/MaintenanceTeam');
const MaintenanceRequest = require('../models/MaintenanceRequest');

const seedTestData = async () => {
  try {
    await connectDB();

    console.log('🌱 Starting comprehensive seed...\n');

    // 1. Ensure users exist
    console.log('📋 Creating/updating users...');
    let admin = await User.findOne({ email: 'admin@example.com' });
    if (!admin) {
      admin = await User.create({
        email: 'admin@example.com',
        firstName: 'Site',
        lastName: 'Admin',
        username: 'admin',
        password: 'Admin@123',
        role: 'admin'
      });
    }
    console.log('✓ Admin:', admin._id);

    let manager = await User.findOne({ email: 'manager@example.com' });
    if (!manager) {
      manager = await User.create({
        email: 'manager@example.com',
        firstName: 'Mark',
        lastName: 'Manager',
        username: 'manager',
        password: 'Manager@123',
        role: 'manager'
      });
    }
    console.log('✓ Manager:', manager._id);

    let technician = await User.findOne({ email: 'tech@example.com' });
    if (!technician) {
      technician = await User.create({
        email: 'tech@example.com',
        firstName: 'Jane',
        lastName: 'Tech',
        username: 'tech',
        password: 'Tech@123',
        role: 'technician'
      });
    }
    console.log('✓ Technician:', technician._id);

    // 2. Create equipment
    console.log('\n🔧 Creating equipment...');
    let equipment = await Equipment.findOne({ name: 'Test Laptop' });
    if (!equipment) {
      equipment = await Equipment.create({
        name: 'Test Laptop',
        category: 'Computers',
        serialNumber: 'LAPTOP-001',
        company: 'Test Company',
        usedByType: 'Employee',
        status: 'Active'
      });
    }
    console.log('✓ Equipment:', equipment._id, equipment.name);

    // 3. Create team with technician
    console.log('\n👥 Creating team...');
    let team = await MaintenanceTeam.findOne({ teamName: 'Test Team' });
    if (!team) {
      team = await MaintenanceTeam.create({
        teamName: 'Test Team',
        company: 'Test Company',
        members: [technician._id],
        leader: manager._id
      });
    } else {
      // Ensure technician is in the team
      if (!team.members.includes(technician._id)) {
        team.members.push(technician._id);
        await team.save();
      }
    }
    console.log('✓ Team:', team._id, team.teamName);
    console.log('  Members:', team.members.map(m => m.toString()));

    // 4. Create maintenance request assigned to technician
    console.log('\n🔨 Creating maintenance request...');
    let request = await MaintenanceRequest.findOne({ subject: 'Test Maintenance Task' });
    if (!request) {
      request = await MaintenanceRequest.create({
        subject: 'Test Maintenance Task',
        createdBy: manager._id,
        equipment: equipment._id,
        category: 'Computers',
        maintenanceType: 'Preventive',
        team: team._id,
        technician: technician._id,
        scheduledDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        priority: 'High',
        company: 'Test Company',
        status: 'New',
        notes: 'This is a test maintenance request'
      });
    }
    console.log('✓ Request:', request._id, request.subject);
    console.log('  Assigned to:', request.technician);
    console.log('  Created by:', request.createdBy);
    console.log('  Team:', request.team);

    // 5. Verify the setup
    console.log('\n✅ Verification:');
    const reqCheck = await MaintenanceRequest.findById(request._id)
      .populate('technician', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('team', 'teamName')
      .populate('equipment', 'name');
    
    console.log('Request details:');
    console.log('  Subject:', reqCheck.subject);
    console.log('  Equipment:', reqCheck.equipment?.name);
    console.log('  Team:', reqCheck.team?.teamName);
    console.log('  Assigned to:', reqCheck.technician?.firstName, reqCheck.technician?.lastName, `(${reqCheck.technician?.email})`);
    console.log('  Created by:', reqCheck.createdBy?.firstName, reqCheck.createdBy?.lastName, `(${reqCheck.createdBy?.email})`);

    console.log('\n🎉 Seed complete! You can now:');
    console.log(`  1. Login as manager: manager@example.com / Manager@123`);
    console.log(`  2. Login as technician: tech@example.com / Tech@123`);
    console.log(`  3. Technician should see the test task on the dashboard`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
};

seedTestData();
