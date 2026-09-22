-- CreateEnum
CREATE TYPE "ChangeEventType" AS ENUM ('question_added', 'question_edited');

-- CreateTable
CREATE TABLE "change_events" (
    "id" UUID NOT NULL,
    "questionId" UUID,
    "viewerId" UUID NOT NULL,
    "type" "ChangeEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_events_questionId_createdAt_idx" ON "change_events"("questionId", "createdAt");

-- AddForeignKey
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The append-only rule, made structural. Hand written, because a trigger is not
-- something the Prisma schema can say (ADR-0027).
CREATE FUNCTION refuse_to_rewrite_a_change_event() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'change_events is append-only, so % is refused.', TG_OP;
END;
$$;

CREATE TRIGGER change_events_are_append_only
  BEFORE UPDATE OR DELETE ON "change_events"
  FOR EACH ROW EXECUTE FUNCTION refuse_to_rewrite_a_change_event();
