-- CreateTable
CREATE TABLE "upvotes" (
    "questionId" UUID NOT NULL,
    "viewerId" UUID NOT NULL,

    CONSTRAINT "upvotes_pkey" PRIMARY KEY ("questionId","viewerId")
);

-- AddForeignKey
ALTER TABLE "upvotes" ADD CONSTRAINT "upvotes_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upvotes" ADD CONSTRAINT "upvotes_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Here, so every Question Published today starts with its Author's Upvote (ADR-0053).
INSERT INTO upvotes("questionId", "viewerId")
SELECT id, "authorId" FROM questions
WHERE "publicationState" = 'published'
ON CONFLICT ("questionId", "viewerId")
DO NOTHING;
