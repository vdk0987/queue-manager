-- the single IN_SERVICE token or paginating completed/cancelled history.
CREATE INDEX "tokens_queue_id_status_idx" ON "tokens"("queue_id", "status");
