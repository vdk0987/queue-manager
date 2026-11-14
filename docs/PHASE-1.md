# Phase 1 — Project setup & authentication

**Status:** Complete  
**Scope:** Initialize the frontend and backend, configure PostgreSQL and Prisma, implement manager
authentication, and create protected routes.

---

## 1. What was delivered

### Project setup

- npm-workspaces monorepo with `apps/api` and `apps/web`.
- TypeScript everywhere, strict mode, path aliases, shared formatting rules.
- One-command development (`npm run dev`), production builds, typechecks, and tests.
- Docker Compose for PostgreSQL 17, including an automatically created test database.
- Committed Prisma migration and generated client workflow.

### Backend authentication

- `POST /api/auth/register` — validated account creation, bcrypt hashing, duplicate handling.
- `POST /api/auth/login` — timing-resistant credential check, session issuance.
- `POST /api/auth/logout` — clears the session cookie.
- `GET /api/auth/me` — protected session restoration.
- `GET /api/health` — API + database connectivity for the dashboard status card.
- Environment validation, error envelope, request logging, Helmet, CORS allow-list, origin guard,
  rate limiting, JSON body limit, graceful shutdown.
- Auth middleware resolves the manager from PostgreSQL on every request and is ready for queue
  ownership checks in Phase 2.

### Frontend authentication

- Split-screen login and registration experiences with a responsive fallback.
- Client-side Zod validation, inline field errors, server error banners, loading states.
- Password visibility toggles and live password requirement feedback.
- HttpOnly-cookie session restoration through an auth context.
- Protected and public-only route guards with return-path preservation.
- Logout from the account menu plus success/error toasts.
- Branded full-page session loader.

### Manager workspace foundation

- Responsive sidebar, mobile navigation drawer, sticky top bar, account dropdown.
- Overview page with:
  - Phase 1 completion hero.
  - Locked queue metric cards (honest placeholders, no fabricated data).
  - Live API/database health panel with manual and 60-second auto-refresh.
  - Account/session details and copyable manager ID.
  - Seven-phase project roadmap.
  - Empty activity state.
- Intentional Phase 2 and Phase 5 preview pages, not dead links.
- Custom 404 page.
- Consistent light theme, typography (Manrope + Inter), status colors, focus rings, motion with
  `prefers-reduced-motion` support.

---

## 2. Out of scope (by design)

- Queue creation/listing.
- Participant and token registration.
- Reordering, service assignment/completion, cancellation.
- Analytics queries and charts with real data.
- Public queue display, WebSockets, CSV export, dark mode.

The UI marks these clearly as future phases so the application never presents fake operational data.

---

## 3. Key decisions

| Decision                                         | Rationale                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **JWT in HttpOnly cookie**                       | Keeps tokens out of JavaScript, works cleanly with a SPA, stateless and easy to deploy. Logout clears the cookie. |
| **Database lookup in auth middleware**           | Guarantees the manager still exists and provides the exact ownership object Phase 2 needs.                        |
| **Email normalisation at the boundary**          | Prevents casing/whitespace duplicates while keeping the unique index simple.                                      |
| **bcrypt cost 12**                               | Strong default with acceptable development latency; bcryptjs avoids native build issues.                          |
| **Dummy hash on unknown emails**                 | Reduces credential-enumeration timing differences.                                                                |
| **Zod at the server boundary**                   | Single source of validation truth; field errors map directly to the UI.                                           |
| **Origin allow-list for mutations**              | Extra CSRF protection for cookie auth, especially when production uses `SameSite=None`.                           |
| **Prisma `select` projections**                  | Password hashes cannot accidentally leak through a broad model serialization.                                     |
| **Only the Manager model in Phase 1**            | Keeps the migration honest to the milestone; queue models land with their behaviour.                              |
| **No query library yet**                         | Auth is a single context; adding React Query later avoids unused infrastructure.                                  |
| **Phase previews instead of disabled dead ends** | Keeps navigation complete and communicates progress without faking data.                                          |

### Session flow

```text
Register / Login
      │
      ▼
Validate input (Zod)
      │
      ▼
Hash / compare password (bcrypt)
      │
      ▼
Sign JWT { sub: managerId, type: "manager" }
      │
      ▼
Set HttpOnly cookie (SameSite, Secure-aware, 7 days)
      │
      ▼
SPA stores only the public manager object in memory
      │
      ▼
On refresh → GET /api/auth/me → DB lookup → restore workspace
```

---

## 4. API contract

| Method | Endpoint             | Auth     | Success                             |
| ------ | -------------------- | -------- | ----------------------------------- |
| `POST` | `/api/auth/register` | Public   | `201 { manager }` + session cookie  |
| `POST` | `/api/auth/login`    | Public   | `200 { manager }` + session cookie  |
| `POST` | `/api/auth/logout`   | Public   | `200 { success: true }`             |
| `GET`  | `/api/auth/me`       | Required | `200 { manager }`                   |
| `GET`  | `/api/health`        | Public   | `200` or `503` with database status |

Error responses always use:

```json
{ "error": { "code": "…", "message": "…", "details": {} } }
```

---

## 5. Verification performed

### Automated

```bash
npm run typecheck     # both workspaces
npm run build         # API bundle + web production build
npm test              # 16 API integration tests
```

Covered scenarios:

- Health endpoint + live database check.
- Registration payload shape and cookie attributes.
- bcrypt hash persisted, plaintext never stored.
- Name/email normalisation.
- Duplicate email → `409 EMAIL_TAKEN`.
- Zod field errors and password composition rules.
- Login success, wrong password, unknown email.
- Unauthenticated `/me`, malformed JWT, valid bearer token.
- Logout clears the session.
- Unknown browser origin rejected with `403`.
- Unknown route and malformed JSON envelopes.

### End-to-end browser check (Playwright)

1. Open `/login` at 1440×1000 — no horizontal overflow, custom fonts loaded.
2. Switch to registration and create an account.
3. Land on the protected overview; health card reaches **Operational**.
4. Visit Queues and Analytics previews.
5. Sign out through the account menu.
6. Visit `/queues` while signed out → redirected to `/login`.
7. Sign back in → returned to `/queues` (return path preserved).
8. Repeat at 390×844: no horizontal overflow, mobile drawer opens and closes.
9. Capture screenshots; zero unexpected console errors.

---

## 6. Phase 2 handoff

Ready to build on:

- `requireAuth` middleware + `getAuthenticatedManager(req)` helper for ownership checks.
- Public manager type with stable UUIDs.
- Error envelope and validation patterns for new modules.
- Dashboard shell, nav entries, and preview screens to replace with real data.
- Prisma migration workflow and test harness.
- Health endpoint already used by the dashboard.

Phase 2 will add the `Queue` model, ownership enforcement, queue CRUD/status APIs, queue list/detail
UI, and the first real queue metrics.
