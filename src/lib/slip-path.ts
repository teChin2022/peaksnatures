/**
 * The storage path of a payment slip, from what `payment_slip_url` holds: a
 * plain path ("pending/<id>/slip.jpg") or, on old rows, a full signed URL.
 * Null when there is no slip. Import-free, so client and server can share it.
 */
export function slipStoragePath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("http")) return value;
  const match = value.match(/\/payment-slips\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
