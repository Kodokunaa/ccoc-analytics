-- CreateIndex
CREATE INDEX "LoginAttempt_expiresAt_idx" ON "LoginAttempt"("expiresAt");

-- CreateIndex
CREATE INDEX "Service_deletedAt_serviceDate_idx" ON "Service"("deletedAt", "serviceDate");
