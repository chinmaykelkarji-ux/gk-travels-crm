-- Identity data protection (hard rule 7): sealed passport / government-ID columns.
-- Existing plaintext values cannot be encrypted in SQL (the key never reaches the
-- database); the identity.encrypt-legacy job seals them and clears the plaintext
-- after deployment. Reversible: the plaintext columns are kept until then.

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "passportNoEnc" TEXT,
ADD COLUMN     "passportNoHash" TEXT,
ADD COLUMN     "passportNoLast4" TEXT;

-- AlterTable
ALTER TABLE "passengers" ADD COLUMN     "govtIdLast4" TEXT,
ADD COLUMN     "govtIdNumberEnc" TEXT,
ADD COLUMN     "govtIdNumberHash" TEXT,
ADD COLUMN     "passportLast4" TEXT,
ADD COLUMN     "passportNumberEnc" TEXT,
ADD COLUMN     "passportNumberHash" TEXT;

-- CreateIndex
CREATE INDEX "customers_organizationId_passportNoHash_idx" ON "customers"("organizationId", "passportNoHash");

-- CreateIndex
CREATE INDEX "passengers_organizationId_passportNumberHash_idx" ON "passengers"("organizationId", "passportNumberHash");

