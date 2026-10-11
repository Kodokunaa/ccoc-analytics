-- CreateTable
CREATE TABLE "GoogleViewer" (
    "id" TEXT NOT NULL,
    "googleSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleViewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleViewerSession" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleViewerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicExportLog" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleViewer_googleSubject_key" ON "GoogleViewer"("googleSubject");

-- CreateIndex
CREATE INDEX "GoogleViewerSession_viewerId_idx" ON "GoogleViewerSession"("viewerId");

-- CreateIndex
CREATE INDEX "PublicExportLog_createdAt_viewerId_idx" ON "PublicExportLog"("createdAt", "viewerId");

-- AddForeignKey
ALTER TABLE "GoogleViewerSession" ADD CONSTRAINT "GoogleViewerSession_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "GoogleViewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicExportLog" ADD CONSTRAINT "PublicExportLog_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "GoogleViewer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
