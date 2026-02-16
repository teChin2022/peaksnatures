"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OtpModalProps {
  email: string;
  onVerify: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  onClose: () => void;
  error: string | null;
  loading: boolean;
}

export default function OtpModal({
  email,
  onVerify,
  onResend,
  onClose,
  error,
  loading,
}: OtpModalProps) {
  const t = useTranslations("auth");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <Card className="w-full max-w-sm relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          disabled={loading}
        >
          <X className="h-5 w-5" />
        </button>
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <ShieldCheck className="h-7 w-7 text-green-600" />
          </div>
          <CardTitle className="text-lg">{t("otpTitle")}</CardTitle>
          <CardDescription>{t("otpDesc", { email })}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-center">
                {error}
              </div>
            )}

            <div className="flex justify-center gap-2" onPaste={handlePaste}>
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
                  className="h-12 w-11 rounded-lg border border-gray-300 text-center text-xl font-bold
                    focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20
                    disabled:opacity-50"
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={loading || digits.join("").length < 6}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("otpSubmit")}
            </Button>

            <div className="text-center">
              {resendCooldown > 0 ? (
                <p className="text-sm text-gray-400">
                  {t("otpResendIn", { seconds: resendCooldown })}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-sm font-medium text-green-600 hover:text-green-700"
                  disabled={loading}
                >
                  {t("otpResend")}
                </button>
              )}
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
