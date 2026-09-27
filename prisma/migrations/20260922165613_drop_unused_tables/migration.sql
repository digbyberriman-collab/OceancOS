/*
  Warnings:

  - You are about to drop the `CostCode` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Invoice` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseOrder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Setting` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_poId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_costCodeId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_createdById_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_supplierId_fkey";

-- The trigram search indexes from 20260922150411_search_trigram_indexes are
-- NOT dropped here, even though `prisma migrate dev` proposed doing so —
-- they're raw SQL (pg_trgm GIN indexes, outside Prisma's DSL) that its
-- schema-diff engine doesn't know about and reads as drift. Confirmed by
-- checking the diff against the actual database, not just the generated
-- SQL, before removing those DROP INDEX statements from this migration.

-- DropTable
DROP TABLE "CostCode";

-- DropTable
DROP TABLE "Invoice";

-- DropTable
DROP TABLE "PurchaseOrder";

-- DropTable
DROP TABLE "Setting";
