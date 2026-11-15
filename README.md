# QueuePilot

QueuePilot is a full-stack queue management application for service teams. Managers can create
queues, register participants, issue tokens, manage waiting order, run services, review history,
and monitor queue performance through an analytics dashboard.

## Features

- Manager registration, login, logout, and session restoration
- Private queues scoped to the authenticated manager
- Queue activation and deactivation
- Participant registration with permanent display tokens
- Waiting-list ordering and token cancellation
- Next-token assignment and service completion
- Service history with status filters and pagination
- Analytics for queue activity, waiting times, service duration, outcomes, and trends
- Authenticated Socket.IO updates for active queue workspaces
- Responsive interface with light and dark themes

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS, Radix UI primitives, Lucide icons |
| Forms and validation | React Hook Form, Zod |
| Charts and notifications | Recharts, Sonner |
| Backend | Node.js, Express 5, TypeScript |
| Realtime | Socket.IO |
| Database | PostgreSQL |
| ORM and migrations | Prisma 6 |
| Authentication | Signed JWT in an HttpOnly cookie |
| Testing | Vitest, Supertest, isolated PostgreSQL test database |
| Package management | npm workspaces |

## Architecture

QueuePilot is a monorepo with a React single-page application and an Express API:

```text
Browser
  │
  ├── React web application
  │     ├── API client
  │     ├── Auth/session provider
  │     ├── Queue and analytics pages
  │     └── Socket.IO realtime subscription
  │
  ├── HTTP requests ───────────────┐
  └── Socket.IO connection ────────┤
                                   ▼
                         Express API server
                           ├── Auth middleware
                           ├── Validation and error handling
                           ├── Queue and token modules
                           ├── Analytics services
                           └── Socket.IO event gateway
                                   │
                                   ▼
                              Prisma ORM
                                   │
                                   ▼
                              PostgreSQL
```

REST endpoints are the authoritative path for data mutations. After a successful queue or token
mutation, the API emits an authenticated Socket.IO event. Connected clients use that event to
refresh their data, keeping multiple manager views synchronized without duplicating business logic
in the browser.

Authentication uses a signed JWT stored in an HttpOnly cookie. Protected API and Socket.IO
connections verify the session and enforce manager ownership before returning or changing queue
data.

## Repository structure

```text
queue-manager/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── config/          # Environment validation
│   │   │   ├── lib/             # Prisma, validation, and shared helpers
│   │   │   ├── middleware/      # Auth, CORS, security, and errors
│   │   │   ├── modules/
│   │   │   │   ├── analytics/
│   │   │   │   ├── auth/
│   │   │   │   ├── health/
│   │   │   │   ├── queues/
│   │   │   │   └── tokens/
│   │   │   ├── app.ts
│   │   │   ├── index.ts
│   │   │   └── realtime.ts
│   │   └── tests/
│   └── web/
│       └── src/
│           ├── components/       # Shared UI and queue components
│           ├── hooks/            # Data fetching and realtime hooks
│           ├── lib/              # API client and utilities
│           ├── pages/            # Dashboard, queues, details, analytics, auth
│           ├── providers/        # Auth and theme providers
│           └── types/
├── docker/                       # PostgreSQL test database bootstrap
├── docker-compose.yml
├── package.json                  # Workspace scripts
└── package-lock.json
```

## Requirements

- Node.js 20.19 or newer
- npm
- Docker with Compose, or a PostgreSQL 15+ server
- Ports `4000`, `5173`, and `5432` available for the default local setup

## Local setup

### 1. Install dependencies

Run these commands from the repository root:

```bash
npm install
```

### 2. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Update `apps/api/.env` if you are not using the included Docker database. Generate a strong session
secret for non-test environments:

```bash
openssl rand -base64 48
```

### 3. Start PostgreSQL

```bash
npm run db:up
```

The Docker setup starts PostgreSQL on `localhost:5432` and creates the application and test
databases.

### 4. Generate Prisma and apply migrations

```bash
npm run db:generate
npm run db:deploy
```

Run `npm run db:deploy` from the repository root. It applies existing migrations without creating
new ones. Use `npm run db:migrate` when changing the Prisma schema during local development.

### 5. Start the application

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| Web application | http://localhost:5173 |
| API | http://localhost:4000 |
| Health check | http://localhost:4000/api/health |

Open http://localhost:5173/register to create the first manager account.

## Environment variables

### API: `apps/api/.env`

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | Runtime environment |
| `PORT` | No | `4000` | HTTP API port |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Session signing key; use at least 32 characters |
| `SESSION_TTL_DAYS` | No | `7` | Session lifetime |
| `CLIENT_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed browser origins |
| `COOKIE_NAME` | No | `qp_session` | Session cookie name |
| `COOKIE_SECURE` | No | `auto` | `auto`, `true`, or `false` |
| `COOKIE_SAME_SITE` | No | `auto` | `auto`, `lax`, `strict`, or `none` |
| `COOKIE_DOMAIN` | No | — | Optional cookie domain |
| `TRUST_PROXY` | No | `0` | Set to `1` behind Render or another proxy |

### Web: `apps/web/.env`

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_URL` | No | API URL when the web app and API use different origins |
| `VITE_DEV_API_URL` | No | Local development proxy target; defaults to `http://localhost:4000` |

The API validates its configuration at startup and refuses to run with invalid required values.

## Commands

Run all root commands from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API and web app together |
| `npm run dev:api` | Run the API with hot reload |
| `npm run dev:web` | Run the web app |
| `npm run build` | Build the API and web app |
| `npm run typecheck` | Typecheck both workspaces |
| `npm test` | Run API integration tests |
| `npm run format` | Format the repository with Prettier |
| `npm run format:check` | Check formatting |
| `npm run db:up` | Start the local PostgreSQL containers |
| `npm run db:down` | Stop the local PostgreSQL containers |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:deploy` | Apply committed migrations |
| `npm run db:migrate` | Create and apply a development migration |
| `npm run db:studio` | Open Prisma Studio |

## API reference

All API routes use the `/api` prefix and return JSON. Protected routes require the session cookie
created during login or registration. A bearer token can also be used for API clients.

### Authentication

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Create a manager and start a session |
| `POST` | `/api/auth/login` | Public | Authenticate and start a session |
| `POST` | `/api/auth/logout` | Public | Clear the session cookie |
| `GET` | `/api/auth/me` | Required | Return the current manager |

### Health

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Check API and database health |

### Queues

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/queues` | Create a queue |
| `GET` | `/api/queues` | List the manager's queues |
| `GET` | `/api/queues/:id` | Get a queue |
| `PATCH` | `/api/queues/:id` | Rename a queue |
| `PATCH` | `/api/queues/:id/status` | Activate or deactivate a queue |
| `GET` | `/api/queues/:id/tokens` | Get waiting tokens and queue statistics |
| `POST` | `/api/queues/:id/tokens` | Register a participant |
| `GET` | `/api/queues/:id/current` | Get the current service |
| `POST` | `/api/queues/:id/next` | Assign the next waiting token |
| `GET` | `/api/queues/:id/history` | Get service and cancellation history |

### Tokens

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/tokens/:id` | Get a token |
| `PATCH` | `/api/tokens/:id/reorder` | Move a waiting token up or down |
| `POST` | `/api/tokens/:id/cancel` | Cancel a waiting token |
| `POST` | `/api/tokens/:id/complete` | Complete the active service |

### Analytics

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/analytics/overview` | High-level queue and token metrics |
| `GET` | `/api/analytics/dashboard` | Combined dashboard metrics and chart data |
| `GET` | `/api/analytics/trends` | Historical queue-length trends |
| `GET` | `/api/analytics/wait-times` | Waiting-time metrics |
| `GET` | `/api/analytics/service-performance` | Service-duration and completion metrics |
| `GET` | `/api/analytics/token-distribution` | Token status distribution |

Analytics routes support manager ownership checks and optional queue/date filters where applicable.
Historical queue trends are based on persisted queue activity events rather than only the current
waiting list.

### Response and error format

Successful resource responses generally use:

```json
{
  "success": true,
  "data": {}
}
```

Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid."
  }
}
```

Validation errors may include `details.fieldErrors`. The API uses consistent status codes and does
not expose database internals or stack traces in production.

## Realtime events

The API hosts Socket.IO on the same HTTP server as the REST API. Clients authenticate with the
session cookie or a bearer token, then join an owned queue room:

```text
queue:join(queueId)
queue:leave(queueId)
```

The server emits queue-scoped events after successful mutations:

```text
token:created
token:reordered
token:cancelled
service:started
service:completed
queue:updated
```

Realtime events trigger client refetches; they do not replace REST authorization or mutation
handling.

## Security

- Passwords are hashed with bcrypt and never returned.
- Sessions use signed JWTs in HttpOnly cookies.
- Protected resources are scoped to the authenticated manager.
- Cross-manager queue and token access is returned as not found.
- Request bodies are validated with Zod.
- CORS is allow-listed and credentialed.
- State-changing requests use origin checks as an additional CSRF defence.
- Authentication routes are rate limited.
- Helmet security headers and request-size limits are enabled.

## Testing

```bash
npm test
```

The test command uses the isolated PostgreSQL test database configured by `.env.test`, resets the
database, applies the Prisma schema, and runs the API integration suite with Vitest and Supertest.

## Deployment

The recommended hosting arrangement is:

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** Neon PostgreSQL

For production, configure the Render API service with the Neon `DATABASE_URL`, a strong
`JWT_SECRET`, `CLIENT_ORIGINS` set to the exact Vercel URL, `TRUST_PROXY=1`,
`COOKIE_SECURE=true`, and `COOKIE_SAME_SITE=none`. Configure Vercel with
`VITE_API_URL` pointing to the Render API URL.

Run migrations against the production database from the repository root after setting the
production `DATABASE_URL`:

```bash
npm run db:deploy
```

For Render builds, ensure development dependencies are available because the current TypeScript
build uses workspace tooling:

```bash
npm ci --include=dev
npm run build --workspace @queuepilot/api
```

## Useful links

- [Repository](https://github.com/vdk0987/queue-manager)
- [Vercel documentation](https://vercel.com/docs)
- [Render documentation](https://render.com/docs)
- [Neon documentation](https://neon.tech/docs)
- [Prisma documentation](https://www.prisma.io/docs)
- [Socket.IO documentation](https://socket.io/docs/v4/)
