"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Phone, CreditCard, Loader2 } from "lucide-react";
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
import { useThemeColor } from "@/components/dashboard/theme-context";

interface SetupProfileModalProps {
  hostId: string;
  currentPhone: string | null;
  currentPromptpay: string | null;
  onComplete: () => void;
}

export function SetupProfileModal({
  hostId,
  currentPhone,
  currentPromptpay,
  onComplete,
}: SetupProfileModalProps) {
  const t = useTranslations("setupProfile");
  const themeColor = useThemeColor();
  const [phone, setPhone] = useState(currentPhone || "");
  const [promptpayId, setPromptpayId] = useState(currentPromptpay || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPhone = !currentPhone;
  const needsPromptpay = !currentPromptpay;
  const isOpen = needsPhone || needsPromptpay;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!phone.trim()) {
      setError(t("errorPhone"));
      return;
    }
    if (!promptpayId.trim()) {
      setError(t("errorPromptpay"));
      return;
    }

    setLoading(true);
    try {
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

          <div className="space-y-2">
            <Label htmlFor="setup-phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              {t("phone")}
            </Label>
            <Input
              id="setup-phone"
              type="tel"
              placeholder={t("phonePlaceholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

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

          <Button
            type="submit"
            className="w-full hover:brightness-90"
            style={{ backgroundColor: themeColor }}
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
