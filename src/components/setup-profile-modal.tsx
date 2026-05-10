"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Phone, CreditCard, Loader2, Lock } from "lucide-react";
import { isValidPhone, sanitizePhoneInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

interface SetupProfileModalProps {
  hostId: string;
  hasPhone: boolean;
  hasPromptpay: boolean;
  hasPinSet: boolean;
  onComplete: () => void;
}

export function SetupProfileModal({
  hostId,
  hasPhone,
  hasPromptpay,
  hasPinSet,
  onComplete,
}: SetupProfileModalProps) {
  const t = useTranslations("setupProfile");
  const [phone, setPhone] = useState("");
  const [promptpayId, setPromptpayId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPhone = !hasPhone;
  const needsPromptpay = !hasPromptpay;
  const needsPin = !hasPinSet;
  const isOpen = needsPhone || needsPromptpay || needsPin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (needsPhone && !phone.trim()) {
      setError(t("errorPhone"));
      return;
    }
    if (needsPhone && !isValidPhone(phone)) {
      setError(t("errorInvalidPhone"));
      return;
    }
    if (needsPromptpay && !promptpayId.trim()) {
      setError(t("errorPromptpay"));
      return;
    }
    if (needsPin) {
      if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        setError(t("errorPinFormat"));
        return;
      }
      if (pin !== confirmPin) {
        setError(t("errorPinMismatch"));
        return;
      }
    }

    setLoading(true);
    try {
      // Update phone & promptpay if needed
      if (needsPhone || needsPromptpay) {
        const supabase = createClient();
        const { error: updateError } = await supabase
          .from("hosts")
          .update({
            phone: phone.trim(),
            promptpay_id: promptpayId.trim(),
          } as never)
          .eq("id", hostId);

        if (updateError) {
          setError(t("errorGeneric"));
          console.error("Profile update error:", updateError);
          return;
        }
      }

      // Set PIN if needed
      if (needsPin) {
        const pinRes = await fetch("/api/host/security-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin }),
        });
        if (!pinRes.ok) {
          const pinData = await pinRes.json();
          setError(pinData.error || t("errorGeneric"));
          return;
        }
      }

      onComplete();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={true}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {needsPhone && (
            <div className="space-y-2">
              <Label htmlFor="setup-phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {t("phone")}
              </Label>
              <Input
                id="setup-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder={t("phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                required
              />
            </div>
          )}

          {needsPromptpay && (
            <div className="space-y-2">
              <Label htmlFor="setup-promptpay" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                {t("promptpay")}
              </Label>
              <Input
                id="setup-promptpay"
                type="text"
                placeholder={t("promptpayPlaceholder")}
                value={promptpayId}
                onChange={(e) => setPromptpayId(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500">{t("promptpayHint")}</p>
            </div>
          )}

          {needsPin && (
            <>
              <div className="space-y-2">
                <Label htmlFor="setup-pin" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  {t("pin")}
                </Label>
                <Input
                  id="setup-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t("pinPlaceholder")}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
                <p className="text-xs text-gray-500">{t("pinHint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-pin-confirm" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  {t("pinConfirm")}
                </Label>
                <Input
                  id="setup-pin-confirm"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t("pinConfirmPlaceholder")}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
            </>
          )}

          <Button
            type="submit"
            className="w-full bg-brand hover:brightness-90"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
