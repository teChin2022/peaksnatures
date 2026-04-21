-- RPC for aggregated admin revenue total.
-- Replaces client-side SELECT * + in-memory reduce() in /api/admin/stats,
-- which grew O(all-time-bookings) on every admin page load.

CREATE OR REPLACE FUNCTION public.get_admin_revenue_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(total_price), 0)::BIGINT
  FROM bookings
  WHERE status IN ('confirmed', 'completed');
$$;

REVOKE ALL ON FUNCTION public.get_admin_revenue_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_revenue_total() TO service_role;
