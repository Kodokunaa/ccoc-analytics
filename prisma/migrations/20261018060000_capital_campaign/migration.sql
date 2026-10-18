CREATE TABLE "CapitalCampaignEntry" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapitalCampaignEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CapitalCampaignEntry_month_check" CHECK ("month" IS NULL OR "month" BETWEEN 1 AND 12),
    CONSTRAINT "CapitalCampaignEntry_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX "CapitalCampaignEntry_year_month_idx" ON "CapitalCampaignEntry"("year", "month");
