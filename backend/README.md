# FFT Manufacturing Backend — Phases 1–2

Backend for the FFT Manufacturing Transparency Platform (mobile app).
Built per the approved design docs in `../docs` (07 architecture, 08 schema, 09 API, 10 structure).

> **Phase 1:** project foundation, MongoDB Atlas connection, all Mongoose models, JWT auth, RBAC middleware.
> **Phase 2 (Authentication Module):** login API, JWT generation, bcrypt password verification, `/me`, **logout (token denylist)**, protected-route middleware, and role-based authorization integration.
> **Not yet built:** department modules (moulding/assembly/qc/packing), master-data CRUD, customer dashboard, uploads, notifications. Their routes are stubbed (commented) in `src/routes/index.js`.

## Tech stack
- Node.js + Express
- MongoDB Atlas + Mongoose
- JWT auth (`jsonwebtoken`) + bcrypt (`bcryptjs`)
- Role-based access control (RBAC)

## Setup
1. Install dependencies:
   ```
   npm install
   ```
2. Create your env file:
   ```
   copy .env.example .env      (Windows)
   ```
   Then set `MONGODB_URI` (Atlas) and a strong `JWT_SECRET`.
3. Seed the first admin (no public signup in V1):
   ```
   npm run seed:admin
   ```
4. Run the server:
   ```
   npm run dev      # auto-reload (nodemon)
   npm start        # plain node
   ```

## Available endpoints
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/health` | none | service check |
| POST | `/api/v1/auth/login` | none | body `{ email, password }` → `{ token, user }` |
| GET | `/api/v1/auth/me` | Bearer token | current profile |
| POST | `/api/v1/auth/refresh` | Bearer token | new token for the current user |
| POST | `/api/v1/auth/logout` | Bearer token | revokes the presented token |

Send the token as `Authorization: Bearer <token>` on protected routes.

### Logout strategy
JWTs are stateless, so logout is implemented as a **server-side denylist**:
- Each issued token carries a unique id (`jti`) and an expiry (`exp`).
- `POST /auth/logout` stores that `jti` in the `revokedtokens` collection until `exp`.
- The auth middleware rejects any token whose `jti` is on the denylist (`401 token_revoked`).
- A MongoDB **TTL index** auto-deletes denylist entries once they expire, so it never grows unbounded.
- The client should also discard its stored token on logout.

### Protecting routes (Phase 3+)
Use the `protect` helper to combine authentication + role authorization:
```js
const protect = require('./middleware/protect');
const { ROLES } = require('./utils/roles');

router.post('/customers', ...protect(ROLES.ADMIN), controller.create); // admin only
router.get('/health-secure', ...protect(), controller.something);      // any logged-in user
```

## Folder map (matches doc 10)
```
src/
├── server.js            # entry: connect DB, start server
├── app.js               # Express app + middleware + routes
├── config/              # env.js, db.js
├── models/              # 11 Mongoose models (10 from doc 08 + RevokedToken for logout)
├── middleware/          # auth.js (JWT+denylist), rbac.js (allow roles),
│                        #   protect.js (auth+role combo), validate.js, errorHandler.js
├── services/            # auth.service.js (login, refresh, logout, isRevoked, hashPassword)
├── controllers/         # auth.controller.js
├── routes/              # index.js, auth.routes.js
├── utils/               # roles.js, httpError.js
└── scripts/             # seedAdmin.js
```

## Rules already enforced
- **RBAC**: `allow(...roles)` guard (`src/middleware/rbac.js`), used after `authenticate`.
- **JWT**: token carries `{ sub, role, customerId }`; verified on every protected route.
- **Immutability**: all models use `createdAt` only (`updatedAt: false`); no update/delete code exists.
- **Customer link rule**: a `customer` user must have a `customerId`; internal roles must not (enforced in `User` model).
