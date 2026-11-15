# Phase 3 — Token management

**Status:** Complete  
**Scope:** Participant registration, automatic and permanent token numbering, waiting-list ordering,
token retrieval, reordering, cancellation, queue statistics, and the complete operational queue UI.

---

## 1. What was delivered

### Token data model

- `TokenStatus` enum: `WAITING`, `IN_SERVICE`, `COMPLETED`, `CANCELLED`.
- `Token` model with:
  - UUID primary key.
  - Permanent, queue-scoped `tokenNumber`.
  - Mutable `position` for waiting order only.
  - Participant name, optional contact number, and optional notes.
  - Status and the four lifecycle timestamps (`createdAt`, `serviceStartedAt`,
    `serviceCompletedAt`, `cancelledAt`).
  - Required `queueId` foreign key with `ON DELETE CASCADE`.
  - Unique `(queueId, tokenNumber)` constraint.
  - Unique `(queueId, position)` constraint, where cancelled/completed tokens store `NULL`.
  - Index on `(queueId, status, position)` for waiting-list queries and on `(queueId, createdAt)`
    for history.
- `Queue.tokens` one-to-many relationship.
- `Queue.code` — a short, human-readable prefix for display tokens (for example `Q7F2-001`).
- `Queue.nextTokenNumber` — a monotonic per-queue counter that never moves backwards.
- Committed migration `20261115090000_add_token_management` with a safe backfill of queue codes for
  pre-existing queues.

### Token generation

- `tokenNumber` is allocated from the locked queue counter, not from `MAX(tokenNumber) + 1`.
- Every registration opens a transaction and takes `SELECT … FOR UPDATE` on the queue row before
  allocating a number.
- Concurrent registrations on the same queue are serialised, so numbers and positions are unique.
- New tokens are appended to the end of the waiting list.
- Token numbers survive reordering, cancellation, and completion.
- Registration is rejected for inactive queues.
- The client cannot supply `tokenNumber`, `position`, `status`, `queueId`, or `managerId`.

### API

- `POST /api/queues/:id/tokens` — register a participant and return the generated token.
- `GET /api/queues/:id/tokens` — return queue details, the currently serving token, the ordered
  waiting list, an optional status-filtered history list, and live statistics.
- `GET /api/tokens/:id` — return one owned token.
- `PATCH /api/tokens/:id/reorder` — move a waiting token `UP` or `DOWN` one position.
- `POST /api/tokens/:id/cancel` — cancel a waiting token, preserve its record, and normalise the
  remaining positions.

All token routes require a session. Ownership is derived from the session and enforced through the
token's queue. A token belonging to another manager is indistinguishable from a missing token (`404`).

### Queue statistics

Calculated from PostgreSQL on every workspace read:

- Total tokens generated.
- Waiting count.
- In-service count.
- Completed count.
- Cancelled count.
- Current queue length.
- Earliest registration timestamp.

### Participant registration UI

- Add Participant dialog with name, optional contact number, and optional notes.
- Client-side Zod validation, field counters, server field-error mapping, and network error alerts.
- Pending state prevents double submission and accidental dialog dismissal.
- Success state displays the generated display token, participant name, new position, and a copy
  action, with an “Add another” flow.
- Registration controls are disabled for inactive queues.

### Waiting queue UI

- Ordered list with position, display token, participant name, registration time, elapsed wait, and
  optional contact/notes.
- Move up, move down, and cancel actions.
- First/last boundaries and in-flight actions disable the relevant controls.
- Cancellation requires confirmation and explains that the record is preserved.
- Empty, inactive, loading-skeleton, not-found, invalid-link, and recoverable error states.
- Statistics tiles above the working area.
- The currently serving token is rendered separately and the UI states honestly that service flow
  arrives in Phase 4.
- In-flight refreshes are invalidated after a mutation so older responses cannot overwrite newer
  queue state.

---

## 2. Out of scope (by design)

- Starting and completing service (`IN_SERVICE` → `COMPLETED`).
- A manager-facing history browser for completed and cancelled tokens.
- Analytics charts and date filtering.
- Real-time WebSocket/SSE updates.
- Estimated waiting times based on historical service duration.
- Permanent queue or token deletion.

The Phase 3 UI displays the currently serving token if one exists in the database, but there is no
service-start control until Phase 4.

---

## 3. Key decisions

| Decision                                            | Rationale                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Separate permanent number and mutable position**  | `tokenNumber` identifies a visit forever; `position` exists only while the token is waiting.                                    |
| **Per-queue counter instead of `MAX + 1`**          | A locked counter cannot produce duplicates when two managers register at the same moment.                                       |
| **Queue row lock as the mutation mutex**            | Registration, reorder, and cancellation all mutate the same waiting list; one lock gives a simple, correct serialisation point. |
| **`position = NULL` outside the waiting list**      | PostgreSQL unique indexes allow multiple `NULL`s, so cancelled/completed records never consume a waiting position.              |
| **Unique `(queueId, position)`**                    | Makes duplicate positions a database error rather than a state the UI has to tolerate.                                          |
| **Ascending renumbering after cancellation**        | Each target position has already been vacated, so the unique index is never violated mid-transaction.                           |
| **Swap through a temporary `NULL` position**        | Reordering can move two rows without a transient duplicate position.                                                            |
| **404 for foreign tokens and queues**               | Avoids revealing whether a token exists in another manager's workspace.                                                         |
| **Display tokens derived from queue code + number** | The database stores the number; the API composes `Q7F2-001`, so formatting can change without rewriting records.                |
| **Statistics computed with database aggregates**    | Counts stay correct across sessions and do not depend on frontend counters.                                                     |
| **Request-generation guard in the queue hook**      | A slow background refresh cannot overwrite a newer mutation result.                                                             |
| **No WebSockets in Phase 3**                        | Correct REST transactions and persistence come first; real-time transport can be layered on later.                              |

---

## 4. Concurrency and consistency

Every waiting-list mutation follows the same lock order:

```text
1. Resolve the token's queue and verify manager ownership.
2. SELECT the queue row FOR UPDATE (serialises all mutations in that queue).
3. Re-read the token inside the transaction.
4. Validate status and boundaries.
5. Mutate positions / counter.
6. Return the authoritative waiting list.
```

Registration additionally increments the queue's `nextTokenNumber` while the row lock is held, then
computes `MAX(position) + 1` for the waiting list. Both values are therefore safe under concurrent
requests.

Cancellation sets `status = CANCELLED`, `position = NULL`, and `cancelledAt = now()`, then renumbers
the remaining waiting rows from `1..n` in ascending order.

Reordering finds the nearest waiting neighbour in the requested direction, checks the boundary,
sets the moving token's position to `NULL`, gives its old position to the neighbour, and finally
gives the neighbour's old position to the moving token.

All mutations run in PostgreSQL transactions. A failed operation leaves no partial changes.

---

## 5. API contract

### Register a participant

`POST /api/queues/:id/tokens`

```json
{
  "participantName": "John Doe",
  "contactNumber": "9876543210",
  "notes": "General consultation"
}
```

`201 Created`

```json
{
  "success": true,
  "data": {
    "id": "2a4c…",
    "tokenNumber": 4,
    "displayToken": "Q7F2-004",
    "participantName": "John Doe",
    "contactNumber": "9876543210",
    "notes": "General consultation",
    "status": "WAITING",
    "position": 4,
    "queueId": "f261…",
    "createdAt": "2026-11-15T10:00:00.000Z",
    "updatedAt": "2026-11-15T10:00:00.000Z",
    "serviceStartedAt": null,
    "serviceCompletedAt": null,
    "cancelledAt": null
  }
}
```

### Read the queue workspace

`GET /api/queues/:id/tokens?status=ALL`

```json
{
  "success": true,
  "data": {
    "queue": {
      "id": "f261…",
      "name": "General Consultation",
      "code": "Q7F2",
      "status": "ACTIVE",
      "waitingCount": 3,
      "createdAt": "2026-11-15T09:00:00.000Z",
      "updatedAt": "2026-11-15T09:00:00.000Z"
    },
    "currentlyServing": null,
    "waiting": [
      {
        "id": "2a4c…",
        "displayToken": "Q7F2-001",
        "participantName": "John",
        "position": 1,
        "status": "WAITING"
      }
    ],
    "waitingCount": 1,
    "stats": {
      "totalGenerated": 1,
      "waitingCount": 1,
      "inServiceCount": 0,
      "completedCount": 0,
      "cancelledCount": 0,
      "currentQueueLength": 1,
      "earliestRegistrationAt": "2026-11-15T10:00:00.000Z"
    },
    "tokens": []
  }
}
```

`status` accepts `WAITING`, `IN_SERVICE`, `COMPLETED`, `CANCELLED`, or `ALL`. Waiting tokens are
always ordered by position; `tokens` is ordered newest first and is intended for history views.

### Reorder

`PATCH /api/tokens/:id/reorder`

```json
{ "direction": "UP" }
```

Returns the moved token and the complete ordered waiting list.

### Cancel

`POST /api/tokens/:id/cancel`

```json
{
  "success": true,
  "message": "Token cancelled successfully",
  "data": {
    "token": { "status": "CANCELLED", "position": null },
    "waiting": [],
    "waitingCount": 0,
    "stats": {}
  }
}
```

### Additional error codes

| Code                     | Status | Meaning                                                   |
| ------------------------ | ------ | --------------------------------------------------------- |
| `QUEUE_INACTIVE`         | 409    | Registration was attempted on an inactive queue.          |
| `QUEUE_IN_SERVICE`       | 409    | Deactivation was attempted while someone is being served. |
| `TOKEN_NOT_FOUND`        | 404    | Unknown token or a token owned by another manager.        |
| `TOKEN_NOT_WAITING`      | 409    | Reorder/cancel was attempted on a non-waiting token.      |
| `TOKEN_REORDER_BOUNDARY` | 409    | The token is already first or last in the waiting list.   |

---

## 6. Verification performed

### Automated

```bash
npm run typecheck   # both workspaces
npm run build       # API bundle + web production build
npm test            # 65 API integration tests
npx prettier --check .
```

The 29 token tests cover:

- Authentication on every token endpoint.
- Registration, response shape, display-token format, and persistence.
- Sequential numbers and positions for multiple registrations.
- Inactive-queue rejection and registration after reactivation.
- Participant validation, optional empty values, and ignored client identity fields.
- Cross-manager 404s for queues and tokens.
- Waiting-list retrieval, status filters, currently serving separation, and statistics.
- Move up, move down, boundaries, invalid directions, and non-waiting tokens.
- Cancellation, double cancellation, timestamp persistence, and position normalisation.
- Token-number non-reuse after cancellation.
- Live waiting counts in queue responses.
- Deactivation guard and preserved waiting lists across deactivation/reactivation.
- Ten concurrent registrations producing unique sequential numbers and positions.
- Concurrent reorders leaving exactly one token per position.
- Refresh persistence and ownership isolation.

### Phase 3 acceptance matrix

| Scenario                       | Result                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| Register participant           | Token generated with `WAITING` status and position 1         |
| Register multiple participants | Sequential token numbers and positions                       |
| Register into inactive queue   | `409 QUEUE_INACTIVE`, no token created                       |
| Move token up                  | Position decreases; token number unchanged                   |
| Move token down                | Position increases; token number unchanged                   |
| Move first token up            | `409 TOKEN_REORDER_BOUNDARY`                                 |
| Move last token down           | `409 TOKEN_REORDER_BOUNDARY`                                 |
| Cancel waiting token           | Status `CANCELLED`, timestamp recorded, positions normalised |
| Cancel same token twice        | Second request gets `409 TOKEN_NOT_WAITING`                  |
| Refresh queue page             | Updated order reloads from PostgreSQL                        |
| Register concurrently          | No duplicate token numbers or positions                      |
| Reorder concurrently           | Positions remain unique and consistent                       |
| Access another manager's token | `404` response, no data leak                                 |

### Manual UI checks

1. Register a manager and create an active queue.
2. Add three participants and confirm the generated token, position, and toast.
3. Confirm the waiting list shows registered time, elapsed wait, and position.
4. Move the third token up and verify the order changes while its number stays the same.
5. Move the first token up and last token down; confirm disabled controls and boundary feedback.
6. Cancel a middle token; confirm the dialog, then verify positions close the gap.
7. Refresh the page and confirm statuses, numbers, order, and statistics persist.
8. Deactivate the queue; confirm Add Participant is disabled and registration is rejected.
9. Reactivate the queue and confirm existing participants are intact.
10. Open a malformed queue ID, an unknown queue ID, and another manager's queue; confirm the
    invalid, not-found, and not-found states.
11. Abort a registration request; confirm the dialog stays open with an inline error.
12. Repeat the queue workspace at mobile width and confirm there is no horizontal overflow.

### Completion checklist

- [x] Token Prisma model created
- [x] Queue–Token relationship established
- [x] Database migration completed
- [x] Sequential token generation implemented
- [x] Participant registration API completed
- [x] Queue retrieval API completed
- [x] Token reordering API completed
- [x] Token cancellation API completed
- [x] Participant registration dialog completed
- [x] Waiting queue UI completed
- [x] Reordering and cancellation integrated
- [x] Queue statistics implemented
- [x] Loading and error states handled
- [x] Concurrency and ownership tests passed

**14 / 14 complete.**

---

## 7. Phase 4 handoff

Ready to build on:

- Waiting tokens with stable positions and a queue-wide mutation lock.
- `IN_SERVICE`, `COMPLETED`, and their timestamp columns already in the schema.
- A dedicated currently-serving response slot and UI card.
- Service-start deactivation guard already enforced.
- Token statistics that include in-service and completed counts.
- A lifecycle model that only permits `WAITING → IN_SERVICE → COMPLETED` in Phase 4.
