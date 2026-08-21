/*
  Warnings:

  - You are about to drop the column `targetProfileId` on the `OsintSession` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "OsintSession_targetProfileId_key";

-- AlterTable
ALTER TABLE "OsintSession" DROP COLUMN "targetProfileId";

-- AddForeignKey
ALTER TABLE "OsintSession" ADD CONSTRAINT "OsintSession_selectedCandidateId_fkey" FOREIGN KEY ("selectedCandidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
