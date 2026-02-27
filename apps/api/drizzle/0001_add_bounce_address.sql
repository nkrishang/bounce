-- Add bounce_address to namespace bet metadata and trade executions by deployment.
-- Existing rows from previous (stale) deployments get the zero address sentinel.

-- 1) bet_metadata
ALTER TABLE "bet_metadata" ADD COLUMN "bounce_address" text;

UPDATE "bet_metadata"
SET "bounce_address" = '0x0000000000000000000000000000000000000000'
WHERE "bounce_address" IS NULL;

ALTER TABLE "bet_metadata" ALTER COLUMN "bounce_address" SET NOT NULL;

ALTER TABLE "bet_metadata" DROP CONSTRAINT "bet_metadata_pkey";
ALTER TABLE "bet_metadata" ADD CONSTRAINT "bet_metadata_pkey"
  PRIMARY KEY ("bounce_address", "bet_id");

CREATE INDEX "bet_metadata_bounce_condition_idx"
  ON "bet_metadata" ("bounce_address", "condition_id");

-- 2) trade_executions
ALTER TABLE "trade_executions" ADD COLUMN "bounce_address" text;

UPDATE "trade_executions"
SET "bounce_address" = '0x0000000000000000000000000000000000000000'
WHERE "bounce_address" IS NULL;

ALTER TABLE "trade_executions" ALTER COLUMN "bounce_address" SET NOT NULL;

ALTER TABLE "trade_executions" DROP CONSTRAINT "trade_executions_pkey";
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_pkey"
  PRIMARY KEY ("bounce_address", "bet_id");
