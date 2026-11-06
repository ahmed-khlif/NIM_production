-- Import files are processed in memory. Remove stored import metadata while
-- leaving imported pieces and append-only HistoryEvent records untouched.
DROP TABLE IF EXISTS "ImportBatch";
DROP TYPE IF EXISTS "ImportBatchStatus";
