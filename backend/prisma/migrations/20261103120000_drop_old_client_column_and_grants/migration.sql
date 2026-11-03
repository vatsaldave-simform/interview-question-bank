-- Drops the old Client column and the Grant table (ADR-0051). It runs only after the code
-- that stopped reading them has shipped. The copy into question_clients ran in
-- 20261028093126_question_clients, so nothing is lost here.

-- The foreign keys first, by name, so it is clear what each drop lets go of. Dropping the
-- column or the table would take them with it, but silently.

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_clientId_fkey";

-- DropForeignKey
ALTER TABLE "permission_grants" DROP CONSTRAINT "permission_grants_viewerId_fkey";

-- DropForeignKey
ALTER TABLE "permission_grants" DROP CONSTRAINT "permission_grants_clientId_fkey";

-- DropIndex
DROP INDEX "questions_clientId_idx";

-- AlterTable
ALTER TABLE "questions" DROP COLUMN "clientId";

-- DropTable. Nothing points at it, so no CASCADE: if something did, this should fail.
DROP TABLE "permission_grants";
