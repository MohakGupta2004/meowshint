-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DISAMBIGUATION', 'ENRICHING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'RUNNING', 'FOUND', 'NOT_FOUND', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WEB_SEARCH', 'INSTAGRAM', 'LINKEDIN', 'GITHUB', 'TWITCH', 'YOUTUBE', 'TIKTOK', 'PINTEREST', 'LINKTREE');

-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('GRANT', 'SCRAPE', 'WEB_SEARCH', 'PREMIUM_QUERY', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('MD', 'CSV', 'PDF');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "creditBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfaBackupCodes" TEXT[],
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT,
ADD COLUMN     "mfaVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OsintSession" (
    "id" TEXT NOT NULL,
    "agentId" INTEGER NOT NULL,
    "query" TEXT NOT NULL,
    "queryContext" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'DISAMBIGUATION',
    "selectedCandidateId" TEXT,
    "targetProfileId" TEXT,
    "platforms" "Platform"[],
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "failedTasks" INTEGER NOT NULL DEFAULT 0,
    "creditsSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "OsintSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "snippet" TEXT,
    "sourceUrl" TEXT,
    "location" TEXT,
    "handles" JSONB,
    "score" DOUBLE PRECISION,
    "rank" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetProfile" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "knownAliases" TEXT[],
    "primaryEmail" TEXT,
    "emails" TEXT[],
    "associatedPhoneNumbers" TEXT[],
    "locationLabel" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "avatarImageArchive" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTask" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "creditCost" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SessionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebSearchResult" (
    "taskId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "engine" TEXT,
    "totalResults" INTEGER,
    "results" JSONB NOT NULL,
    "discoveredHandles" JSONB,
    "summaryText" TEXT
);

-- CreateTable
CREATE TABLE "InstagramResult" (
    "taskId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT,
    "biography" TEXT,
    "followers" INTEGER,
    "following" INTEGER,
    "postCount" INTEGER,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "externalUrl" TEXT,
    "extractedEmails" TEXT[],
    "extractedPhones" TEXT[],
    "summaryText" TEXT,
    "raw" JSONB
);

-- CreateTable
CREATE TABLE "LinkedInResult" (
    "taskId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "fullName" TEXT,
    "headline" TEXT,
    "currentCompany" TEXT,
    "currentTitle" TEXT,
    "location" TEXT,
    "about" TEXT,
    "experience" JSONB,
    "education" JSONB,
    "skills" TEXT[],
    "connections" INTEGER,
    "avatarUrl" TEXT,
    "summaryText" TEXT,
    "raw" JSONB
);

-- CreateTable
CREATE TABLE "SocialProfileResult" (
    "taskId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "followers" INTEGER,
    "following" INTEGER,
    "itemCount" INTEGER,
    "avatarUrl" TEXT,
    "profileUrl" TEXT,
    "socials" JSONB,
    "summaryText" TEXT,
    "raw" JSONB
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "agentId" INTEGER NOT NULL,
    "sessionId" TEXT,
    "taskId" TEXT,
    "amount" INTEGER NOT NULL,
    "kind" "CreditKind" NOT NULL,
    "platform" "Platform",
    "reason" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "filePath" TEXT,
    "content" TEXT,
    "checksum" TEXT,
    "sizeBytes" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OsintSession_selectedCandidateId_key" ON "OsintSession"("selectedCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "OsintSession_targetProfileId_key" ON "OsintSession"("targetProfileId");

-- CreateIndex
CREATE INDEX "OsintSession_agentId_createdAt_idx" ON "OsintSession"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "OsintSession_status_idx" ON "OsintSession"("status");

-- CreateIndex
CREATE INDEX "Candidate_sessionId_idx" ON "Candidate"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TargetProfile_sessionId_key" ON "TargetProfile"("sessionId");

-- CreateIndex
CREATE INDEX "SessionTask_status_idx" ON "SessionTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTask_sessionId_platform_key" ON "SessionTask"("sessionId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "WebSearchResult_taskId_key" ON "WebSearchResult"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramResult_taskId_key" ON "InstagramResult"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInResult_taskId_key" ON "LinkedInResult"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialProfileResult_taskId_key" ON "SocialProfileResult"("taskId");

-- CreateIndex
CREATE INDEX "CreditTransaction_agentId_createdAt_idx" ON "CreditTransaction"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_sessionId_idx" ON "CreditTransaction"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_sessionId_format_key" ON "Report"("sessionId", "format");

-- AddForeignKey
ALTER TABLE "OsintSession" ADD CONSTRAINT "OsintSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OsintSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetProfile" ADD CONSTRAINT "TargetProfile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OsintSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTask" ADD CONSTRAINT "SessionTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OsintSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSearchResult" ADD CONSTRAINT "WebSearchResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SessionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramResult" ADD CONSTRAINT "InstagramResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SessionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInResult" ADD CONSTRAINT "LinkedInResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SessionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialProfileResult" ADD CONSTRAINT "SocialProfileResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SessionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OsintSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OsintSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
