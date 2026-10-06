import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

const samplesDir = path.resolve(__dirname, '../../samples');
if (!fs.existsSync(samplesDir)) {
  fs.mkdirSync(samplesDir, { recursive: true });
}

const mockRecords = [
  { entityId: 'E10481', customer: 'Liam Smith', nu: 'U', year: '2021', makeModel: 'Hyundai Tucson', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89012', closeDate: '9/29/2026', roAmount: 384.50 },
  { entityId: 'E10482', customer: 'Olivia Brown', nu: 'N', year: '2023', makeModel: 'Hyundai Santa Fe', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89013', closeDate: '9/29/2026', roAmount: 512.00 },
  { entityId: 'E10483', customer: 'Noah Davis', nu: 'U', year: '2019', makeModel: 'Hyundai i30', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89014', closeDate: '9/30/2026', roAmount: 245.20 },
  { entityId: 'E10484', customer: 'Emma Wilson', nu: 'U', year: '2020', makeModel: 'Hyundai Kona', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89015', closeDate: '9/30/2026', roAmount: 430.75 },
  { entityId: 'E10485', customer: 'Oliver Taylor', nu: 'N', year: '2024', makeModel: 'Hyundai Palisade', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89016', closeDate: '10/1/2026', roAmount: 890.00 },
  { entityId: 'E10486', customer: 'Charlotte Anderson', nu: 'U', year: '2018', makeModel: 'Hyundai Venue', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89017', closeDate: '10/1/2026', roAmount: 195.40 },
  { entityId: 'E10487', customer: 'James Thomas', nu: 'U', year: '2022', makeModel: 'Hyundai IONIQ 5', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89018', closeDate: '10/2/2026', roAmount: 310.00 },
  { entityId: 'E10488', customer: 'Amelia Jackson', nu: 'N', year: '2023', makeModel: 'Hyundai Tucson', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89019', closeDate: '10/2/2026', roAmount: 625.50 },
  { entityId: 'E10489', customer: 'Lucas White', nu: 'U', year: '2021', makeModel: 'Hyundai Santa Fe', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89020', closeDate: '10/3/2026', roAmount: 480.00 },
  { entityId: 'E10490', customer: 'Mia Martin', nu: 'U', year: '2020', makeModel: 'Hyundai Kona EV', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89021', closeDate: '10/3/2026', roAmount: 275.90 },
  { entityId: 'E10491', customer: 'Henry Harris', nu: 'N', year: '2024', makeModel: 'Hyundai Sonata', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89022', closeDate: '10/4/2026', roAmount: 540.30 },
  { entityId: 'E10492', customer: 'Evelyn Clark', nu: 'U', year: '2019', makeModel: 'Hyundai i30 N', campaign: 'HY Closed RO', insert: '9/28/2026', event: 'EV-89023', closeDate: '10/5/2026', roAmount: 720.00 },
];

// 1. Generate CSV
function generateCsv() {
  const headers = ['Entity ID', 'Customer Name', 'N/U', 'Year', 'Make/Model', 'Campaign', 'Insert', 'Event#', 'Close Date', 'RO Amount'];
  const lines = [headers.join(',')];
  for (const r of mockRecords) {
    lines.push([
      r.entityId,
      `"${r.customer}"`,
      r.nu,
      r.year,
      `"${r.makeModel}"`,
      `"${r.campaign}"`,
      r.insert,
      r.event,
      r.closeDate,
      `$${r.roAmount.toFixed(2)}`,
    ].join(','));
  }
  const csvPath = path.join(samplesDir, 'South_Morang_Hyundai_Closed_RO.csv');
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf-8');
  console.log(`[Samples] Created ${csvPath}`);
}

// 2. Generate XLSX
function generateXlsx() {
  const rows = mockRecords.map((r) => ({
    'Entity ID': r.entityId,
    'Customer Name': r.customer,
    'N/U': r.nu,
    'Year': Number(r.year),
    'Make/Model': r.makeModel,
    'Campaign': r.campaign,
    'Insert': r.insert,
    'Event#': r.event,
    'Close Date': r.closeDate,
    'RO Amount': r.roAmount,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Closed RO Summary');
  const xlsxPath = path.join(samplesDir, 'South_Morang_Hyundai_Closed_RO.xlsx');
  XLSX.writeFile(wb, xlsxPath);
  console.log(`[Samples] Created ${xlsxPath}`);
}

// 3. Generate PDF matching DealerSocket layout
function generatePdf(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pdfPath = path.join(samplesDir, 'South_Morang_Hyundai_Closed_RO.pdf');
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Top header matching DealerSocket reference:
    doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text('Campaign Summary', 40, 40);
    doc.fillColor('#64748b').fontSize(11).font('Helvetica').text('Service Detail', 40, 60);

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#334155').text('Report:', 300, 40);
    doc.font('Helvetica').fillColor('#0f172a').text('South Morang Hyundai', 350, 40);

    doc.font('Helvetica-Bold').fillColor('#334155').text('Campaign Name:', 300, 56);
    doc.font('Helvetica').fillColor('#0f172a').text('HY Closed RO', 400, 56);

    doc.font('Helvetica-Bold').fillColor('#334155').text('Report Date:', 560, 40);
    doc.font('Helvetica').fillColor('#0f172a').text('9/28/2026 - 10/5/2026', 640, 40);

    doc.font('Helvetica-Bold').fillColor('#334155').text('Record Count:', 560, 56);
    doc.font('Helvetica-Bold').fillColor('#2563eb').text('119', 640, 56);

    // Column Headers line
    const headers = ['Entity ID', 'Customer Name', 'N/U', 'Year', 'Make/Model', 'Campaign', 'Insert', 'Event#', 'Close Date', 'RO Amount'];
    const colWidths = [65, 110, 35, 45, 115, 95, 75, 75, 75, 75];
    let curY = 95;

    doc.rect(36, curY, 765, 20).fill('#0f172a');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');

    let curX = 40;
    headers.forEach((h, i) => {
      doc.text(h, curX, curY + 6, { width: colWidths[i], ellipsis: true });
      curX += colWidths[i];
    });

    curY += 22;
    doc.font('Helvetica').fontSize(8).fillColor('#1e293b');

    for (let i = 0; i < mockRecords.length; i++) {
      const r = mockRecords[i];
      if (i % 2 === 1) {
        doc.rect(36, curY - 2, 765, 18).fill('#f8fafc');
      }
      doc.fillColor('#1e293b');

      let x = 40;
      const values = [
        r.entityId,
        r.customer,
        r.nu,
        r.year,
        r.makeModel,
        r.campaign,
        r.insert,
        r.event,
        r.closeDate,
        `$${r.roAmount.toFixed(2)}`,
      ];

      values.forEach((v, idx) => {
        doc.text(v, x, curY + 3, { width: colWidths[idx], ellipsis: true });
        x += colWidths[idx];
      });

      curY += 18;
    }

    doc.fontSize(8).fillColor('#94a3b8').text('DealerSocket Operational Data Ingestion | South Morang Hyundai', 40, 550);

    doc.end();
    stream.on('finish', () => {
      console.log(`[Samples] Created ${pdfPath}`);
      resolve();
    });
    stream.on('error', reject);
  });
}

async function main() {
  generateCsv();
  generateXlsx();
  await generatePdf();
}

main().catch(console.error);
