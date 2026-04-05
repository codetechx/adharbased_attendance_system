# AMS — Workforce & Labor Attendance Management System

Enterprise-grade multi-company, multi-vendor labor registration and fingerprint attendance system.

## Architecture

```
attendance_system/
├── docker-compose.yml          # All services
├── init.sh                     # One-time setup script
├── .env.example                # Copy to .env before starting
│
├── nginx/                      # Reverse proxy config
├── docker/mysql/               # MySQL init SQL
│
├── backend/                    # Laravel 11 (PHP 8.3 + FPM)
│   ├── app/
│   │   ├── Http/Controllers/   # API controllers
│   │   ├── Models/             # Eloquent models
│   │   └── Services/           # Business logic
│   ├── database/migrations/    # All schema migrations
│   └── routes/api.php          # API routes
│
├── frontend/                   # React 18 + Vite + Tailwind
│   └── src/
│       ├── pages/              # Full page components
│       └── components/         # Shared UI components
│
├── pdf-service/                # Python FastAPI — Aadhaar PDF extraction
│   └── aadhaar_parser.py       # PDF text + photo extraction
│
└── biometric-agent/            # Node.js local Windows service
    ├── server.js               # WebSocket server
    └── secugen-bridge.js       # SecuGen SGFPLIB.dll FFI bridge
```

## Quick Start

### Prerequisites
- Docker Desktop running
- Git Bash or WSL (for running init.sh on Windows)

### 1. Setup
```bash
cp .env.example .env
# Edit .env if needed (default values work for local dev)
bash init.sh
```

### 2. Access
| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost/api |
| PDF Service | http://localhost:8001 |

### Default Credentials
| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@ams.local | Admin@12345 |
| Company Admin | company@ams.local | Admin@12345 |
| Gate User | gate@ams.local | Admin@12345 |
| Vendor Admin | vendor@ams.local | Admin@12345 |

## Core Business Flow

```
Super Admin creates Company + Vendor
       ↓
Vendor requests access to Company
       ↓
Company Admin approves Vendor
       ↓
Vendor registers Workers (with Aadhaar PDF + Fingerprint)
       ↓
Vendor assigns Workers to Company for a date
       ↓
Company Gate marks IN/OUT using fingerprint
```

## Aadhaar Integration

The system integrates with UIDAI's official portal:
1. Vendor clicks "Open UIDAI" → opens `https://myaadhaar.uidai.gov.in/genricDownloadAadhaar/en`
2. Worker completes OTP on UIDAI site
3. Vendor downloads and uploads the PDF to AMS
4. Python PDF service extracts: name, DOB, gender, address, photo, PIN
5. Form auto-fills; vendor reviews and saves

**Password**: UIDAI PDFs use DOB as password (format: DDMMYYYY, e.g., 15081990)

## Fingerprint Integration (SecuGen)

### Development Mode
The biometric agent runs in **simulation mode** automatically when no device is connected.

### Production Setup
1. Install [SecuGen FDx SDK](https://secugen.com/download-sdk/) on Windows
2. Plug in SecuGen device (Hamster Pro, etc.)
3. Start the agent:
   ```bash
   cd biometric-agent
   npm install
   npm start
   ```
4. The frontend connects via WebSocket at `ws://localhost:12345`

### Server-side Matching
`backend/app/Services/BiometricService.php` handles template comparison.
Replace `developmentMatcher()` with SecuGen server SDK or NIST NBIS for production.

## Docker Services

| Container | Purpose | Port |
|-----------|---------|------|
| ams_nginx | Reverse proxy | 80 |
| ams_backend | Laravel PHP-FPM | 9000 (internal) |
| ams_frontend | React/Vite dev server | 5173 |
| ams_mysql | MySQL 8 | 3306 |
| ams_redis | Redis cache/queue | 6379 |
| ams_pdf_service | Python Aadhaar extractor | 8001 |
| ams_queue | Laravel queue worker | — |

## Roles

| Role | Permissions |
|------|------------|
| super_admin | Full access, manage companies/vendors/users |
| company_admin | Manage own company's vendors, workers, attendance |
| company_gate | Mark attendance only |
| vendor_admin | Register/manage workers, assignments |
| vendor_operator | Register workers |

## Key API Endpoints

```
POST /api/auth/login                    Login
GET  /api/dashboard/stats               Role-specific stats

POST /api/companies                     Create company
GET  /api/companies/{id}/vendors        Get vendor list with status
POST /api/companies/{id}/vendors/{vid}/approve  Approve vendor

POST /api/vendors/{id}/request-company/{cid}    Request company access

POST /api/workers                       Register worker
POST /api/workers/{id}/fingerprint      Enroll fingerprint
POST /api/aadhaar/extract               Extract PDF data
POST /api/aadhaar/upload/{worker}       Store Aadhaar PDF

POST /api/assignments                   Assign worker to company

POST /api/attendance/verify             Fingerprint identify
POST /api/attendance/mark               Mark IN/OUT
GET  /api/attendance/exceptions         Missing OUT report
```

## Security

- **Sanctum** token authentication (7-day expiry)
- **Role-based access** at every endpoint
- **Aadhaar number** stored masked (last 4 digits only)
- **Fingerprint templates** stored AES-encrypted
- **Aadhaar PDFs** stored on private disk (not web-accessible)
- **Audit log** for every sensitive action
- **HTTPS** recommended in production (add SSL cert to nginx)

## Production Deployment

1. Set `APP_ENV=production`, `APP_DEBUG=false`
2. Generate secure `APP_KEY`: `php artisan key:generate`
3. Use strong DB/Redis passwords
4. Add SSL certificates to nginx
5. Use S3 for file storage (`FILESYSTEM_DISK=s3`)
6. Enable Laravel Horizon for queue monitoring
7. Run fingerprint matching via real SecuGen server SDK
