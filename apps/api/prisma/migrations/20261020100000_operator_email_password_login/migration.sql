-- Operators now use the email on their canonical User account and its password.
-- Existing accounts retain their username login; operators without an email must
-- have one set by an administrator before they can use the tablet sign-in.
ALTER TABLE "User" ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

DROP INDEX IF EXISTS "User_connectionKeyId_key";
ALTER TABLE "User"
    DROP COLUMN "connectionKeyId",
    DROP COLUMN "connectionKeyHash";

-- Remove the now-obsolete legacy credential hashes as well; historical production
-- records, session rows, and append-only history are otherwise preserved.
ALTER TABLE "LegacyOperatorArchive"
    DROP COLUMN "connectionKeyId",
    DROP COLUMN "connectionKeyHash";
