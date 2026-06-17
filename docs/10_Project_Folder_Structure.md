# Project Folder Structure
## FFT Manufacturing Transparency Platform — V1 (MVP)

> Two top-level projects in one repository: a **mobile app** (`mobile/`, React Native + Expo) and a **backend API** (`backend/`, Node.js + Express + MongoDB Atlas). Layout mirrors the layers in `07_System_Architecture.md`, the schema in `08`, and the endpoints in `09`. **No code is written yet** — this is the planned structure with one-line descriptions so it's easy to navigate.

---

## 1. Repository root
```
Modern_Manufacturing/
├── docs/                     # all approved planning & design docs (01–10)
├── backend/                  # Node.js + Express REST API  (see §2)
├── mobile/                   # React Native + Expo app      (see §3)
├── README.md                 # how to run both projects
└── .gitignore
```

---

## 2. Backend  (`backend/`)  — Node.js + Express + Mongoose

```
backend/
├── package.json
├── .env.example              # MONGODB_URI, JWT_SECRET, JWT_EXPIRY, PORT, upload config
├── .gitignore
└── src/
    ├── server.js             # app entry: load env, connect Atlas, start Express
    ├── app.js                # build Express app, mount middleware + routes
    │
    ├── config/
    │   ├── db.js             # MongoDB Atlas (Mongoose) connection
    │   └── env.js            # read/validate environment variables
    │
    ├── models/               # Mongoose schemas = collections in doc 08
    │   ├── User.js
    │   ├── Customer.js
    │   ├── Product.js
    │   ├── Order.js
    │   ├── MouldingRecord.js
    │   ├── AssemblyRecord.js
    │   ├── QCRecord.js
    │   ├── PackingDispatchRecord.js
    │   ├── MediaAsset.js
    │   └── Notification.js
    │
    ├── middleware/
    │   ├── auth.js           # verify JWT, attach req.user {id, role, customerId}
    │   ├── rbac.js           # allow(...roles) — role-based route guard
    │   ├── scope.js          # force customerId / department filters (isolation)
    │   ├── validate.js       # request body/param validation
    │   ├── upload.js         # multipart handling (images / invoice)
    │   └── errorHandler.js   # consistent { error, message } responses
    │
    ├── routes/               # endpoint groups from doc 09
    │   ├── index.js          # mounts everything under /api/v1
    │   ├── auth.routes.js
    │   ├── customer.routes.js        # admin master-data: customers
    │   ├── product.routes.js
    │   ├── order.routes.js
    │   ├── moulding.routes.js
    │   ├── assembly.routes.js
    │   ├── qc.routes.js
    │   ├── packingDispatch.routes.js
    │   ├── upload.routes.js
    │   ├── customerView.routes.js    # /customer/* dashboard, timeline, qc-reports
    │   ├── notification.routes.js
    │   └── admin.routes.js           # /admin/* read-all
    │
    ├── controllers/          # parse request → call service → send response
    │   ├── auth.controller.js
    │   ├── customer.controller.js
    │   ├── product.controller.js
    │   ├── order.controller.js
    │   ├── moulding.controller.js
    │   ├── assembly.controller.js
    │   ├── qc.controller.js
    │   ├── packingDispatch.controller.js
    │   ├── upload.controller.js
    │   ├── customerView.controller.js
    │   ├── notification.controller.js
    │   └── admin.controller.js
    │
    ├── services/             # business rules (immutability, isolation, derivations)
    │   ├── auth.service.js            # login, JWT issue/refresh, bcrypt
    │   ├── masterData.service.js      # create/read customers, products, orders
    │   ├── record.service.js          # validate order-chain + immutable insert
    │   ├── dashboard.service.js       # aggregate customer-visible status
    │   ├── timeline.service.js        # stage status (Q-T1) when finalized
    │   ├── progress.service.js        # progress % (Q-P1) when finalized
    │   ├── notification.service.js    # create/list notifications
    │   └── upload.service.js          # store file, return media reference
    │
    ├── utils/
    │   ├── roles.js          # role constants/enums
    │   ├── visibility.js     # customer-visible field whitelists per module (doc 02)
    │   └── httpError.js      # typed error helper
    │
    └── tests/                # (later) unit/integration tests
```

**How a request flows (matches `07`):**
`routes → middleware (auth → rbac → scope → validate) → controller → service → model → MongoDB`.

---

## 3. Mobile app  (`mobile/`)  — React Native + Expo  (Android first)

```
mobile/
├── package.json
├── app.json / app.config.js  # Expo config (name, Android package, icons)
├── .env.example              # API_BASE_URL
├── App.js                    # root: providers + navigation entry
└── src/
    ├── api/                  # talks to the backend (doc 09)
    │   ├── client.js         # axios/fetch wrapper, attaches JWT
    │   ├── auth.api.js
    │   ├── masterData.api.js # customers/products/orders (dropdowns)
    │   ├── records.api.js    # moulding/assembly/qc/packing submissions
    │   ├── uploads.api.js
    │   ├── customer.api.js   # dashboard/timeline/qc-reports
    │   └── notifications.api.js
    │
    ├── auth/
    │   ├── AuthContext.js    # holds token + user, login/logout
    │   └── secureToken.js    # Expo SecureStore read/write
    │
    ├── navigation/
    │   ├── RootNavigator.js  # picks stack by auth state
    │   └── roleRoutes.js     # role → which screens are shown (RBAC in UI)
    │
    ├── screens/
    │   ├── auth/
    │   │   └── LoginScreen.js
    │   ├── admin/
    │   │   ├── AdminHomeScreen.js
    │   │   ├── CreateCustomerScreen.js
    │   │   ├── CreateProductScreen.js
    │   │   ├── CreateOrderScreen.js
    │   │   └── AllDataScreen.js
    │   ├── engineer/
    │   │   ├── MouldingEntryScreen.js
    │   │   ├── AssemblyEntryScreen.js
    │   │   ├── QCEntryScreen.js
    │   │   ├── PackingDispatchEntryScreen.js
    │   │   └── MyRecordsScreen.js        # own-department list
    │   └── customer/
    │       ├── CustomerDashboardScreen.js
    │       ├── ProductionTimelineScreen.js
    │       ├── QCReportsScreen.js
    │       └── NotificationsScreen.js
    │
    ├── components/           # reusable UI
    │   ├── CascadingPicker.js   # Customer → Product → Order dropdowns (auto-fills qty)
    │   ├── ImageUploader.js     # camera/gallery → /uploads
    │   ├── StatusBadge.js       # timeline ✓ / in-progress / pending
    │   ├── FormField.js
    │   └── DashboardCard.js
    │
    ├── constants/
    │   └── roles.js
    │
    └── utils/
        └── format.js
```

**Screen ↔ flow mapping (matches `03`):** Login → role home; Admin create-master screens; one engineer entry screen per department with cascading dropdowns + image upload + own-records list; customer dashboard/timeline/QC/notifications.

---

## 4. Why this structure is easy to work with
- **Two clear projects** — backend and mobile never mix; each runs independently.
- **One concept per folder** — models = collections (`08`), routes/controllers/services = endpoints (`09`), screens = user flows (`03`).
- **Rules live in one place** — RBAC, isolation, immutability, and field-visibility are in backend `middleware/` + `services/`/`utils/visibility.js`, so security can't leak into the UI.
- **Room to grow** — V2 features (editing, approvals, analytics) slot into new services/routes without restructuring (`06`).

---

## 5. Out of scope (no code now)
This document defines structure only. Per your instruction, **no frontend or backend code is generated yet**. Implementation begins after this structure is approved.
