-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SessionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
