-- Phase 5: analytics foundation.
--
-- * queues.timezone gives every queue a local calendar for date grouping.
-- * queue_activities is an append-only event log used to reconstruct historical
--   waiting counts (the current waiting list alone cannot answer "how long was
--   the line at 10:00 yesterday?").
--
-- Existing tokens are backfilled so trends start from a correct baseline:
--   TOKEN_CREATED      +1
--   SERVICE_STARTED    -1
--   SERVICE_COMPLETED   0
--   TOKEN_CANCELLED    -1

ALTER TABLE "queues"
ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC';

CREATE TABLE "queue_activities" (
    "id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "token_id" UUID,
    "event_type" VARCHAR(40) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "queue_activities_queue_id_created_at_idx"
ON "queue_activities"("queue_id", "created_at");

CREATE INDEX "queue_activities_queue_id_event_type_idx"
ON "queue_activities"("queue_id", "event_type");

CREATE INDEX "queue_activities_token_id_idx"
ON "queue_activities"("token_id");

ALTER TABLE "queue_activities"
ADD CONSTRAINT "queue_activities_queue_id_fkey"
FOREIGN KEY ("queue_id") REFERENCES "queues"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill one event per known lifecycle transition. Events are ordered by
-- their original persisted timestamps, not by migration time.
INSERT INTO "queue_activities" ("id", "queue_id", "token_id", "event_type", "metadata", "created_at")
SELECT gen_random_uuid(), "queue_id", "id", 'TOKEN_CREATED', '{"backfilled": true}'::jsonb, "created_at"
FROM "tokens";

INSERT INTO "queue_activities" ("id", "queue_id", "token_id", "event_type", "metadata", "created_at")
SELECT gen_random_uuid(), "queue_id", "id", 'SERVICE_STARTED', '{"backfilled": true}'::jsonb, "service_started_at"
FROM "tokens"
WHERE "service_started_at" IS NOT NULL;

INSERT INTO "queue_activities" ("id", "queue_id", "token_id", "event_type", "metadata", "created_at")
SELECT gen_random_uuid(), "queue_id", "id", 'SERVICE_COMPLETED', '{"backfilled": true}'::jsonb, "service_completed_at"
FROM "tokens"
WHERE "service_completed_at" IS NOT NULL;

INSERT INTO "queue_activities" ("id", "queue_id", "token_id", "event_type", "metadata", "created_at")
SELECT gen_random_uuid(), "queue_id", "id", 'TOKEN_CANCELLED', '{"backfilled": true}'::jsonb, "cancelled_at"
FROM "tokens"
WHERE "cancelled_at" IS NOT NULL;
