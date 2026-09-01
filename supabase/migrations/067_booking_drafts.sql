-- ============================================================================
-- Booking drafts: resume an abandoned booking with phone + email.
--
-- THE PROBLEM
-- A guest reaches step 3 (PromptPay QR), switches to their banking app to make
-- the transfer, and never returns to the tab. Backgrounded or killed by iOS
-- memory pressure, HoldCountdown's interval is frozen, so handleHoldExpired
-- never runs and DELETE /api/bookings/hold never fires. Re-booking already
-- works (049's same-phone takeover reclaims their own hold) but only after
-- retyping all of step 1 and step 2. This table removes the retyping.
--
-- WHY NOT booking_holds
-- booking_holds is a 10-minute inventory LOCK. acquire_booking_hold runs
--   DELETE FROM booking_holds WHERE room_id = p_room_id AND expires_at <= NOW()
-- scoped by room_id ONLY -- not by dates, not by session. So ANY guest
-- attempting that house destroys an abandoning guest's row, and a draft stored
-- there would survive in inverse proportion to how popular the house is.
-- It is also the wrong grain (guest fields are cart-wide, holds are per-house),
-- the wrong key ((room, session, dates) vs (homestay, phone, email) -- a
-- restore uses a NEW session id, so a re-save would insert rather than update),
-- and it has no homestay_id. See 049 for the same-phone takeover this table
-- deliberately does NOT replace: the two cooperate.
--
-- PRIVACY
-- This holds name, email, phone, province and a free-text note for a guest who
-- never completed a booking -- the highest-PII, lowest-value data in the
-- product. Hence: no RLS policies at all (service-role only), a
-- host-configurable TTL stamped at write time, a nightly capped sweep, and a
-- hard 7-day ceiling independent of any setting.
-- ============================================================================

-- 1) Per-host retention. 0 disables the feature for that host: nothing is
-- written and nothing is returned. Same idiom as cancellation_days = 0
-- disabling guest cancellation (024).
ALTER TABLE hosts
  ADD COLUMN IF NOT EXISTS booking_draft_hours INTEGER NOT NULL DEFAULT 24;

ALTER TABLE hosts
  ADD CONSTRAINT hosts_booking_draft_hours_range
  CHECK (booking_draft_hours >= 0 AND booking_draft_hours <= 168);

COMMENT ON COLUMN hosts.booking_draft_hours IS
  'How long an unfinished booking stays restorable by phone + email, in hours. 0 = feature off for this host. Capped at 168 (7 days) to match the absolute ceiling in prune_booking_drafts, so the setting and the sweep can never disagree.';

-- 2) The draft itself.
CREATE TABLE booking_drafts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  guest_phone TEXT NOT NULL CHECK (guest_phone ~ '^[0-9]{10}$'),
  guest_email TEXT NOT NULL,
  check_in    DATE NOT NULL,
  check_out   DATE NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  expires_at  TIMESTAMPTZ NOT NULL,
  -- Audit quartet per 027, which added created_by/updated_by
  -- (TEXT NOT NULL DEFAULT 'system') across every table. The guest booking path
  -- writes the guest's name (src/app/api/bookings/route.ts), so this does too.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT NOT NULL DEFAULT 'system',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT booking_drafts_dates_ordered CHECK (check_out > check_in)
);

COMMENT ON TABLE booking_drafts IS
  'One unfinished booking per (homestay, phone, email). Written by POST /api/bookings/draft at the step 2 -> 3 transition, read by POST /api/bookings/draft/lookup, deleted on successful booking and by the nightly sweep. Never a source of price or availability truth.';
COMMENT ON COLUMN booking_drafts.guest_phone IS
  'Digits-only, 10 chars. Normalised server-side with the same rule as sanitizePhoneInput() in src/lib/utils.ts, which is also what booking_holds.guest_phone stores -- the two must match exactly or 049 same-phone takeover will not fire on restore.';
COMMENT ON COLUMN booking_drafts.guest_email IS
  'Trimmed + lowercased. Half of the lookup key: phone alone is guessable, phone plus the matching email is not. Matches the .toLowerCase() comparison convention in pay-balance and checkin.';
COMMENT ON COLUMN booking_drafts.payload IS
  'The rest of the form snapshot (guest name/province/note, cart lines, promo CODE, payment option, subtotal at save). Deliberately schemaless: the shape follows the booking form, which changes often, and every extra PII column is another thing to remember to purge. Versioned by payload->>''v'', typed in src/lib/booking-draft.ts.';
COMMENT ON COLUMN booking_drafts.expires_at IS
  'Stamped at write time from the host''s booking_draft_hours. Stamping rather than joining hosts at read/purge time keeps the lookup filter and the sweep predicate identical, so "invisible" and "deleted" can never disagree.';

-- The lookup predicate AND the ON CONFLICT target -- identical by design.
CREATE UNIQUE INDEX idx_booking_drafts_lookup
  ON booking_drafts(homestay_id, guest_phone, guest_email);
CREATE INDEX idx_booking_drafts_expires_at ON booking_drafts(expires_at);

-- 3) RLS on, ZERO policies. Every read, write and purge uses the service-role
-- client, which bypasses RLS. Do NOT copy booking_holds' "Anyone can view a
-- hold" policy from 007 -- 049 had to drop it precisely because it exposed
-- phone numbers to anyone holding the anon key. There is deliberately no host
-- SELECT policy either (unlike demand_events): no feature asks hosts to browse
-- abandoned guests' contact details.
ALTER TABLE booking_drafts ENABLE ROW LEVEL SECURITY;

-- 027's shared trigger function keeps updated_at honest.
CREATE TRIGGER trg_booking_drafts_updated_at
  BEFORE UPDATE ON booking_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4) Lowering the setting applies retroactively; raising it does not.
-- This MUST be a trigger: src/app/dashboard/homestay/page.tsx writes hosts
-- directly from the BROWSER client, which by design has no access to
-- booking_drafts. A trigger also covers the admin route and any future writer.
--
-- SECURITY DEFINER is load-bearing, not decoration. The only writer of
-- booking_draft_hours is the dashboard (src/app/dashboard/homestay/page.tsx),
-- which uses the BROWSER client and therefore runs as `authenticated`. A
-- SECURITY INVOKER trigger would inherit that role and hit booking_drafts --
-- RLS enabled, zero policies -- so the DELETE and UPDATE below would match zero
-- rows and report success. Setting retention to 0 would silently keep every
-- draft while telling the host their guests' details had been deleted.
-- search_path is pinned above, which is the companion requirement.
CREATE OR REPLACE FUNCTION clamp_booking_drafts_on_host_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.booking_draft_hours IS NOT DISTINCT FROM OLD.booking_draft_hours THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_draft_hours <= 0 THEN
    DELETE FROM booking_drafts d
    USING homestays h
    WHERE d.homestay_id = h.id AND h.host_id = NEW.id;
  ELSE
    -- LEAST plus the WHERE guard: shortening the window shortens existing
    -- drafts, lengthening it never resurrects PII the guest was promised a
    -- shorter life for.
    UPDATE booking_drafts d
    SET expires_at = LEAST(d.expires_at,
                           d.created_at + make_interval(hours => NEW.booking_draft_hours))
    FROM homestays h
    WHERE d.homestay_id = h.id
      AND h.host_id = NEW.id
      AND d.expires_at > d.created_at + make_interval(hours => NEW.booking_draft_hours);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clamp_booking_drafts_on_host_change() FROM PUBLIC;

-- AFTER UPDATE OF fires whenever the column is MENTIONED, even if unchanged, and
-- the dashboard sends it on every homestay save -- hence the early return on
-- IS NOT DISTINCT FROM. No other hosts writer names this column (checked: the
-- plan, wallet, verify, approve, rate-override and security-pin routes all send
-- explicit field lists, none spreads a whole row).
CREATE TRIGGER trg_hosts_clamp_booking_drafts
  AFTER UPDATE OF booking_draft_hours ON hosts
  FOR EACH ROW EXECUTE FUNCTION clamp_booking_drafts_on_host_change();

-- 5) Retention sweep. Capped so that shortening a window can never turn one
-- nightly run into a table-wide delete -- it just takes a few more nights to
-- drain. Same shape and reasoning as prune_demand_events (065). The created_at
-- ceiling is a belt-and-braces PDPA cap that holds even if a writer stamps a
-- bad expires_at.
CREATE OR REPLACE FUNCTION prune_booking_drafts(p_limit INT DEFAULT 5000)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH doomed AS (
    SELECT id FROM booking_drafts
    WHERE expires_at < NOW()
       OR created_at < NOW() - INTERVAL '7 days'
    LIMIT GREATEST(p_limit, 1)
  )
  DELETE FROM booking_drafts d USING doomed WHERE d.id = doomed.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_booking_drafts(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_booking_drafts(INT) TO service_role;

COMMENT ON FUNCTION prune_booking_drafts(INT) IS
  'Deletes expired drafts, capped per run. Called from the daily billing cron. Correctness does NOT depend on this running: every read filters expires_at > NOW(), so a late sweep costs retention, never a wrong answer.';
