-- AlterEnum
ALTER TYPE "ChangeEventType" ADD VALUE 'question_published';
ALTER TYPE "ChangeEventType" ADD VALUE 'question_rejected';
ALTER TYPE "ChangeEventType" ADD VALUE 'question_resubmitted';

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "reason" TEXT;
