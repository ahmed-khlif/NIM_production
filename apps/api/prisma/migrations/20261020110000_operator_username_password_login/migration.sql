-- Operator login uses the existing User username and password; email is not an identity field.
ALTER TABLE "User" DROP COLUMN "email";
