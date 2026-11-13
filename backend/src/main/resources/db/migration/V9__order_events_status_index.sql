-- Speeds up the email reconciliation (orders confirmed since the outbox existed, every 5 minutes): it filters order
-- events by status and time, which no index covered. Additive only: one index, no change to any row.
CREATE INDEX idx_oevent_status_created ON order_status_events (status, created_at);
