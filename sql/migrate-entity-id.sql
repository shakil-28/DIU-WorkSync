-- Migration: widen entity_id to BIGINT
ALTER TABLE activity_logs MODIFY COLUMN entity_id BIGINT;
