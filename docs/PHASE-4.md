# Phase 4 — Service management

**Status:** Complete  
**Scope:** Next-token assignment, the active service counter, service completion, duration and
waiting-time calculations, completed/cancelled history, and the end-to-end service UI.

---

## 1. What was delivered

### Service data model

The Phase 3 `Token` model already contained the lifecycle fields, so Phase 4 added the query index
needed by the service workflow:

- `status`: `WAITING`, `IN_SERVICE`, `COMPLETED`, `CANCELLED`.
- `serviceStartedAt`: set when a waiting token is assigned.
- `serviceCompletedAt`: set when the active service is completed.
- `cancelledAt`: preserved from Phase 3 for cancelled records.
- `INDEX (queueId, status)` for finding the active service token and paginating history.
- Committed migration `20261115120000_add_service_management`.

Only one token can be `IN_SERVICE` per queue. The rule is enforced by the queue row lock rather than
a partial unique index, which keeps the workflow compatible with `prisma db push` test databases and
with future multi-counter support.

### State machine

```text
WAITING ──Next token──▶ IN_SERVICE ──Complete service──▶ COMPLETED
   │
   └──Cancel──▶ CANCELLED
```

Invalid transitions are rejected by the backend:

- A second token cannot be assigned while a service is active.
- A waiting, completed, or cancelled token cannot be completed.
- Assigning on an inactive or empty queue fails.
- A foreign manager's queue or token is indistinguishable from a missing one (`404`).

### Next token

- Runs inside a transaction and takes `SELECT … FOR UPDATE` on the queue row first.
- Verifies ownership, queue activity, and that no token is already `IN_SERVICE`.
- Selects the first `WAITING` token by position (then ID as a deterministic tie-breaker).
- Sets status to `IN_SERVICE`, position to `NULL`, and `serviceStartedAt` to the current time.
- Renumbers the remaining waiting list from `1..n`.
- Concurrent Next Token requests are serialised; exactly one succeeds and the rest receive
  `409 QUEUE_IN_SERVICE`.

### Service completion

- Runs inside a transaction with the same ownership and queue lock order.
- Rejects tokens that are not currently `IN_SERVICE`.
- Sets status to `COMPLETED`, records `serviceCompletedAt`, and keeps the record permanently.
- Does not reuse the token number or alter historical waiting data.

### Calculated timings

Both calculations use persisted timestamps on the backend and are returned in every token response:

```text
waitingTimeSeconds    = floor(serviceStartedAt   - createdAt)
serviceDurationSeconds = floor(serviceCompletedAt - serviceStartedAt)
```

A missing timestamp produces `null`.

### API

| Method | Endpoint                   | Function                    |
| ------ | -------------------------- | --------------------------- |
| `POST` | `/api/queues/:id/next`     | Assign the first waiter     |
| `GET`  | `/api/queues/:id/current`  | Read the active service     |
| `POST` | `/api/tokens/:id/complete` | Complete the active service |
| `GET`  | `/api/queues/:id/history`  | Read completed/cancelled    |

All endpoints require a session and enforce queue ownership from the session.

History query parameters:

- `status`: `COMPLETED`, `CANCELLED`, or `ALL` (default).
- `startDate`, `endDate`: ISO dates applied to the terminal timestamp.
- `page`: 1-based page number (default `1`).
- `limit`: 1–100 (default `20`).

History merges completed and cancelled records onto one timeline and orders by
`COALESCE(serviceCompletedAt, cancelledAt) DESC`, so cancellation and completion events interleave
chronologically.

### Service UI

- Prominent **Next token** button in the Currently Serving card.
- Disabled while a service is active, when the queue has no waiters, when the queue is inactive, or
  while a request is pending.
- Active-service card with display token, participant, start time, and a live elapsed timer.
- **Complete service** button with pending state and duplicate-submission protection.
- Empty states for “no active service” and “no history”.
- Service history table with status filters, pagination, token, participant, start/end timestamps,
  and duration.
- Queue statistics and the waiting list refresh after assignment and completion.
- Successful completions and cancellations immediately refresh history.
- Failures surface a toast and reload authoritative workspace state instead of leaving optimistic
  state behind.

---

## 2. Key decisions

| Decision                                             | Rationale                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Queue row lock as the service mutex**              | Assignment and completion already mutate the same queue; one lock serialises both without new primitives.   |
| **No partial unique index for `IN_SERVICE`**         | The lock enforces one active service now and leaves room for multi-counter queues later.                    |
| **`position = NULL` for active and finished tokens** | The unique waiting-position index only applies to the line, not to historical records.                      |
| **Assignment renumbers the remaining line**          | The waiting list always starts at position `1` with no gaps after a token is called.                        |
| **Return the token directly from Next/Complete**     | Matches the requested contract and lets the UI update immediately before an authoritative refresh.          |
| **History uses the terminal timestamp**              | Completed rows use `serviceCompletedAt`; cancelled rows use `cancelledAt`, producing one coherent timeline. |
| **Durations computed on the backend**                | Both the API and future analytics share the same floor-to-seconds definition.                               |
| **Elapsed timer is display-only**                    | The UI ticks every second, but persisted duration comes from the database timestamps.                       |

---

## 3. API contract

### Assign the next token

`POST /api/queues/:id/next`

`200 OK`

```json
{
  "success": true,
  "data": {
    "id": "token-uuid",
    "tokenNumber": 1,
    "displayToken": "Q7F2-001",
    "participantName": "John Doe",
    "status": "IN_SERVICE",
    "position": null,
    "serviceStartedAt": "2026-11-15T10:00:00.000Z",
    "serviceCompletedAt": null,
    "waitingTimeSeconds": 240,
    "serviceDurationSeconds": null
  }
}
```

Errors: `409 QUEUE_EMPTY`, `409 QUEUE_IN_SERVICE`, `409 QUEUE_INACTIVE`, `404 QUEUE_NOT_FOUND`.

### Read the active service

`GET /api/queues/:id/current`

```json
{
  "success": true,
  "data": {
    "id": "token-uuid",
    "displayToken": "Q7F2-001",
    "participantName": "John Doe",
    "status": "IN_SERVICE",
    "serviceStartedAt": "2026-11-15T10:00:00.000Z"
  }
}
```

Returns `{ "success": true, "data": null }` when the counter is free.

### Complete the active service

`POST /api/tokens/:id/complete`

`200 OK`

```json
{
  "success": true,
  "message": "Service completed successfully",
  "data": {
    "id": "token-uuid",
    "status": "COMPLETED",
    "serviceStartedAt": "2026-11-15T10:00:00.000Z",
    "serviceCompletedAt": "2026-11-15T10:08:00.000Z",
    "serviceDurationSeconds": 480
  }
}
```

Errors: `409 TOKEN_NOT_IN_SERVICE`, `404 TOKEN_NOT_FOUND`.

### Read service history

`GET /api/queues/:id/history?status=ALL&page=1&limit=20`

```json
{
  "success": true,
  "data": {
    "queue": {
      "id": "queue-uuid",
      "name": "General Consultation",
      "code": "Q7F2",
      "status": "ACTIVE",
      "waitingCount": 1
    },
    "items": [
      {
        "id": "token-uuid",
        "displayToken": "Q7F2-002",
        "participantName": "John Doe",
        "status": "COMPLETED",
        "serviceStartedAt": "2026-11-15T10:00:00.000Z",
        "serviceCompletedAt": "2026-11-15T10:08:00.000Z",
        "serviceDurationSeconds": 480
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```

---

## 4. Concurrency and consistency

Assignment and completion use the same lock order as Phase 3:

```text
1. Resolve the token's queue and verify ownership.
2. SELECT the queue row FOR UPDATE.
3. Re-read the token / active service inside the transaction.
4. Validate the state transition.
5. Write status, timestamps and positions.
6. Commit before the next request proceeds.
```

A failed transition rolls the entire transaction back. Because Next Token checks for `IN_SERVICE`
after acquiring the queue lock, simultaneous clicks cannot assign two participants; one request wins
and the others receive `QUEUE_IN_SERVICE` without writing anything.

---

## 5. Testing

`apps/api/tests/service.test.ts` adds 23 integration tests covering:

- Authentication and `Cache-Control: no-store` on every new endpoint.
- Assigning the first waiting token and normalising positions.
- Empty queue and inactive queue rejection.
- Assignment while a service is active.
- Current-token reads, `null` when idle, and refresh persistence.
- Timestamp and duration calculations, including waiting time.
- Completing a service and rejecting waiting/cancelled/already-completed tokens.
- Assigning the next token after completion.
- Concurrent Next Token requests: exactly one assignment.
- Ownership isolation for Next, Current, Complete, and History.
- History contents, chronological ordering, status/date filters, pagination, and validation.
- Database state after rejected transitions.

The full suite is **88 passing tests** (16 auth/hardening, 20 queue, 29 token, 23 service).

The complete workflow was also smoke-tested in Chromium against the running dev servers:

```text
register two participants → Next token → refresh page (service persists) →
Complete service → history row appears → Next token → Complete service →
both records visible in history, no page errors or 5xx responses
```

---

## 6. Phase 5 handoff

Phase 5 can build analytics on stable persisted data:

- `createdAt` → `serviceStartedAt` gives waiting time.
- `serviceStartedAt` → `serviceCompletedAt` gives service duration.
- Completed and cancelled records retain their token numbers and participant data.
- The `(queueId, status)` index supports status-based aggregation.
- History timestamps are consistent and server-calculated, avoiding client clock drift.

The one-active-service rule is intentionally simple. Multi-counter support would require a counter
identifier on tokens and a different uniqueness strategy, but the current timestamps remain valid.
