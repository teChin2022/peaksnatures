-- ============================================================
-- 056: Fixed-Rate Plan Multi-Month Terms with Volume Discounts
-- Adds admin-configurable subscription tiers (months + discount_pct),
-- per-host current term tracking, and per-invoice term metadata.
-- ============================================================

-- 1. Admin-configurable tier list on the singleton billing config.
--    Stored as JSONB so admins can add/edit/remove arbitrary durations
--    (1, 3, 6, 12 by default — but 2, 4, 5, 7… all allowed).
ALTER TABLE platform_billing_config
  ADD COLUMN IF NOT EXISTS fixed_rate_term_tiers JSONB NOT NULL DEFAULT
    '[
       {"months": 1,  "discount_pct": 0},
       {"months": 3,  "discount_pct": 0},
       {"months": 6,  "discount_pct": 8},
       {"months": 12, "discount_pct": 15}
     ]'::jsonb;

-- 2. Per-host current term + pending term (for scheduled paid→fixed_rate switches).
ALTER TABLE hosts
  ADD COLUMN IF NOT EXISTS fixed_rate_term_months INTEGER DEFAULT NULL
    CHECK (fixed_rate_term_months IS NULL OR (fixed_rate_term_months BETWEEN 1 AND 60)),
  ADD COLUMN IF NOT EXISTS fixed_rate_term_started_at DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fixed_rate_term_ends_at DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_pending_term_months INTEGER DEFAULT NULL
    CHECK (plan_pending_term_months IS NULL OR (plan_pending_term_months BETWEEN 1 AND 60));

-- 3. Per-invoice term metadata (so a paid invoice records the term & discount used).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS term_months INTEGER NOT NULL DEFAULT 1
    CHECK (term_months BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00;
