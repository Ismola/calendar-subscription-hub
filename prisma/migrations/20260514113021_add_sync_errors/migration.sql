-- CreateTable
CREATE TABLE "SyncError" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "errorCode" TEXT,
    "stackTrace" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncError_userId_createdAt_idx" ON "SyncError"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncError_subscriptionId_createdAt_idx" ON "SyncError"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncError_expiresAt_idx" ON "SyncError"("expiresAt");

-- AddForeignKey
ALTER TABLE "SyncError" ADD CONSTRAINT "SyncError_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CalendarSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncError" ADD CONSTRAINT "SyncError_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
