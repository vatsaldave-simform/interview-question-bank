-- CreateIndex
CREATE INDEX "question_clients_clientId_questionId_idx" ON "question_clients"("clientId", "questionId");
