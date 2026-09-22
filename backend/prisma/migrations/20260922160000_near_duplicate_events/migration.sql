-- AlterEnum
-- A refused submission and an override are their own kinds of event rather than a shape
-- of question_added, so that reading the log does not mean reading every payload first.
ALTER TYPE "ChangeEventType" ADD VALUE 'near_duplicate_refused';
ALTER TYPE "ChangeEventType" ADD VALUE 'near_duplicate_overridden';
