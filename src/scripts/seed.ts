import mongoose, { Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { ENV } from '../config/env';
import { User } from '../models/User.model';
import { Dealership } from '../models/Dealership.model';
import { Report } from '../models/Report.model';
import { ReportRecord } from '../models/ReportRecord.model';
import { ColumnMapping } from '../models/ColumnMapping.model';
import { Template } from '../models/Template.model';
import { Campaign } from '../models/Campaign.model';
import { AuditLog } from '../models/AuditLog.model';

async function seed() {
  console.log('[Seed] Connecting to MongoDB Atlas...');
  await mongoose.connect(ENV.MONGODB_URI);
  console.log('[Seed] Connected.');

  // Clean existing collections (optional/safe upsert)
  console.log('[Seed] Seeding Dealerships...');
  let hyundai = await Dealership.findOne({ code: 'SMH-01' });
  if (!hyundai) {
    hyundai = await Dealership.create({
      name: 'South Morang Hyundai',
      code: 'SMH-01',
      timezone: 'Australia/Melbourne',
      status: 'ACTIVE',
      settings: {
        autoDetectHeaders: true,
        defaultReportType: 'DealerSocket Closed RO',
        duplicateDetectionKeys: ['externalEntityId', 'eventNumber'],
      },
    });
  }

  // Remove any non-Hyundai dealerships to keep only South Morang Hyundai
  await Dealership.deleteMany({ code: { $ne: 'SMH-01' } });

  console.log('[Seed] Seeding Users with single ADMIN role and South Morang Hyundai...');
  const salt = await bcrypt.genSalt(10);
  const devsPasswordHash = await bcrypt.hash('Devs@123456', salt);
  const adminPasswordHash = await bcrypt.hash('Admin@123456', salt);

  let devUser = await User.findOne({ email: 'devs@neximet.com' });
  if (!devUser) {
    devUser = await User.create({
      name: 'Devs',
      email: 'devs@neximet.com',
      passwordHash: devsPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      dealershipIds: [hyundai._id],
    });
  } else {
    devUser.name = 'Devs';
    devUser.passwordHash = devsPasswordHash;
    devUser.role = 'ADMIN';
    devUser.dealershipIds = [hyundai._id];
    await devUser.save();
  }

  let admin = await User.findOne({ email: 'admin@dealersocket.com' });
  if (!admin) {
    admin = await User.create({
      name: 'Sarah Jenkins',
      email: 'admin@dealersocket.com',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      dealershipIds: [hyundai._id],
    });
  } else {
    admin.role = 'ADMIN';
    admin.dealershipIds = [hyundai._id];
    await admin.save();
  }

  // Ensure all existing users in the system have the single ADMIN role
  await User.updateMany({}, { role: 'ADMIN' });

  console.log('[Seed] Seeding Default Column Mappings for South Morang Hyundai...');
  const defaultMappings = [
    { sourceColumn: 'Entity ID', targetField: 'externalEntityId', dataType: 'string', transformation: 'none' },
    { sourceColumn: 'Customer Name', targetField: 'customerName', dataType: 'string', transformation: 'trim' },
    { sourceColumn: 'N/U', targetField: 'nOrU', dataType: 'string', transformation: 'uppercase' },
    { sourceColumn: 'Year', targetField: 'vehicle.year', dataType: 'number', transformation: 'none' },
    { sourceColumn: 'Make/Model', targetField: 'vehicle.model', dataType: 'string', transformation: 'trim' },
    { sourceColumn: 'Campaign', targetField: 'campaignName', dataType: 'string', transformation: 'trim' },
    { sourceColumn: 'Insert', targetField: 'campaignInsertDate', dataType: 'date', transformation: 'parse_date' },
    { sourceColumn: 'Event#', targetField: 'eventNumber', dataType: 'string', transformation: 'none' },
    { sourceColumn: 'Close Date', targetField: 'closeDate', dataType: 'date', transformation: 'parse_date' },
    { sourceColumn: 'RO Amount', targetField: 'roAmount', dataType: 'currency', transformation: 'parse_currency' },
  ];

  for (const m of defaultMappings) {
    await ColumnMapping.findOneAndUpdate(
      { dealershipId: hyundai._id, sourceColumn: m.sourceColumn },
      {
        ...m,
        dealershipId: hyundai._id,
        createdBy: admin._id,
      },
      { upsert: true }
    );
  }

  console.log('[Seed] Seeding Default PDF & Campaign Templates...');
  await Template.findOneAndUpdate(
    { dealershipId: hyundai._id, name: 'Executive Closed RO PDF Template' },
    {
      dealershipId: hyundai._id,
      name: 'Executive Closed RO PDF Template',
      type: 'PDF',
      pdfSettings: {
        reportTitle: 'Campaign Summary',
        subtitle: 'Service Detail',
        headerDealershipName: 'South Morang Hyundai',
        campaignLabel: 'HY Closed RO',
        dateRangeText: '9/28/2026 - 10/5/2026',
        primaryColor: '#0f172a',
        showSummaryMetrics: true,
        columns: [
          { field: 'externalEntityId', label: 'Entity ID', visible: true },
          { field: 'customerName', label: 'Customer Name', visible: true },
          { field: 'vehicle.year', label: 'Year', visible: true },
          { field: 'vehicle.model', label: 'Make/Model', visible: true },
          { field: 'campaignName', label: 'Campaign', visible: true },
          { field: 'eventNumber', label: 'Event#', visible: true },
          { field: 'closeDate', label: 'Close Date', visible: true },
          { field: 'roAmount', label: 'RO Amount', visible: true },
        ],
        footerNotes: 'DealerSocket Operations Hub - Confidential Dealership Operations Report',
      },
      createdBy: admin._id,
    },
    { upsert: true }
  );

  await Template.findOneAndUpdate(
    { dealershipId: hyundai._id, name: 'Closed RO Follow-Up SMS' },
    {
      dealershipId: hyundai._id,
      name: 'Closed RO Follow-Up SMS',
      type: 'SMS',
      smsBody: 'Hi {{customerName}}, thank you for servicing your {{vehicleYear}} {{vehicleModel}} with South Morang Hyundai. Your RO amount was {{roAmount}}. We hope everything went smoothly!',
      createdBy: admin._id,
    },
    { upsert: true }
  );

  console.log('[Seed] Seeding Demo Campaign Workflow...');
  await Campaign.findOneAndUpdate(
    { dealershipId: hyundai._id, name: 'HY Closed RO 14-Day Nurture' },
    {
      dealershipId: hyundai._id,
      name: 'HY Closed RO 14-Day Nurture',
      description: 'Automated follow-up sequence triggered upon DealerSocket Closed RO import',
      triggerType: 'CLOSED_RO',
      status: 'ACTIVE',
      steps: [
        { stepNumber: 1, channel: 'SMS', delayDays: 1, description: 'Day 1 Post-Service Satisfaction Check' },
        { stepNumber: 2, channel: 'EMAIL', delayDays: 3, description: 'Day 3 Service Inspection Summary & Survey' },
        { stepNumber: 3, channel: 'SMS', delayDays: 7, description: 'Day 7 Complimentary Car Wash Reminder' },
        { stepNumber: 4, channel: 'VA_TASK', delayDays: 12, description: 'Day 12 Virtual Assistant Phone Follow-up' },
      ],
      createdBy: admin._id,
    },
    { upsert: true }
  );

  console.log('[Seed] Seeding Reference Report (South Morang Hyundai HY Closed RO - 119 records)...');
  let demoReport = await Report.findOne({
    dealershipId: hyundai._id,
    name: 'South Morang Hyundai HY Closed RO',
  });

  if (!demoReport) {
    demoReport = await Report.create({
      dealershipId: hyundai._id,
      uploadedBy: admin._id,
      name: 'South Morang Hyundai HY Closed RO',
      sourceFileName: 'South_Morang_Hyundai_Closed_RO_119.pdf',
      sourceFileType: 'pdf',
      sourceFileSize: 245760,
      campaignName: 'HY Closed RO',
      reportType: 'DealerSocket Closed RO',
      reportDateFrom: new Date('2026-09-28'),
      reportDateTo: new Date('2026-10-05'),
      recordCount: 119,
      status: 'IMPORTED',
      version: 1,
      columnMappings: defaultMappings,
      originalHeaders: [
        'Entity ID',
        'Customer Name',
        'N/U',
        'Year',
        'Make/Model',
        'Campaign',
        'Insert',
        'Event#',
        'Close Date',
        'RO Amount',
      ],
      normalizedHeaders: defaultMappings.map((m) => m.targetField),
    });

    // Generate 119 realistic fictional records
    const firstNames = [
      'Liam', 'Olivia', 'Noah', 'Emma', 'Oliver', 'Charlotte', 'Elijah', 'Amelia',
      'James', 'Ava', 'William', 'Sophia', 'Benjamin', 'Isabella', 'Lucas', 'Mia',
      'Henry', 'Evelyn', 'Alexander', 'Harper', 'Sebastian', 'Luna', 'Jack', 'Camila',
      'Owen', 'Gianna', 'Daniel', 'Elizabeth', 'Matthew', 'Eleanor', 'Samuel', 'Ella'
    ];
    const lastNames = [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
      'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
      'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
      'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker'
    ];
    const models = [
      'Hyundai Tucson', 'Hyundai Santa Fe', 'Hyundai Kona', 'Hyundai i30',
      'Hyundai Palisade', 'Hyundai Venue', 'Hyundai Sonata', 'Hyundai Elantra',
      'Hyundai IONIQ 5', 'Hyundai IONIQ 6'
    ];

    const records = [];
    for (let i = 1; i <= 119; i++) {
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[(i * 3) % lastNames.length];
      const customerName = `${fn} ${ln}`;
      const year = 2018 + (i % 7);
      const model = models[i % models.length];
      const entityId = `E${10400 + i}`;
      const eventNumber = `EV-${89000 + i}`;
      const roAmount = parseFloat((120 + ((i * 37) % 850) + 0.45).toFixed(2));
      const closeDay = 28 + (i % 7);
      const closeDateStr = closeDay <= 30 ? `2026-09-${closeDay}` : `2026-10-0${closeDay - 30}`;

      const rawRow = {
        'Entity ID': entityId,
        'Customer Name': customerName,
        'N/U': i % 3 === 0 ? 'N' : 'U',
        'Year': String(year),
        'Make/Model': model,
        'Campaign': 'HY Closed RO',
        'Insert': '2026-09-28',
        'Event#': eventNumber,
        'Close Date': closeDateStr,
        'RO Amount': `$${roAmount.toFixed(2)}`,
      };

      records.push({
        reportId: demoReport._id,
        dealershipId: hyundai._id,
        externalEntityId: entityId,
        customerName,
        vehicle: {
          year,
          make: 'Hyundai',
          model,
        },
        campaignName: 'HY Closed RO',
        campaignInsertDate: new Date('2026-09-28'),
        eventNumber,
        closeDate: new Date(closeDateStr),
        roAmount,
        recordStatus: i === 12 ? 'WARNING' : 'VALID',
        validationNotes: i === 12 ? ['Duplicate Entity ID detected in prior campaign'] : [],
        customFields: {
          nOrU: i % 3 === 0 ? 'N' : 'U',
        },
        sourceData: rawRow,
        lastEditedBy: admin._id,
      });
    }

    await ReportRecord.insertMany(records);
    console.log(`[Seed] Inserted 119 records for report ${demoReport.name}`);

    await AuditLog.create({
      dealershipId: hyundai._id,
      userId: admin._id,
      entityType: 'Report',
      entityId: demoReport._id,
      action: 'REPORT_UPLOADED',
      after: { name: demoReport.name, recordCount: 119 },
    });
  }

  console.log('[Seed] Database successfully seeded with full production test dataset!');
  console.log('----------------------------------------------------');
  console.log('Login credentials (Single Role: ADMIN):');
  console.log('DEVS:    devs@neximet.com         / Devs@123456');
  console.log('ADMIN:   admin@dealersocket.com   / Admin@123456');
  console.log('----------------------------------------------------');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[Seed] Error during seeding:', err);
  process.exit(1);
});
