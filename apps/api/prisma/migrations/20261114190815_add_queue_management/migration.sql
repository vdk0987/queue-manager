-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "queues" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'ACTIVE',
    "manager_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "queues_manager_id_created_at_idx" ON "queues"("manager_id", "created_at");

-- AddForeignKey
ALTER TABLE "queues" ADD CONSTRAINT "queues_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
