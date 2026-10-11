CREATE TABLE "ManusReportTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "month" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATING',
  "createdBy" TEXT NOT NULL,
  "remoteId" TEXT,
  "remoteUrl" TEXT,
  "payload" JSONB NOT NULL,
  "output" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ManusReportTask_month_createdAt_idx" ON "ManusReportTask"("month", "createdAt");
CREATE UNIQUE INDEX "ManusReportTask_active_month" ON "ManusReportTask"("month") WHERE "status" IN ('CREATING', 'UNKNOWN', 'RUNNING', 'WAITING');
