"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OtpModalProps {
  email: string;
  onVerify: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  onClose: () => void;
  error: string | null;
  loading: boolean;
  /** Where focus goes when the dialog closes. Radix would return it to the opener, but Sign In was disabled while sending, so it would land on <body>. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export default function OtpModal({
  email,
  onVerify,
  onResend,
  onClose,
  error,
  loading,
  returnFocusRef,
}: OtpModalProps) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // A new error means the code was refused: clear it so the next one can be typed straight in.
  // Set during render (React's "adjusting state when a prop changes"), not in an effect.
  const [seenError, setSeenError] = useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error) setDigits(["", "", "", "", "", ""]);
  }
  // The fields were disabled while checking, which dropped focus; give it back once they are enabled.
  useEffect(() => {
    if (error && !loading) inputRefs.current[0]?.focus();
  }, [error, loading]);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      // Only allow digits
      const digit = value.replace(/\D/g, "").slice(-1);
      const newDigits = [...digits];
      newDigits[index] = digit;
      setDigits(newDigits);

      // Auto-focus next input
      if (digit && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

      // Auto-submit when all 6 digits are filled
      if (digit && index === 5) {
        const code = newDigits.join("");
        if (code.length === 6) {
          onVerify(code);
        }
      }
    },
    [digits, onVerify]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      if (pasted.length === 0) return;

      const newDigits = [...digits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || "";
      }
      setDigits(newDigits);

      // Focus last filled input or submit
      const lastIndex = Math.min(pasted.length, 6) - 1;
      inputRefs.current[lastIndex]?.focus();

      if (pasted.length === 6) {
        onVerify(pasted);
      }
    },
    [digits, onVerify]
  );

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setDigits(["", "", "", "", "", ""]);
    setResendCooldown(60);
    await onResend();
    inputRefs.current[0]?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join("");
    if (code.length === 6) {
      onVerify(code);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        // Portalled to <body>, outside any page-level lang (the English /admin/login sits on a Thai <html>).
        lang={locale}
        className="gap-5 sm:max-w-sm"
        // A stray tap beside the dialog must not throw away the code step; Escape and the X still close it.
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRefs.current[0]?.focus();
        }}
        onCloseAutoFocus={(e) => {
          if (!returnFocusRef?.current) return;
          e.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
            <ShieldCheck className="h-7 w-7 text-brand" aria-hidden="true" />
          </div>
          <DialogTitle>{t("otpTitle")}</DialogTitle>
          <DialogDescription className="text-earth-600">{t("otpDesc", { email })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-center">
                {error}
              </div>
            )}

            {/* gap-1.5: six 44px fields fit the 295px a 375px phone leaves inside the dialog. */}
            <div className="flex justify-center gap-1.5 sm:gap-2" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={loading}
                  aria-label={t("otpDigit", { n: i + 1 })}
                  className="h-12 w-11 rounded-lg border border-input text-center text-xl font-bold text-earth-900
                    outline-none focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand
                    disabled:opacity-50"
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            <Button
              type="submit"
              className="w-full bg-brand hover:bg-brand-hover"
              disabled={loading || digits.join("").length < 6}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("otpSubmit")}
            </Button>

            <div className="text-center">
              {resendCooldown > 0 ? (
                <p className="text-sm text-earth-600">
                  {t("otpResendIn", { seconds: resendCooldown })}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="rounded-sm text-sm font-medium text-brand hover:text-brand-hover outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  disabled={loading}
                >
                  {t("otpResend")}
                </button>
              )}
            </div>
          </div>
        </form>
        {/* Last in the DOM so Tab runs digits, Verify, Resend, then Close. */}
        <DialogClose
          aria-label={tc("close")}
          disabled={loading}
          className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full text-earth-600 transition-colors hover:bg-earth-100 hover:text-earth-900 outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
