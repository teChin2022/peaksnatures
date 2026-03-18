"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Loader2, Eye, EyeOff } from "lucide-react";
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

interface SecurityPinDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "verify" | "change";
  onVerified?: (pin: string) => void;
  onChanged?: () => void;
}

export function SecurityPinDialog({
  open,
  onClose,
  mode,
  onVerified,
  onChanged,
}: SecurityPinDialogProps) {
  const t = useTranslations("securityPin");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);

  const handleClose = () => {
    setPin("");
    setNewPin("");
    setConfirmNewPin("");
    setError(null);
    setShowPin(false);
    setShowNewPin(false);
    onClose();
  };

  const handleVerify = async () => {
    if (!pin || pin.length < 4) {
      setError(t("errorPinRequired"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/host/reveal-sensitive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error === "Incorrect PIN" ? t("errorIncorrectPin") : t("errorGeneric"));
        return;
      }

      const data = await res.json();
      onVerified?.(pin);
      handleClose();
      // Return the revealed data via a custom event
      window.dispatchEvent(
        new CustomEvent("pin-verified", { detail: { ...data, pin } })
      );
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async () => {
    if (!pin) {
      setError(t("errorCurrentPinRequired"));
      return;
    }
    if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      setError(t("errorNewPinFormat"));
      return;
    }
    if (newPin !== confirmNewPin) {
      setError(t("errorPinMismatch"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/host/security-pin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: pin, newPin }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(
          data.error === "Current PIN is incorrect"
            ? t("errorIncorrectPin")
            : t("errorGeneric")
        );
        return;
      }

      onChanged?.();
      handleClose();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {mode === "verify" ? t("verifyTitle") : t("changeTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "verify" ? t("verifyDesc") : t("changeDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="security-pin" className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" />
              {mode === "verify" ? t("enterPin") : t("currentPin")}
            </Label>
            <div className="relative">
              <Input
                id="security-pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={6}
                placeholder={t("pinPlaceholder")}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPin(!showPin)}
                tabIndex={-1}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {mode === "change" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-security-pin" className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5" />
                  {t("newPin")}
                </Label>
                <div className="relative">
                  <Input
                    id="new-security-pin"
                    type={showNewPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={t("newPinPlaceholder")}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowNewPin(!showNewPin)}
                    tabIndex={-1}
                  >
                    {showNewPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-new-security-pin" className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5" />
                  {t("confirmNewPin")}
                </Label>
                <Input
                  id="confirm-new-security-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t("confirmNewPinPlaceholder")}
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
            </>
          )}

          <Button
            onClick={mode === "verify" ? handleVerify : handleChange}
            disabled={loading}
            className="w-full bg-brand hover:brightness-90"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            {mode === "verify" ? t("unlock") : t("changePin")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
