-- Trigram matching, which near-duplicate detection measures similarity with. Hand
-- written, because an extension is not something the Prisma schema can ask for.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
-- GiST rather than GIN: only GiST can answer "the closest few to this text", which is
-- the ordering detection reads (ADR-0004).
CREATE INDEX "questions_text_idx" ON "questions" USING GIST ("text" gist_trgm_ops);
