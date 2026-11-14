# Phase 2 — Queue management

**Status:** Complete  
**Scope:** Add manager-owned queues with creation, listing, details, renaming, and active/inactive
status control, plus the complete responsive queue management interface.

---

## 1. What was delivered

### Queue data model

- `QueueStatus` enum with `ACTIVE` and `INACTIVE`.
- `Queue` model with UUID primary key, 100-character name, status, timestamps, and a required
  `manager_id` foreign key.
- One-to-many `Manager.queues` relationship with `ON DELETE CASCADE` at the database level.
- Index on `(manager_id, created_at)` for the newest-first workspace listing.
- Committed migration `20261114190815_add_queue_management`.
- No token model yet; the relationship is ready for Phase 3.

### Queue API

- `POST /api/queues` — create a queue owned by the authenticated manager.
- `GET /api/queues` — list only the authenticated manager's queues, newest first.
- `GET /api/queues/:id` — read one owned queue.
- `PATCH /api/queues/:id` — rename an owned queue.
- `PATCH /api/queues/:id/status` — activate or deactivate an owned queue.
- Zod validation for queue IDs, names, and status values.
- Ownership derived exclusively from the session; client-supplied `managerId` is stripped.
- Consistent `{ success: true, data }` success envelope.
- `404 QUEUE_NOT_FOUND` for both unknown queues and queues owned by another manager.
- `400 VALIDATION_ERROR` for malformed UUIDs and invalid payloads.
- `Cache-Control: no-store` on queue responses.

### Queue management UI

- Real queue dashboard replacing the Phase 2 preview.
- Summary tiles for total, active, and inactive queues.
- Responsive queue cards with name, status, creation date, waiting count, and actions.
- Empty state with a first-queue call to action.
- Reusable create/rename dialog with:
  - Client-side Zod validation and a live character counter.
  - Server field-error mapping.
  - Inline server/network error alerts.
  - Pending states and success toasts.
- Activation and deactivation from both the listing and details page.
- Deactivation confirmation explaining that history is preserved.
- Dynamic `/queues/:id` details page with:
  - Breadcrumb navigation back to the queue list.
  - Status, creation date, update date, and queue ID metadata.
  - Currently Serving and Waiting Queue placeholders.
  - Disabled Add Participant control marked for Phase 3.
  - Loading skeletons, retry state, malformed-link state, and not-found state.
- Prominent inactive banner and inactive card treatment.
- Dashboard, sidebar, top bar, footer, auth screens, and 404 page updated to Phase 2.
- Dialog primitive extended with centered modal and mobile-sheet variants.

---

## 2. Out of scope (by design)

- Participant registration and token generation.
- Queue ordering, reordering, calling, and service completion.
- Public queue displays and real-time transport.
- Analytics backed by token history.
- Permanent queue deletion.
- Custom queue colors, locations, or capacity settings.

The details page shows honest Phase 3 placeholders rather than fabricated participant data.

---

## 3. Key decisions

| Decision                                          | Rationale                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Session-derived ownership**                     | A manager ID in the request body is never trusted; every query is scoped by the authenticated manager.                      |
| **404 for foreign queues**                        | Returning 404 instead of 403 avoids revealing whether a queue ID exists in another manager's workspace.                     |
| **Thin controllers, service-owned rules**         | Controllers only read the session and shape responses; all queue logic and ownership scoping live in `queue.service.ts`.    |
| **No permanent deletion**                         | ACTIVE/INACTIVE preserves history and avoids destructive operations; no delete endpoint is exposed.                         |
| **Deactivation currently unconditional**          | No tokens exist yet. Phase 3 must reject deactivation while a token is `IN_SERVICE` and preserve waiting tokens.            |
| **`waitingCount: 0` in Phase 2**                  | Gives the UI and API a stable shape now, and keeps the contract ready for a real token count later.                         |
| **Name normalisation**                            | Names are trimmed and internal whitespace is collapsed so accidental double spaces do not create visually duplicate queues. |
| **Newest-first listing with ID tiebreaker**       | Makes newly created queues immediately visible and keeps ordering deterministic when timestamps match.                      |
| **Small `useQueues` hook instead of React Query** | Queue state is currently one list with simple local updates; adding a query library now would be unused infrastructure.     |
| **Modal + sheet dialog variants**                 | Queue forms need centered modals on desktop while navigation still needs a left-side mobile sheet.                          |
| **`no-store` queue responses**                    | Queue data is private and changes frequently; browser caching would risk showing stale status after an update.              |

### Ownership flow

```text
Request with session cookie
      │
      ▼
requireAuth → load manager from PostgreSQL
      │
      ▼
Controller reads manager.id (never request input)
      │
      ▼
Service query: where { id: queueId, managerId: manager.id }
      │
      ├── found  → update / return queue
      └── absent → 404 QUEUE_NOT_FOUND
```

### Deactivation rule

Phase 2 has no tokens, so every deactivation is allowed. When Phase 3 introduces tokens:

1. Reject deactivation while any token is `IN_SERVICE`.
2. Preserve waiting tokens and their order.
3. Block new participant registration into `INACTIVE` queues.
4. Keep reactivation non-destructive.

The intended guard is documented in `apps/api/src/modules/queues/queue.service.ts`.

---

## 4. API contract

| Method  | Endpoint                 | Auth     | Success                                |
| ------- | ------------------------ | -------- | -------------------------------------- |
| `POST`  | `/api/queues`            | Required | `201 { success: true, data: Queue }`   |
| `GET`   | `/api/queues`            | Required | `200 { success: true, data: Queue[] }` |
| `GET`   | `/api/queues/:id`        | Required | `200 { success: true, data: Queue }`   |
| `PATCH` | `/api/queues/:id`        | Required | `200 { success: true, data: Queue }`   |
| `PATCH` | `/api/queues/:id/status` | Required | `200 { success: true, data: Queue }`   |

Public queue shape:

```json
{
  "id": "f26152d1-07a2-4c89-ad6f-3ea4f410e659",
  "name": "General Consultation",
  "status": "ACTIVE",
  "createdAt": "2026-11-15T00:00:00.000Z",
  "updatedAt": "2026-11-15T00:00:00.000Z",
  "waitingCount": 0
}
```

Errors continue to use:

```json
{ "error": { "code": "QUEUE_NOT_FOUND", "message": "Queue not found." } }
```

---

## 5. Verification performed

### Automated

```bash
npm run typecheck     # both workspaces
npm run build         # API bundle + web production build
npm test              # 36 API integration tests
npm run format:check
```

Queue integration tests cover:

- Authentication required on all five endpoints.
- Queue creation and default `ACTIVE` status.
- Whitespace trimming and internal whitespace collapsing.
- Empty, missing, and over-100-character names.
- Client-supplied `managerId` being ignored.
- Empty listing for a new manager.
- Newest-first ordering and manager isolation in listings.
- Details access for the owner.
- Cross-manager 404 on read, rename, and status changes.
- Valid-but-unknown queue IDs and malformed UUIDs.
- Rename response and `updatedAt` change.
- Empty/oversized rename payloads.
- Deactivate/reactivate round trips and rejected unsupported statuses.

### End-to-end browser check (Playwright)

1. Register a new manager at 1440×1000.
2. Open Queues and confirm the empty state.
3. Submit an empty create dialog and confirm inline validation.
4. Create two queues, refresh, and confirm both persist.
5. Rename a queue from the listing.
6. Deactivate with confirmation, then reactivate.
7. Open the details page and verify breadcrumbs, metadata, placeholders, and the disabled Add
   Participant control.
8. Rename from the details page.
9. Deactivate from details and verify the prominent inactive banner.
10. Visit a malformed ID (`/queues/not-a-uuid`) and an unknown valid UUID.
11. Send two concurrent status updates and verify both succeed idempotently.
12. Abort a create request and verify the dialog stays open with a network error.
13. Register a second manager and verify the first manager's queue returns not found.
14. Repeat the queue listing and details at 390×844, open the mobile drawer, and assert no horizontal
    overflow.
15. Capture updated screenshots; zero unexpected console errors.

---

## 6. Phase 3 handoff

Ready to build on:

- `Queue` model with a manager relationship and a natural place for a token one-to-many relation.
- Ownership-scoped queue service patterns for all subsequent token operations.
- Stable queue response shape with `waitingCount` already present.
- Queue details page with Currently Serving and Waiting Queue sections ready for real data.
- Status control that can accept the `IN_SERVICE` deactivation guard without API shape changes.
- Reusable dialog, confirmation, badge, and form patterns for token actions.

Phase 3 will add participant registration, automatic token generation, FIFO ordering, cancellation,
and the first real waiting counts.
