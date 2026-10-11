CREATE UNIQUE INDEX "Service_active_date_key" ON "Service" ("serviceDate") WHERE "deletedAt" IS NULL;
ALTER TABLE "Service" ADD CONSTRAINT "Service_sunday_date" CHECK (EXTRACT(DOW FROM "serviceDate") = 0);
CREATE TABLE "ReportMonth" (
 "month" TEXT PRIMARY KEY, "approvedAt" TIMESTAMP(3), "approvedBy" TEXT,
 "snapshot" JSONB, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ReportArtifact" (
 "id" TEXT PRIMARY KEY, "filename" TEXT NOT NULL, "month" TEXT NOT NULL,
 "scope" TEXT NOT NULL, "format" TEXT NOT NULL, "checksum" TEXT NOT NULL,
 "contents" BYTEA NOT NULL, "approved" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ReportArtifact_month_createdAt_idx" ON "ReportArtifact" ("month", "createdAt");
CREATE TABLE "PasswordReset" (
 "tokenHash" TEXT PRIMARY KEY, "userId" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset" ("userId");
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset" ("expiresAt");
