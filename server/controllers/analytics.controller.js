const MaintenanceRequest = require('../models/MaintenanceRequest');
const User = require('../models/User');
const Equipment = require('../models/Equipment');
const MaintenanceTeam = require('../models/MaintenanceTeam');

const MS_IN_HOUR = 1000 * 60 * 60;

/* ======================================================
   GET CALENDAR EVENTS
====================================================== */
const getCalendarEvents = async (req, res) => {
  try {
    const { month, year } = req.query;

    let filter = { scheduledDate: { $exists: true, $ne: null } };

    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      filter.scheduledDate = { $gte: startDate, $lt: endDate };
    }

    const events = await MaintenanceRequest.find(filter)
      .populate('createdBy', 'firstName lastName')
      .populate('equipment', 'name')
      .populate('team', 'teamName')
      .populate('technician', 'firstName lastName')
      .sort({ scheduledDate: 1 });

    const formattedEvents = events.map(event => ({
      id: event._id,
      subject: event.subject,
      date: event.scheduledDate,
      day: event.scheduledDate?.getDate?.() ?? null,
      month: event.scheduledDate?.getMonth?.() ?? null,
      year: event.scheduledDate?.getFullYear?.() ?? null,
      time: event.scheduledDate ? event.scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null,
      status: event.status || 'scheduled',
      priority: event.priority,
      category: event.category,
      maintenanceType: event.maintenanceType,
      equipment: event.equipment?.name || 'Unknown Equipment',
      technician: event.technician ? `${event.technician.firstName} ${event.technician.lastName}` : 'Unassigned',
      team: event.team?.teamName || 'Unknown Team',
      durationHours: event.durationHours,
      notes: event.notes
    }));

    res.status(200).json(formattedEvents);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/* ======================================================
   DASHBOARD DATA
   Returns a superset of statistics used by Dashboard and Reporting
====================================================== */
const getDashboardData = async (req, res) => {
  try {
    // Build filter based on user role
    let filter = {};
    if (req.user.role === 'technician') {
      // For technicians: show tasks where they are:
      // 1. Assigned as individual technician, OR
      // 2. Part of the team that the task is assigned to
      const MaintenanceTeam = require('../models/MaintenanceTeam');
      const userTeams = await MaintenanceTeam.find({ members: req.user._id });
      const teamIds = userTeams.map(t => t._id);
      
      filter = {
        $or: [
          { technician: req.user._id },           // Individually assigned
          { createdBy: req.user._id },            // Created by this technician
          { team: { $in: teamIds }, technician: null }  // Team assignment (no individual tech)
        ]
      };
    }

    const totalRequests = await MaintenanceRequest.countDocuments(filter);
    const completedRequests = await MaintenanceRequest.countDocuments({ ...filter, status: 'Repaired' });
    const inProgressRequests = await MaintenanceRequest.countDocuments({ ...filter, status: 'In Progress' });
    const pendingRequests = await MaintenanceRequest.countDocuments({ ...filter, status: 'New' });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const overdueRequests = await MaintenanceRequest.countDocuments({
      ...filter,
      status: { $nin: ['Repaired', 'Scrap'] },
      scheduledDate: { $lt: now, $exists: true }
    });

    const completedToday = await MaintenanceRequest.countDocuments({
      ...filter,
      status: 'Repaired',
      updatedAt: { $gte: today }
    });

    const underRepairEquipment = inProgressRequests;

    const activeTechnicians = await MaintenanceRequest.distinct('technician', { ...filter, status: 'In Progress' });
    const allTechnicians = await MaintenanceRequest.distinct('technician', filter);
    const totalTechnicians = allTechnicians.filter(id => id).length;
    const technicianUtilization = totalTechnicians > 0 ? Math.round((activeTechnicians.filter(id => id).length / totalTechnicians) * 100) : 0;

    // Average response time: average hours between createdAt and updatedAt for repaired requests
    let avgResponseTime = null;
    try {
      const agg = await MaintenanceRequest.aggregate([
        { $match: { ...filter, status: 'Repaired', createdAt: { $exists: true }, updatedAt: { $exists: true } } },
        { $project: { diffMs: { $subtract: ['$updatedAt', '$createdAt'] } } },
        { $group: { _id: null, avgMs: { $avg: '$diffMs' } } }
      ]);
      if (agg && agg[0] && agg[0].avgMs != null) {
        avgResponseTime = +(agg[0].avgMs / MS_IN_HOUR).toFixed(2);
      }
    } catch (e) {
      // ignore and leave null
      avgResponseTime = null;
    }

    const totalEquipment = await Equipment.countDocuments();
    const scrappedEquipment = await Equipment.countDocuments({ status: 'Scrapped' });
    const equipmentHealth = totalEquipment > 0 ? Math.round(((totalEquipment - scrappedEquipment) / totalEquipment) * 100) : 100;

    const priorityAgg = await MaintenanceRequest.aggregate([
      { $match: filter },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    const priorityDistribution = { critical: 0, high: 0, medium: 0, low: 0 };
    priorityAgg.forEach(p => {
      if (p._id) priorityDistribution[p._id.toLowerCase()] = p.count;
    });

    const recentRequests = await MaintenanceRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('createdBy', 'firstName lastName')
      .populate('equipment', 'name')
      .populate('team', 'teamName')
      .populate('technician', 'firstName lastName');

    const upcomingMaintenance = await MaintenanceRequest.find({
      ...filter,
      scheduledDate: { $gte: now, $lte: next7Days }
    })
      .sort({ scheduledDate: 1 })
      .populate('createdBy', 'firstName lastName')
      .populate('equipment', 'name')
      .populate('team', 'teamName')
      .populate('technician', 'firstName lastName');

    // Maintenance type distribution (Preventive vs Corrective)
    const typeAgg = await MaintenanceRequest.aggregate([
      { $match: filter },
      { $group: { _id: '$maintenanceType', count: { $sum: 1 } } }
    ]);
    const maintenanceTypeDistribution = { Preventive: 0, Corrective: 0 };
    typeAgg.forEach(t => {
      if (t._id) {
        maintenanceTypeDistribution[t._id] = t.count;
      }
    });

    // Top problematic equipment (by number of requests)
    const topEquipAgg = await MaintenanceRequest.aggregate([
      { $match: filter },
      { $group: { _id: '$equipment', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const topEquipment = [];
    for (const row of topEquipAgg) {
      if (!row._id) continue;
      const eq = await Equipment.findById(row._id).select('name');
      topEquipment.push({ equipmentId: row._id, name: eq ? eq.name : 'Unknown', count: row.count });
    }

    // Top downtime equipment (sum of durationHours)
    const downtimeAgg = await MaintenanceRequest.aggregate([
      { $match: { ...filter, durationHours: { $exists: true, $gt: 0 } } },
      { $group: { _id: '$equipment', totalDowntime: { $sum: '$durationHours' }, requests: { $sum: 1 } } },
      { $sort: { totalDowntime: -1 } },
      { $limit: 5 }
    ]);

    const topDowntime = [];
    for (const row of downtimeAgg) {
      if (!row._id) continue;
      const eq = await Equipment.findById(row._id).select('name');
      topDowntime.push({ equipmentId: row._id, name: eq ? eq.name : 'Unknown', totalDowntime: row.totalDowntime, requests: row.requests });
    }

    // Warranty expiring soon (defaults to next 30 days)
    const warrantyDays = req.query.warrantyDays ? parseInt(req.query.warrantyDays, 10) : 30;
    const warrantyCutoff = new Date(now.getTime() + (warrantyDays * 24 * 60 * 60 * 1000));
    const warrantyExpiringRaw = await Equipment.find({ warrantyExpiresAt: { $exists: true, $lte: warrantyCutoff } })
      .select('name warrantyExpiresAt')
      .sort({ warrantyExpiresAt: 1 })
      .limit(10);

    const warrantyExpiring = warrantyExpiringRaw.map(eq => ({ equipmentId: eq._id, name: eq.name, warrantyExpiresAt: eq.warrantyExpiresAt }));

    // Build simple trends: monthly counts for last 6 months by status
    const months = 6;
    const labels = [];
    const monthStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    for (let i = 0; i < months; i++) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth() + i, 1);
      labels.push(d.toLocaleString('default', { month: 'short' }));
    }

    // Aggregate counts per month and status
    const trendAgg = await MaintenanceRequest.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $project: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, status: '$status' } },
      { $group: { _id: { year: '$year', month: '$month', status: '$status' }, count: { $sum: 1 } } }
    ]);

    // Map months to counts
    const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
    const monthKeys = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth() + i, 1);
      monthKeys.push(monthKey(d.getFullYear(), d.getMonth() + 1));
    }

    const countsByMonth = {};
    trendAgg.forEach(row => {
      const key = monthKey(row._id.year, row._id.month);
      countsByMonth[key] = countsByMonth[key] || {};
      countsByMonth[key][row._id.status] = row.count;
    });

    const completedSeries = monthKeys.map(k => countsByMonth[k]?.['Repaired'] || 0);
    const inProgressSeries = monthKeys.map(k => countsByMonth[k]?.['In Progress'] || 0);
    const pendingSeries = monthKeys.map(k => countsByMonth[k]?.['New'] || 0);

    const monthlyTrendData = {
      labels,
      datasets: [
        { label: 'Completed', data: completedSeries, borderColor: 'rgb(34,197,94)', backgroundColor: 'rgba(34,197,94,0.08)', tension: 0.35 },
        { label: 'In Progress', data: inProgressSeries, borderColor: 'rgb(59,130,246)', backgroundColor: 'rgba(59,130,246,0.08)', tension: 0.35 },
        { label: 'Pending', data: pendingSeries, borderColor: 'rgb(234,179,8)', backgroundColor: 'rgba(234,179,8,0.08)', tension: 0.35 }
      ]
    };

    // Status distribution (pie)
    const statusAgg = await MaintenanceRequest.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const statusLabels = statusAgg.map(s => s._id || 'Unknown');
    const statusCounts = statusAgg.map(s => s.count);
    const statusData = {
      labels: statusLabels,
      datasets: [{ label: 'Requests', data: statusCounts }]
    };

    // Category distribution
    const categoryAgg = await MaintenanceRequest.aggregate([
      { $match: filter },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const categoryLabels = categoryAgg.map(c => c._id || 'Unspecified');
    const categoryCounts = categoryAgg.map(c => c.count);
    const categoryData = {
      labels: categoryLabels,
      datasets: [{ label: 'By Category', data: categoryCounts }]
    };

    // Performance data: supply avgResponseTime as a simple dataset for the reporting bar
    const performanceData = {
      labels: ['Avg Response (hrs)'],
      datasets: [{ label: 'Hours', data: [avgResponseTime ?? 0] }]
    };

    res.status(200).json({
      // flat top-level fields (legacy clients may expect these)
      totalRequests,
      completedRequests,
      inProgressRequests,
      pendingRequests,
      priorityDistribution,
      equipmentHealth,
      scrappedEquipment,
      totalEquipment,
      maintenanceTypeDistribution,
      topEquipment,
      topDowntime,
      warrantyExpiring,
      recentRequests,
      upcomingMaintenance,

      // statistics object for newer clients
      statistics: {
        underRepairEquipment,
        technicianUtilization,
        pendingRequests,
        overdueRequests,
        completedToday,
        avgResponseTime,
        activeTechnicians: activeTechnicians.filter(id => id).length,
        totalTechnicians,
        equipmentHealth,
        scrappedEquipment,
        totalEquipment
      },

      // trends and chart-friendly payloads
      trends: {
        monthlyTrendData,
        statusData,
        categoryData,
        performanceData
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/* ======================================================
   MAINTENANCE TRENDS (detailed endpoint)
   Accepts optional query params: dateRange, categoryFilter
====================================================== */
const getMaintenanceTrends = async (req, res) => {
  try {
    const { dateRange, categoryFilter } = req.query;
    // Compute start date based on dateRange
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1); // default last 6 months
    if (dateRange === 'last7days') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (dateRange === 'last30days') startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    else if (dateRange === 'last90days') startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const match = { createdAt: { $gte: startDate } };
    if (categoryFilter && categoryFilter !== 'all') match.category = categoryFilter;

    // monthly aggregated counts by status
    const months = 6;
    const monthStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const trendAgg = await MaintenanceRequest.aggregate([
      { $match: match },
      { $project: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, status: '$status' } },
      { $group: { _id: { year: '$year', month: '$month', status: '$status' }, count: { $sum: 1 } } }
    ]);

    const labels = [];
    const monthKeys = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth() + i, 1);
      labels.push(d.toLocaleString('default', { month: 'short' }));
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const countsByMonth = {};
    trendAgg.forEach(row => {
      const key = `${row._id.year}-${String(row._id.month).padStart(2, '0')}`;
      countsByMonth[key] = countsByMonth[key] || {};
      countsByMonth[key][row._id.status] = row.count;
    });

    const completedSeries = monthKeys.map(k => countsByMonth[k]?.['Repaired'] || 0);
    const inProgressSeries = monthKeys.map(k => countsByMonth[k]?.['In Progress'] || 0);
    const pendingSeries = monthKeys.map(k => countsByMonth[k]?.['New'] || 0);

    const monthlyTrendData = { labels, datasets: [
      { label: 'Completed', data: completedSeries },
      { label: 'In Progress', data: inProgressSeries },
      { label: 'Pending', data: pendingSeries }
    ] };

    // status distribution
    const statusAgg = await MaintenanceRequest.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    const statusLabels = statusAgg.map(s => s._id || 'Unknown');
    const statusCounts = statusAgg.map(s => s.count);
    const statusData = { labels: statusLabels, datasets: [{ label: 'Requests', data: statusCounts }] };

    res.status(200).json({ monthlyTrendData, statusData });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/* ======================================================
   CREATE SAMPLE EVENTS
====================================================== */
const createSampleEvents = async (req, res) => {
  try {
    let user = await User.findOne();
    if (!user) {
      user = await User.create({ username: 'testuser', firstName: 'Test', lastName: 'User', email: 'test@example.com', password: 'password123' });
    }

    let equipment = await Equipment.findOne();
    if (!equipment) {
      equipment = await Equipment.create({ name: 'Sample Equipment', category: 'General', serialNumber: 'TEST-001' });
    }

    let team = await MaintenanceTeam.findOne();
    if (!team) {
      team = await MaintenanceTeam.create({ teamName: 'Sample Team', teamMembers: [user._id] });
    }

    const events = await MaintenanceRequest.insertMany([
      { subject: 'HVAC Maintenance', createdBy: user._id, equipment: equipment._id, team: team._id, technician: user._id, scheduledDate: new Date(), priority: 'Medium', status: 'In Progress' }
    ]);

    res.status(201).json({ message: 'Sample events created', events });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/* ======================================================
   EXPORTS
====================================================== */
module.exports = {
  getCalendarEvents,
  getDashboardData,
  getMaintenanceTrends,
  createSampleEvents
};