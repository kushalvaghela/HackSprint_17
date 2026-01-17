require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const MaintenanceRequest = require('../models/MaintenanceRequest');

const updateTasksToTeamAssignment = async () => {
  try {
    await connectDB();

    console.log('🔄 Converting task assignments to team-based...\n');

    // Find all tasks assigned to technicians in Team Trio
    const tasks = await MaintenanceRequest.find({ technician: { $ne: null } });
    console.log(`Found ${tasks.length} tasks with individual technician assignments\n`);

    let updated = 0;
    for (const task of tasks) {
      // Clear the individual technician assignment and keep team-based
      if (task.technician) {
        const originalTech = task.technician;
        task.technician = null; // Remove individual assignment
        await task.save();
        updated++;
        console.log(`✅ Task "${task.subject}": Removed individual technician, team assignment remains`);
      }
    }

    console.log(`\n✅ Updated ${updated} tasks to team-based assignment!`);
    console.log('\n📋 All team members in a task\'s team will now see that task on their dashboard.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
};

updateTasksToTeamAssignment();
