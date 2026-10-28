/**
 * The `hosts` columns the dashboard setup popup writes: only the ones it asked
 * for. The other may already hold a value (a phone given at registration), and
 * writing the popup's empty input over it would wipe it.
 */
export function setupProfileUpdate(f: {
  needsPhone: boolean;
  phone: string;
  needsPromptpay: boolean;
  promptpayId: string;
}) {
  return {
    ...(f.needsPhone && { phone: f.phone.trim() }),
    ...(f.needsPromptpay && { promptpay_id: f.promptpayId.trim() }),
  };
}
