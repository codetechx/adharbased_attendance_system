# AMS — Workforce & Labor Attendance Management System

Enterprise-grade multi-company, multi-vendor labor registration and biometric attendance system built on Laravel + React.

---

## Architecture

```
attendance_system/
├── docker-compose.yml          # All services wired together
├── init.sh                     # One-time setup script
├── .env.example                # Copy to .env before starting
│
├── nginx/                      # Reverse proxy config
├── docker/mysql/               # MySQL init SQL + seed
│
├── backend/                    # Laravel 11 (PHP 8.3 + FPM)
│   ├── app/Http/Controllers/   # API controllers (per resource)
│   ├── app/Models/             # Eloquent models
│   ├── app/Services/           # AuditService, BiometricService
│   ├── database/migrations/    # Full schema history
│   └── routes/api.php          # All API routes
│
├── frontend/                   # React 18 + Vite + Tailwind CSS
│   └── src/
│       ├── pages/              # Route-level components
│       │   ├── companies/      # CompanyList
│       │   ├── vendors/        # VendorList, VendorApproval, VendorCompanyAccess
│       │   ├── workers/        # WorkerList, WorkerRegister
│       │   ├── users/          # UserList (gate user management)
│       │   └── attendance/     # AttendanceMark, AttendanceList, Exceptions
│       └── components/         # Sidebar, FingerprintCapture, etc.
│
├── pdf-service/                # Python FastAPI — Aadhaar PDF extraction
│   └── main.py                 # PDF text + photo extraction via pdfplumber
│
└── biometric-agent/            # Local Windows fingerprint bridge
    ├── sgibiosrv_proxy.py      # HTTP proxy → SGIBIOSRV (https://localhost:8443)
    └── winbio_server.py        # Alternative: Windows Biometric Framework (WBF)
```

---

## Quick Start

### Prerequisites
- Docker Desktop (Windows / Mac / Linux)
- Git Bash or WSL (Windows users)

### 1. First-time setup
```bash
cp .env.example .env
bash init.sh
```

### 2. Start / Stop
```bash
# Start all services
start.bat          # Windows
docker compose up -d   # Any OS

# Stop
down.bat
```

### 3. Access the application

| Service    | URL                      |
|------------|--------------------------|
| App (UI)   | http://localhost          |
| API        | http://localhost/api      |
| PDF Service | http://localhost:8001    |

### Default Login Credentials

| Role          | Email                  | Password     |
|---------------|------------------------|--------------|
| Super Admin   | superadmin@ams.local   | Admin@12345  |
| Company Admin | company@ams.local      | Admin@12345  |
| Gate User     | gate@ams.local         | Admin@12345  |
| Vendor Admin  | vendor@ams.local       | Admin@12345  |

---

## Core Business Flow

```
Super Admin
  ├── Creates Company  (with optional company_admin login)
  └── Creates Vendor   (with optional vendor_admin login)
          │
          ▼
Vendor Admin
  └── Sends access request to Company
          │
          ▼
Company Admin
  └── Approves the Vendor
          │
          ▼
Vendor Admin / Operator
  └── Registers Workers
        ├── Uploads Aadhaar PDF (auto-extracted)
        └── Enrolls Fingerprint (via SecuGen scanner)
          │
          ▼
Company Admin
  └── Creates Gate Users (one per entry point)
          │
          ▼
Gate User (at company site)
  └── Marks IN / OUT via fingerprint scan
        → Attendance logged against: Worker ↔ Vendor ↔ Company
          │
          ▼
Vendor Admin can view all attendance for their workers across companies
Company Admin / Gate can view all attendance at their company
```

---

## Roles & Permissions

| Role             | What they can do                                                              |
|------------------|-------------------------------------------------------------------------------|
| `super_admin`    | Full access — create companies, vendors, all users, view everything           |
| `company_admin`  | Approve/reject vendors, create gate users, view attendance at their company   |
| `company_gate`   | Mark fingerprint attendance at their company only                             |
| `vendor_admin`   | Register/manage workers, request company access, view worker attendance       |
| `vendor_operator`| Register workers only                                                         |

---

## Aadhaar Integration

The system integrates with UIDAI's official masked Aadhaar PDF:

1. On Worker Register page, click **Open UIDAI Portal**
2. Worker logs in on UIDAI site, completes OTP, downloads masked Aadhaar PDF
3. Vendor uploads the PDF to AMS
4. Python service (`pdf-service`) extracts: name, DOB, gender, address, PIN, and photo
5. Form auto-fills; vendor reviews and saves

**PDF Password format:** first 4 letters of name (uppercase) + birth year
Example: Name "Narendra", Born 1955 → password `NARE1955`

---

## Fingerprint Integration (SecuGen SGIBIOSRV)

AMS uses SecuGen's **SGIBIOSRV** Windows service for fingerprint capture and 1:N matching.

### Gate PC Setup
1. Install SecuGen SGIBIOSRV (included in FDx SDK)
2. Connect SecuGen device (Hamster Pro, etc.)
3. Start the SGIBIOSRV service
4. On first use, open `https://localhost:8443` in browser and accept the certificate

### How matching works
```
Gate PC Browser
  → POST https://localhost:8443/SGIFPCapture   (capture live fingerprint)
  → GET  /api/attendance/worker-templates      (fetch all enrolled templates for approved vendors)
  → POST https://localhost:8443/SGIMatchScore  (1:N match in parallel, per worker)
  → Best match above score 40/200 → confirm → POST /api/attendance/mark
```

---

## Vendor–Company Approval Flow

```
Vendor Admin                   Company Admin
     │                               │
     │  (Company Access page)        │
     ├─── Send Request ──────────────►│
     │                               │  (Vendor Approvals page)
     │◄── Approved / Rejected ───────┤
     │                               │
     │  If Approved:                 │
     │  Workers' fingerprints are    │
     │  available at gate scanner    │
     │                               │
```

No manual worker-to-company assignment needed once the vendor is approved.

---

## Docker Services

| Container        | Purpose                    | Port           |
|------------------|----------------------------|----------------|
| `ams_nginx`      | Reverse proxy              | 80             |
| `ams_backend`    | Laravel PHP-FPM            | 9000 (internal)|
| `ams_frontend`   | React/Vite dev server      | 5173           |
| `ams_mysql`      | MySQL 8                    | 3306           |
| `ams_redis`      | Cache & queue broker       | 6379           |
| `ams_pdf_service`| Python Aadhaar extractor   | 8001           |
| `ams_queue`      | Laravel queue worker       | —              |

---

## Key API Endpoints

```
POST /api/auth/login                              Login (returns Sanctum token)
GET  /api/auth/me                                 Current user info

GET  /api/companies                               List companies
POST /api/companies                               Create company (super_admin)
POST /api/companies/{id}/vendors/{vid}/approve    Approve vendor
POST /api/companies/{id}/vendors/{vid}/reject     Reject vendor (requires reason)
POST /api/companies/{id}/vendors/{vid}/suspend    Suspend vendor

GET  /api/vendors                                 List vendors (scoped by role)
POST /api/vendors/{id}/request-company/{cid}      Vendor requests company access
GET  /api/vendors/{id}/available-companies        All companies + request status

POST /api/workers                                 Register worker
POST /api/workers/{id}/fingerprint               Enroll fingerprint
POST /api/aadhaar/extract                         Extract data from Aadhaar PDF
POST /api/aadhaar/upload/{worker}                 Upload Aadhaar PDF

GET  /api/users                                   List users (role-scoped)
POST /api/users                                   Create user

GET  /api/attendance/worker-templates             Fingerprint templates for approved vendors
POST /api/attendance/mark                         Mark IN/OUT
GET  /api/attendance                              Attendance log (role-scoped)
GET  /api/attendance/exceptions                   Workers with IN but no OUT
GET  /api/attendance/report                       Date-range report
```

---

## Security

- **Authentication:** Laravel Sanctum token (7-day expiry)
- **Authorization:** Role middleware on every route + controller-level scoping
- **Aadhaar:** Only last 4 digits stored in DB; full number never persisted
- **Fingerprint templates:** AES-encrypted at rest via Laravel `encrypt()`
- **Aadhaar PDFs:** Stored on private disk (not web-accessible), served via signed URL
- **Audit log:** Every sensitive action (worker created, fingerprint enrolled, attendance marked) logged with user ID, timestamp, and IP
- **HTTPS:** Required in production — add SSL certificate to nginx config

---

## Production Deployment Checklist

- [ ] Set `APP_ENV=production`, `APP_DEBUG=false` in `.env`
- [ ] Run `php artisan key:generate` for a unique `APP_KEY`
- [ ] Use strong passwords for DB, Redis, and all user accounts
- [ ] Add SSL certificates to `nginx/` config
- [ ] Switch file storage to S3: `FILESYSTEM_DISK=s3`
- [ ] Enable Laravel Horizon for queue monitoring
- [ ] Restrict DB port (3306) — do not expose publicly
- [ ] Set up automated MySQL backups
- [ ] Test fingerprint enrollment and matching end-to-end before go-live
