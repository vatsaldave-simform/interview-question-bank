-- AlterEnum
ALTER TYPE "ChangeEventType" ADD VALUE 'viewer_deactivated';
ALTER TYPE "ChangeEventType" ADD VALUE 'viewer_reactivated';

-- AlterTable
ALTER TABLE "viewers" ADD COLUMN     "isDeactivated" BOOLEAN NOT NULL DEFAULT false;
