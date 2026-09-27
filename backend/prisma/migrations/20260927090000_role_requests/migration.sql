-- CreateEnum
CREATE TYPE "RoleRequestState" AS ENUM ('open', 'granted', 'denied');

-- CreateTable
CREATE TABLE "role_requests" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "role" "ViewerRole" NOT NULL,
    "state" "RoleRequestState" NOT NULL DEFAULT 'open',
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),

    CONSTRAINT "role_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_requests_viewerId_createdAt_idx" ON "role_requests"("viewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "role_requests_one_open_per_viewer" ON "role_requests"("viewerId") WHERE ("state" = 'open');

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

