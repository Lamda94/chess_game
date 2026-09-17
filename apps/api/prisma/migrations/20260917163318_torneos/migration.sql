-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SWISS', 'ARENA', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'FINISHED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "tournamentId" TEXT;

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" "TournamentFormat" NOT NULL,
    "category" "Category" NOT NULL,
    "initialSec" INTEGER NOT NULL,
    "incrementSec" INTEGER NOT NULL,
    "rounds" INTEGER,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "durationMin" INTEGER,
    "status" "TournamentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "minRating" INTEGER,
    "maxRating" INTEGER,
    "maxPlayers" INTEGER,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "joinCode" TEXT,
    "halfPointBye" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "games" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "seedRating" INTEGER NOT NULL,
    "withdrawn" BOOLEAN NOT NULL DEFAULT false,
    "eliminated" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPairing" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "board" INTEGER NOT NULL,
    "whiteId" TEXT,
    "blackId" TEXT,
    "gameId" TEXT,
    "result" "GameResult",
    "isBye" BOOLEAN NOT NULL DEFAULT false,
    "byeUserId" TEXT,

    CONSTRAINT "TournamentPairing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_joinCode_key" ON "Tournament"("joinCode");

-- CreateIndex
CREATE INDEX "Tournament_status_startsAt_idx" ON "Tournament"("status", "startsAt");

-- CreateIndex
CREATE INDEX "TournamentEntry_tournamentId_score_idx" ON "TournamentEntry"("tournamentId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEntry_tournamentId_userId_key" ON "TournamentEntry"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPairing_gameId_key" ON "TournamentPairing"("gameId");

-- CreateIndex
CREATE INDEX "TournamentPairing_tournamentId_round_idx" ON "TournamentPairing"("tournamentId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPairing_tournamentId_round_board_key" ON "TournamentPairing"("tournamentId", "round", "board");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPairing" ADD CONSTRAINT "TournamentPairing_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPairing" ADD CONSTRAINT "TournamentPairing_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
