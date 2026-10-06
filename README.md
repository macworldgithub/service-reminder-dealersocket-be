# DealerSocket Operations Backend (NestJS)

NestJS enterprise backend service providing RESTful endpoints, file parsing, authentication, audit logging, and PDF streaming for the DealerSocket Campaign Report Management application.

---

## 🛠 Tech Stack & Architecture

- **NestJS 10**: Modular controller-service architecture with dependency injection
- **MongoDB Atlas / Mongoose ODM**: Fully typed schemas and multi-tenant scoping
- **Authentication**: Passport JWT strategy, bcryptjs password hashing, HTTP-only refresh cookies
- **File Parsers**:
  - `csv.parser.ts`: Fast CSV parser with delimiter sniffing
  - `xlsx.parser.ts`: Excel workbook sheet reader
  - `pdf.parser.ts`: DealerSocket PDF extractor with regex tokenization
- **PDF Generation**: PDFKit vector document renderer

---

## 📁 Module Breakdown

```
src/
├── app.module.ts            # Root module registering all controllers & Mongoose connection
├── main.ts                  # NestJS application bootstrap (port 5000, CORS, CookieParser)
├── models/                  # Mongoose Schema definitions
│   ├── User.ts
│   ├── Dealership.ts
│   ├── Report.ts
│   ├── ReportRecord.ts
│   ├── Import.ts
│   ├── ColumnMapping.ts
│   ├── AuditLog.ts
│   ├── Template.ts
│   └── Campaign.ts
├── modules/
│   ├── auth/                # Login, Register, Refresh Token, /me
│   ├── dealerships/         # Multi-tenant dealership scoping
│   ├── imports/             # 5-step file ingestion & mapping pipeline
│   ├── reports/             # Report CRUD, versioning, CSV/XLSX/PDF export
│   ├── records/             # Paginated data grid, search, filter, edit, batch updates
│   ├── mappings/            # Reusable column mapping profiles
│   ├── templates/           # PDF and multichannel reminder templates
│   ├── campaigns/           # Decoupled campaign engine architecture
│   ├── audit/               # Granular before/after state audit trails
│   └── users/               # User management (Admin)
├── parsers/                 # Specialized parser engines
│   ├── csv.parser.ts
│   ├── xlsx.parser.ts
│   ├── pdf.parser.ts
│   └── pdf.generator.ts
└── scripts/
    ├── seed.ts              # Database seeding script with realistic Hyundai dataset
    └── generateSamples.ts   # Synthetic DealerSocket sample generator (.csv, .xlsx, .pdf)
```

---

## 🏃 Running the Backend

```bash
# Install dependencies
npm install

# Run database seeder
npm run seed

# Start development server
npm run start:dev

# Build for production
npm run build
npm run start:prod
```

Default API endpoint: `http://localhost:7000/api`
Health check: `http://localhost:7000/api/health`
