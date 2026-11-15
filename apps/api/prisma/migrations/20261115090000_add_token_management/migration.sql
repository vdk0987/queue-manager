-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('WAITING', 'IN_SERVICE', 'COMPLETED', 'CANCELLED');

-- AlterTable: add the queue code and per-queue token counter.
-- The column starts nullable so existing queues can be backfilled with a stable,
-- unique prefix before the NOT NULL and UNIQUE constraints are applied.
ALTER TABLE "queues"
ADD COLUMN "code" VARCHAR(8),
ADD COLUMN "next_token_number" INTEGER NOT NULL DEFAULT 1;

UPDATE "queues"
SET "code" = 'Q' || upper(substr(md5("id"::text), 1, 6));

ALTER TABLE "queues" ALTER COLUMN "code" SET NOT NULL;

-- CreateTable
CREATE TABLE "tokens" (
    "id" UUID NOT NULL,
    "token_number" INTEGER NOT NULL,
    "position" INTEGER,
    "participant_name" VARCHAR(100) NOT NULL,
    "contact_number" VARCHAR(32),
    "notes" VARCHAR(500),
    "status" "TokenStatus" NOT NULL DEFAULT 'WAITING',
    "queue_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "service_started_at" TIMESTAMPTZ(6),
    "service_completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "queues_code_key" ON "queues"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_queue_id_token_number_key" ON "tokens"("queue_id", "token_number");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_queue_id_position_key" ON "tokens"("queue_id", "position");

-- CreateIndex
CREATE INDEX "tokens_queue_id_status_position_idx" ON "tokens"("queue_id", "status", "position");

-- CreateIndex
CREATE INDEX "tokens_queue_id_created_at_idx" ON "tokens"("queue_id", "created_at");

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
