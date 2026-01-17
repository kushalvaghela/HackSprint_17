require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Equipment = require('../models/Equipment');
const MaintenanceTeam = require('../models/MaintenanceTeam');
const MaintenanceRequest = require('../models/MaintenanceRequest');

const assignTasksToExistingTechs = async () => {
  try {
    await connectDB();

    console.log('🔍 Finding existing technicians and their teams...\n');

    // Get the manager
    const manager = await User.findOne({ email: 'manager@example.com' });
    if (!manager) throw new Error('Manager not found');
    console.log('✓ Manager found:', manager.firstName, manager.lastName);

    // Find Team Trio (the team created by admin)
    const teamTrio = await MaintenanceTeam.findOne({ teamName: 'Team Trio' });
    if (!teamTrio) throw new Error('Team Trio not found');
    console.log('✓ Team found:', teamTrio.teamName);

    // Get team members
    const teamMembers = await User.find({ _id: { $in: teamTrio.members } });
    console.log(`✓ Team members: ${teamMembers.map(t => t.firstName).join(', ')}\n`);

    // Get or create equipment for tasks
    let equipment = await Equipment.findOne({ name: 'Server Unit' });
    if (!equipment) {
      equipment = await Equipment.create({
        name: 'Server Unit',
        category: 'Servers',
        serialNumber: 'SRV-001',
        company: 'Test Company',
        usedByType: 'Department'
      });
    }
    console.log('✓ Equipment created/found:', equipment.name);

    // Create tasks for each technician in the team
    console.log('\n📝 Creating tasks for team members...\n');

    for (const tech of teamMembers) {
      // Check if task already exists
      const existingTask = await MaintenanceRequest.findOne({
        technician: tech._id,
        subject: `Maintenance for ${tech.firstName}`
      });

      if (existingTask) {
        console.log(`⏭️  Task already exists for ${tech.firstName}`);
        continue;
      }

      const task = await MaintenanceRequest.create({
        subject: `Maintenance for ${tech.firstName}`,
        createdBy: manager._id,
        equipment: equipment._id,
        category: 'Servers',
        maintenanceType: 'Preventive',
        team: teamTrio._id,
        technician: tech._id,
        scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        priority: 'High',
        company: 'Test Company',
        status: 'New',
        notes: `This task is assigned to ${tech.firstName} from ${teamTrio.teamName}`
      });

      console.log(`✅ Task created for ${tech.firstName} (${tech.email})`);
      console.log(`   Task ID: ${task._id}`);
      console.log(`   Subject: ${task.subject}`);
    }

    console.log('\n🎉 All tasks created successfully!');
    console.log('\n📋 Technicians can now login and see their tasks:');
    teamMembers.forEach(tech => {
      console.log(`   Email: ${tech.email} | Name: ${tech.firstName} ${tech.lastName}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
};

assignTasksToExistingTechs();
