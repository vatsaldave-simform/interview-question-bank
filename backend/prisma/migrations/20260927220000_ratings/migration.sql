-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ratings_questionId_viewerId_key" ON "ratings"("questionId", "viewerId");

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The scale, which the Prisma schema has no way to say, so no path can store a value outside it.
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_value_on_the_scale" CHECK ("value" BETWEEN 1 AND 5);
