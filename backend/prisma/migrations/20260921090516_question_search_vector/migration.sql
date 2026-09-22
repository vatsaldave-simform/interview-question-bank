-- AlterTable
-- Hand written, because Prisma cannot express a stored generated column: it wrote a plain
-- tsvector column here and the schema declares it as Unsupported (ADR-0004). The 'english'
-- configuration has to be named, or to_tsvector is not immutable and the column is refused.
ALTER TABLE "questions" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("text", '') || ' ' || coalesce("answerNotes", ''))
  ) STORED;

-- CreateIndex
CREATE INDEX "questions_searchVector_idx" ON "questions" USING GIN ("searchVector");
