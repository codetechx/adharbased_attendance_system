# AMS User Manual
## Workforce Attendance Management System

**Version:** 1.0  
**Audience:** Company Admins, Vendor Admins, Gate Users  

---

## Table of Contents

1. [What is AMS?](#1-what-is-ams)
2. [Who Uses AMS? (Roles Explained)](#2-who-uses-ams-roles-explained)
3. [How the System Works — Big Picture](#3-how-the-system-works--big-picture)
4. [Getting Started — Logging In](#4-getting-started--logging-in)
5. [Super Admin Guide](#5-super-admin-guide)
6. [Company Admin Guide](#6-company-admin-guide)
7. [Vendor Admin Guide](#7-vendor-admin-guide)
8. [Gate User Guide](#8-gate-user-guide)
9. [Onboarding Checklist](#9-onboarding-checklist)
10. [Frequently Asked Questions](#10-frequently-asked-questions)

---

## 1. What is AMS?

AMS (Attendance Management System) is a digital system that tracks **when contract workers arrive and leave** a company site — using **fingerprint scanning**, so there is no manual register or paper-based attendance.

### What problems it solves

| Old Way | With AMS |
|---------|----------|
| Paper register — can be faked | Fingerprint — cannot be faked |
| Manual data entry — errors | Auto-recorded with timestamp |
| No visibility for vendor | Vendor sees their workers' attendance live |
| Hard to audit | Full audit trail with every action logged |

---

## 2. Who Uses AMS? (Roles Explained)

AMS has four types of users. Each person sees only what is relevant to their job.

```
┌─────────────────────────────────────────────────────────────┐
│                        SUPER ADMIN                          │
│  (System owner — sets up everything once)                   │
│  Creates companies, vendors, and their login accounts        │
└───────────────────┬─────────────────────┬───────────────────┘
                    │                     │
          ┌─────────▼──────┐   ┌──────────▼─────────┐
          │  COMPANY ADMIN │   │   VENDOR ADMIN      │
          │                │   │                     │
          │ Approves which │   │ Registers workers   │
          │ vendors work   │   │ (Aadhaar + finger-  │
          │ at their site  │   │  print enrollment)  │
          │                │   │                     │
          │ Creates gate   │   │ Requests access to  │
          │ users          │   │ companies           │
          └───────┬────────┘   └─────────────────────┘
                  │
          ┌───────▼────────┐
          │   GATE USER    │
          │                │
          │ Scans finger-  │
          │ prints at site │
          │ entry/exit     │
          └────────────────┘
```

### Quick Reference

| Role | Who is this? | What they do |
|------|-------------|--------------|
| **Super Admin** | System owner / IT team | Creates companies and vendors, manages all accounts |
| **Company Admin** | HR Manager / Site Manager at the company | Approves vendors, creates gate users, views attendance |
| **Vendor Admin** | Contractor company manager | Registers workers, requests company access, views worker attendance |
| **Gate User** | Security guard / HR at the gate | Scans fingerprints to mark workers IN and OUT |

---

## 3. How the System Works — Big Picture

```
STEP 1: Super Admin creates Company & Vendor accounts
         ↓
STEP 2: Vendor Admin requests access to work at a Company
         ↓
STEP 3: Company Admin approves the Vendor
         ↓
STEP 4: Vendor Admin registers Workers
         (Aadhaar PDF upload + Fingerprint scan)
         ↓
STEP 5: Company Admin creates Gate User accounts
         ↓
STEP 6: Gate User scans fingerprints → Attendance marked automatically
         ↓
STEP 7: Vendor Admin & Company Admin view attendance reports
```

### Data Flow Diagram

```
  VENDOR SIDE                          COMPANY SIDE
  ───────────                          ────────────

  [Vendor Admin]                       [Company Admin]
       │                                     │
       │ Registers Workers                   │ Creates Gate Users
       │ (Aadhaar + Fingerprint)             │
       │                                     │
       │──── Sends Access Request ──────────►│
       │                                     │
       │◄─── Company Approves ───────────────│
       │                                     │
       │                                     │ [Gate User at Entry]
       │                                     │      │
       │                                     │      │ Worker places
       │                                     │      │ finger on scanner
       │                                     │      │
       │◄═══════ Attendance Recorded ════════════════╝
       │         (Worker + Vendor + Company + Time)
       │
       │ Views attendance report
       │ for all their workers
```

---

## 4. Getting Started — Logging In

### Step 1: Open the Application

Open your web browser (Chrome or Edge recommended) and go to:
```
http://[your-server-address]
```
Your IT team will provide the exact URL.

### Step 2: Login Screen

You will see a login screen. Enter your **email address** and **password** provided by the Super Admin.

```
┌─────────────────────────────────┐
│         AMS Login               │
│                                 │
│  Email: [________________]      │
│                                 │
│  Password: [_______________]    │
│                                 │
│  [      Sign In      ]          │
└─────────────────────────────────┘
```

### Step 3: Dashboard

After logging in, you will see the **Dashboard** with a summary of today's attendance and key numbers. The left sidebar shows the menu options available to your role.

> **Tip:** If you forget your password, contact your Super Admin. There is no self-service password reset.

---

## 5. Super Admin Guide

The Super Admin sets up the system for everyone. This is typically done once during initial setup.

### 5.1 Create a Company

**Where:** Sidebar → Administration → **Companies**

1. Click **Add Company**
2. Fill in the company details:
   - Company Name (e.g., "ABC Manufacturing Pvt Ltd")
   - Company Code (short code, e.g., "ABCM")
   - Address, City, State, PIN
   - Contact Person, Email, Phone
   - GST Number (optional)
3. Fill in **Company Admin Login** (the person who will manage this company in AMS):
   - Admin Name
   - Login Email
   - Password (click the refresh icon to auto-generate a strong password)
   - **Copy the password** before saving — it will not be shown again
4. Click **Create Company**

```
  Company Details Form
  ┌──────────────────────────────────────────────────────┐
  │ Company Name    [ABC Manufacturing Pvt Ltd        ]  │
  │ Company Code    [ABCM    ]                           │
  │ Address         [Plot 5, MIDC Industrial Area     ]  │
  │ City            [Pune    ]  State  [Maharashtra  ]   │
  │ PIN             [411019  ]                           │
  │ Contact Person  [Rajesh Sharma                    ]  │
  │ Contact Email   [rajesh@abcmfg.com               ]  │
  │ Contact Phone   [9876543210                       ]  │
  ├──────────────────────────────────────────────────────┤
  │ COMPANY ADMIN LOGIN (optional)                       │
  │ Admin Name   [Rajesh Sharma                      ]   │
  │ Login Email  [admin@abcmfg.com                   ]   │
  │ Password     [Xk7#mP2q  ] 👁  🔄  📋              │
  │              ⚠ Save this password — not shown again  │
  ├──────────────────────────────────────────────────────┤
  │ [Create Company]  [Cancel]                           │
  └──────────────────────────────────────────────────────┘
```

> **Share with Company Admin:** Send them their login email and password privately (WhatsApp, email). They will use these to log in and manage their company.

---

### 5.2 Create a Vendor

**Where:** Sidebar → Administration → **Vendors**

1. Click **Add Vendor**
2. Fill in vendor details:
   - Vendor Name (e.g., "XYZ Labour Contractors")
   - Vendor Code (e.g., "XYZLC")
   - Address, City, State, PIN
   - Contact Person, Email, Phone
3. Fill in **Vendor Admin Login**:
   - Admin Name
   - Login Email
   - Password (auto-generate and copy)
4. Click **Create Vendor**

> **Share with Vendor Admin:** Send them their login email and password. They will log in to register workers and request company access.

---

### 5.3 Manage All Users

**Where:** Sidebar → Administration → **Users**

The Users page lets Super Admin see and manage all accounts in the system — company admins, gate users, vendor admins, and vendor operators.

**To create a new user:**
1. Click **Add User**
2. Enter Name, Email, Password
3. Select Role
4. If role is Company Admin or Gate User → select the Company
5. If role is Vendor Admin or Vendor Operator → select the Vendor
6. Click **Create User**

---

### 5.4 Edit or Deactivate a Company / Vendor

**Where:** Companies list or Vendors list

Each card has a **⋮ (three-dot) menu** in the top-right corner:
- **Edit** — update company/vendor details
- **Deactivate / Activate** — disable login for the entire company or vendor

```
  ┌────────────────────────────────┐
  │ ABC Manufacturing Pvt Ltd  [⋮] │ ← click the 3 dots
  │ ABCM                           │
  │ Rajesh Sharma                  │    ┌─────────────┐
  │ rajesh@abcmfg.com              │    │ ✏ Edit      │
  │ Pune, Maharashtra              │    │ 🔴 Deactivate│
  │ ● active                       │    └─────────────┘
  └────────────────────────────────┘
```

---

## 6. Company Admin Guide

The Company Admin is responsible for:
- Approving which vendors can deploy workers at their site
- Creating gate user accounts for attendance marking
- Viewing attendance reports for their site

### 6.1 Approve a Vendor

When a vendor has requested access to work at your company, you will see their request in **Vendor Approvals**.

**Where:** Sidebar → Administration → **Vendor Approvals**

```
  Vendor Approvals
  ┌─────────────────────────────────────────────────────────┐
  │ [Pending ①] [Approved] [Rejected] [Suspended] [All]    │
  ├─────────────────────────────────────────────────────────┤
  │                                                         │
  │  XYZ Labour Contractors                   ● Pending    │
  │  Contact: Suresh Kumar · suresh@xyz.com                │
  │  Pune, Maharashtra                                      │
  │                                                         │
  │  [✓ Approve]  [Reason: _________________ ] [✗ Reject]  │
  └─────────────────────────────────────────────────────────┘
```

**To approve:**
1. Go to **Vendor Approvals** in the sidebar
2. Click the **Pending** tab to see new requests
3. Click **Approve** next to the vendor name

**Once approved:**
- The vendor's workers will be available for fingerprint attendance at your gate automatically
- You do **not** need to manually add or assign workers — approval covers all current and future workers registered under that vendor

**To reject:**
1. Type a reason in the text box next to the vendor
2. Click **Reject**
3. The vendor can see the reason and request again after addressing the issue

**To suspend (temporarily block):**
1. Click the **Approved** tab
2. Click **Suspend** next to the vendor

---

### 6.2 Create Gate Users

Gate users are the accounts used at your entry/exit points to mark attendance.

**Where:** Sidebar → Administration → **Gate Users**

1. Click **Add Gate User**
2. Fill in:
   - Full Name (e.g., "Security Gate 1" or "Ramesh Kumar")
   - Email (e.g., gate1@abcmfg.com)
   - Password — click 🔄 to auto-generate, 📋 to copy
   - Phone (optional)
3. Click **Create Gate User**

```
  Add Gate User
  ┌──────────────────────────────────┐
  │ Full Name  [Security Gate 1   ]  │
  │ Email      [gate1@abcmfg.com  ]  │
  │ Password   [Kp9#xM3r  ] 👁 🔄 📋 │
  │            ⚠ Copy before saving  │
  │ Phone      [9876540001        ]  │
  ├──────────────────────────────────┤
  │ [Create Gate User]  [Cancel]     │
  └──────────────────────────────────┘
```

> **One account per gate:** If you have multiple entry points (Main Gate, Back Gate), create one gate user per entry point so attendance shows which gate it was marked at.

> **Share credentials:** Give the gate user their email and password. They will log in from the PC/tablet at the gate.

---

### 6.3 View Attendance

**Where:** Sidebar → Attendance → **Attendance Log**

You can see all attendance records for workers at your company:
- Filter by date
- See who is IN vs OUT
- Check which vendor the worker belongs to

**Where:** Sidebar → Attendance → **Exceptions**

This shows workers who marked **IN but have not marked OUT** — useful for end-of-day checks.

---

## 7. Vendor Admin Guide

The Vendor Admin is responsible for:
- Requesting access to company sites
- Registering workers with their Aadhaar and fingerprint
- Viewing attendance reports for their workers

### 7.1 Request Access to a Company

Before your workers can mark attendance at a company, you must request access and wait for the company to approve you.

**Where:** Sidebar → Administration → **Company Access**

```
  Company Access
  ┌──────────────────────────────────────────────────────┐
  │ How it works:                                        │
  │ 1. Send request to company                          │
  │ 2. Company admin approves                           │
  │ 3. Your workers are automatically available at gate  │
  ├──────────────────────────────────────────────────────┤
  │  [Search companies...]                               │
  │                                                      │
  │  ABC Manufacturing Pvt Ltd          [No status]      │
  │  Pune, Maharashtra                                   │
  │  [→ Request Access]                                  │
  │                                                      │
  │  DEF Textiles Ltd                   ● Approved       │
  │  Access active since 01-Jan-2025                     │
  │                                                      │
  │  GHI Chemicals                      ⏳ Pending        │
  │  Waiting for company admin to review                 │
  └──────────────────────────────────────────────────────┘
```

**To send a request:**
1. Go to **Company Access** in the sidebar
2. Find the company you want to work with
3. Click **Request Access**
4. Your request is sent. Wait for the company to approve (you will see status change to Approved)

**Request statuses:**

| Status | Meaning | What to do |
|--------|---------|------------|
| No status | Not yet requested | Click Request Access |
| Pending | Request sent, waiting | Wait for company admin |
| Approved | Access granted | Workers can now attend |
| Rejected | Rejected with reason | Read reason, fix issue, re-request |
| Suspended | Temporarily blocked | Contact the company |

---

### 7.2 Register a Worker

Workers must be registered before they can use the fingerprint scanner. Registration requires:
1. **Aadhaar details** (via PDF upload)
2. **Fingerprint scan** (via SecuGen scanner connected to your PC)

**Where:** Sidebar → Workers → **Register Worker**

#### Step 1 — Aadhaar Details

```
  Worker Registration — Step 1 of 4: Aadhaar
  ┌──────────────────────────────────────────────┐
  │  📄 Upload Aadhaar PDF                       │
  │                                              │
  │  1. Click "Open UIDAI Portal"               │
  │  2. Worker logs in with their Aadhaar number │
  │  3. Download the masked Aadhaar PDF          │
  │  4. Upload the PDF here                      │
  │                                              │
  │  PDF Password: First 4 letters of name       │
  │  + birth year (e.g. NARE1955)                │
  │                                              │
  │  [Open UIDAI Portal]  [Upload PDF]           │
  └──────────────────────────────────────────────┘
```

> **UIDAI Portal:** This is the government website. The worker needs their Aadhaar number and registered mobile number for OTP.

After uploading, the form auto-fills with the worker's details from the PDF.

#### Step 2 — Review Worker Details

Check the auto-filled information:
- Name, Date of Birth, Gender
- Address, City, State, PIN

Make any corrections if needed. Click **Next**.

#### Step 3 — Fingerprint Enrollment

```
  Worker Registration — Step 3 of 4: Fingerprint
  ┌──────────────────────────────────────────────┐
  │                                              │
  │      [Fingerprint icon — pulsing]            │
  │                                              │
  │  Ask the worker to place their right index   │
  │  finger firmly on the scanner                │
  │                                              │
  │  [Scan Fingerprint]    [Skip for now]        │
  └──────────────────────────────────────────────┘
```

1. Connect the SecuGen fingerprint scanner to the PC
2. Ask the worker to place their **right index finger** on the scanner
3. Click **Scan Fingerprint**
4. The light on the scanner will blink — keep the finger pressed for 2 seconds
5. If successful, you will see a green checkmark
6. Repeat if the scan fails (clean the sensor, press firmer)

> **Tip:** If the scanner is not available today, click **Skip for now**. You can enroll the fingerprint later from the Workers list. The worker will be marked as "Pending" until fingerprint is enrolled.

#### Step 4 — Confirm & Save

Review all details and click **Register Worker**. The worker is now registered and ready to use the fingerprint attendance system once your company access is approved.

---

### 7.3 View Your Workers

**Where:** Sidebar → Workers → **All Workers**

You can see all workers registered under your vendor, their status, and fingerprint enrollment status.

| Worker Status | Meaning |
|--------------|---------|
| Pending | Registered but fingerprint not yet enrolled |
| Active | Fully registered — can mark attendance |
| Inactive | Disabled — cannot mark attendance |

---

### 7.4 View Attendance

**Where:** Sidebar → Attendance → **Attendance Log**

You can see attendance for all your workers across all companies that have approved you. The log shows:
- Worker name
- Company where attendance was marked
- Time of IN / OUT
- Gate name

---

## 8. Gate User Guide

The Gate User's job is simple: **scan fingerprints** as workers enter and exit.

### 8.1 Setup — First Time Only (Per PC)

The fingerprint scanner connects directly from the gate PC. Before using:

1. Make sure the **SecuGen fingerprint scanner** is plugged into the USB port
2. Open the browser and go to `https://localhost:8443`
3. You will see a security warning — click **Advanced** → **Proceed to localhost**

```
  ⚠ Your connection is not private
  
  Attackers might be trying to...
  
  [Back to safety]      Advanced ▼
  ─────────────────────────────────
  → Proceed to localhost (unsafe)
```

> This is a one-time step per PC. It allows the browser to talk to the fingerprint scanner.

---

### 8.2 Mark Attendance — Daily Use

**Where:** Sidebar → Attendance → **Mark Attendance**

```
  Mark Attendance
  ┌──────────────────────────────────────────┐
  │                                          │
  │          [Fingerprint Circle]            │
  │                                          │
  │    "Click Scan to begin"                 │
  │                                          │
  │        [🔍 Scan Fingerprint]             │
  └──────────────────────────────────────────┘
```

**Attendance flow for each worker:**

```
Gate User clicks [Scan Fingerprint]
         │
         ▼
"Place your finger on the scanner NOW"
         │
         ▼
Worker places finger on scanner
         │
         ▼
System identifies worker (2-3 seconds)
         │
         ├── Match found ──────────────────────────►
         │                                          │
         │                              ┌───────────────────────┐
         │                              │ ✓ SURESH KUMAR        │
         │                              │ XYZ Labour Contractors│
         │                              │ Pending: IN           │
         │                              │                       │
         │                              │ [Confirm IN] [Cancel] │
         │                              └───────────────────────┘
         │
         └── No match ─── Error shown, try again
```

**Step by step:**

1. Click **Scan Fingerprint**
2. The circle starts pulsing — tell the worker to place their finger
3. Worker places finger on scanner firmly
4. System shows the worker's name and pending action (IN or OUT)
5. Click **Confirm IN** or **Confirm OUT**
6. Done! Repeat for the next worker

> **IN vs OUT is automatic:** The system remembers if the worker's last action was IN or OUT. If they last marked IN, the next scan will show "Pending: OUT".

---

### 8.3 Troubleshooting Fingerprint Issues

| Problem | What to do |
|---------|-----------|
| "No finger detected" | Worker must place finger **immediately** after clicking Scan — don't wait |
| "No fingerprint match found" | Worker's finger may be dirty/wet — clean and try again. If still fails, contact vendor admin to check enrollment |
| "Cannot reach scanner" | Check USB connection. Open `https://localhost:8443` in browser and accept certificate |
| Scanner light doesn't blink | Scanner not connected — check USB. Try a different USB port |
| "No workers found" | Vendor may not be approved for your company yet — contact company admin |

---

## 9. Onboarding Checklist

Use this checklist when setting up a new company or vendor on AMS.

### For Super Admin — New Company Setup

- [ ] Create Company in AMS (Administration → Companies → Add Company)
- [ ] Generate and copy Company Admin password
- [ ] Share login credentials with Company Admin (email + password)
- [ ] Confirm Company Admin can log in successfully

### For Super Admin — New Vendor Setup

- [ ] Create Vendor in AMS (Administration → Vendors → Add Vendor)
- [ ] Generate and copy Vendor Admin password
- [ ] Share login credentials with Vendor Admin (email + password)
- [ ] Confirm Vendor Admin can log in successfully

### For Vendor Admin — Getting Started

- [ ] Log in to AMS with provided credentials
- [ ] Go to **Company Access** → Find your client companies → **Request Access**
- [ ] Wait for company approval (follow up with company admin if needed)
- [ ] Once approved, register workers:
  - [ ] Register at least one worker with Aadhaar PDF
  - [ ] Enroll their fingerprint (scanner must be connected)
  - [ ] Confirm worker status shows **Active**

### For Company Admin — Getting Started

- [ ] Log in to AMS with provided credentials
- [ ] Go to **Vendor Approvals** → Check for pending requests → **Approve** vendors
- [ ] Go to **Gate Users** → **Add Gate User** for each entry point
- [ ] Share gate user credentials with security/HR staff at each gate
- [ ] Confirm gate user can log in and reach the Mark Attendance page

### For Gate User — Gate PC Setup (One Time)

- [ ] Open browser on gate PC → Go to `https://localhost:8443` → Accept certificate
- [ ] Log in to AMS with gate user credentials
- [ ] Go to **Mark Attendance**
- [ ] Test with one known worker fingerprint to confirm scanner is working

---

## 10. Frequently Asked Questions

**Q: A worker's fingerprint is not being recognized. What do I do?**

First, try cleaning the worker's finger and the scanner sensor. Ask them to press harder and keep the finger still. If it still fails, the vendor admin should check if the fingerprint was enrolled correctly (Workers list → worker name → re-enroll fingerprint).

---

**Q: The gate scanner is not working / shows an error.**

1. Check that the SecuGen USB scanner is properly connected
2. In the browser, go to `https://localhost:8443` — if you see a certificate warning, click Advanced → Proceed
3. Refresh the Mark Attendance page and try again

---

**Q: A vendor's workers are not showing up for attendance marking.**

This means the vendor has not been approved yet. The company admin must go to **Vendor Approvals** and approve the vendor. Once approved, their workers are immediately available.

---

**Q: How do I add more workers under our vendor?**

The Vendor Admin or Vendor Operator can register new workers at any time via **Register Worker**. Once registered and fingerprint enrolled, they are immediately available at all approved companies.

---

**Q: Can a worker be at two companies on the same day?**

Yes. If your vendor is approved at multiple companies, a worker can mark IN/OUT at any of them. Each record shows which company the attendance was marked at.

---

**Q: What if a worker forgot to mark OUT?**

The Company Admin can see these in **Attendance → Exceptions**. Manual corrections can be made by the Company Admin from the Attendance Log.

---

**Q: How do I change a gate user's password?**

The Company Admin goes to **Gate Users**, clicks the edit (pencil) icon next to the user, enters a new password, and saves.

---

**Q: I cannot log in — it says incorrect password.**

Make sure you are using the exact email and password provided by your admin. Passwords are case-sensitive. If you are still unable to log in, contact your Super Admin or Company Admin to reset your password.

---

**Q: The vendor was approved but we want to stop them. What do we do?**

The Company Admin goes to **Vendor Approvals → Approved tab**, then clicks **Suspend** next to the vendor. Their workers' fingerprints will immediately stop working at your gate. You can re-approve them later.

---

*For technical issues with the server or database, contact your IT administrator.*
