-- AlterTable
ALTER TABLE "SessionTask" ADD COLUMN     "chargedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SessionTask_status_startedAt_idx" ON "SessionTask"("status", "startedAt");
