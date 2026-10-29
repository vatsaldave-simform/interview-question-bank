-- CreateTable
CREATE TABLE "question_clients" (
    "questionId" UUID NOT NULL,
    "clientId" UUID NOT NULL,

    CONSTRAINT "question_clients_pkey" PRIMARY KEY ("questionId","clientId")
);

-- AddForeignKey
ALTER TABLE "question_clients" ADD CONSTRAINT "question_clients_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_clients" ADD CONSTRAINT "question_clients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Here, so the new table starts with every Client already in it (ADR-0050).
INSERT INTO question_clients("questionId", "clientId")
SELECT id, "clientId" FROM questions
WHERE "clientId" IS NOT NULL;
