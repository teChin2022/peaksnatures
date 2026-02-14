"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { User, Phone, CreditCard, Mail, MessageCircle, Loader2, Save, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useThemeColor } from "@/components/dashboard/theme-context";

interface HostData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  line_user_id: string | null;
  line_channel_access_token: string | null;
  promptpay_id: string;
}

export default function ProfilePage() {
  const t = useTranslations("dashboardProfile");
  const themeColor = useThemeColor();
  const [host, setHost] = useState<HostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lineUserId, setLineUserId] = useState("");
  const [lineChannelToken, setLineChannelToken] = useState("");
  const [promptpayId, setPromptpayId] = useState("");

  useEffect(() => {
    const fetchHost = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("hosts")
        .select("id, name, email, phone, line_user_id, line_channel_access_token, promptpay_id")
        .eq("user_id", user.id)
        .single();

      if (data) {
        const h = data as HostData;
        setHost(h);
        setName(h.name);
        setEmail(h.email);
        setPhone(h.phone || "");
        setLineUserId(h.line_user_id || "");
        setLineChannelToken(h.line_channel_access_token || "");
        setPromptpayId(h.promptpay_id);
      }
      setLoading(false);
    };
    fetchHost();
  }, []);

  const handleSave = async () => {
    if (!host) return;
    if (!name.trim() || !email.trim() || !promptpayId.trim()) {
      toast.error(t("errorRequired"));
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("hosts")
        .update({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          line_user_id: lineUserId.trim() || null,
          line_channel_access_token: lineChannelToken.trim() || null,
          promptpay_id: promptpayId.trim(),
        } as never)
        .eq("id", host.id);

      if (error) {
        toast.error(t("errorSave"));
        console.error("Update host error:", error);
        return;
      }

      toast.success(t("saved"));
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Skeleton className="h-7 w-40 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
            <Skeleton className="h-10 w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!host) {
    return (
      <div className="py-20 text-center text-sm text-gray-500">
        {t("noHost")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            {t("ownerInfo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="host-name" className="flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              {t("name")}
            </Label>
            <Input
              id="host-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="host-email" className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              {t("email")}
            </Label>
            <Input
              id="host-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="host-phone" className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              {t("phone")}
            </Label>
            <Input
              id="host-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("phonePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="host-line-user-id" className="flex items-center gap-2">
              <MessageCircle className="h-3.5 w-3.5" />
              {t("lineUserId")}
            </Label>
            <Input
              id="host-line-user-id"
              value={lineUserId}
              onChange={(e) => setLineUserId(e.target.value)}
              placeholder={t("lineUserIdPlaceholder")}
            />
            <p className="text-xs text-gray-500">{t("lineUserIdHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="host-line-token" className="flex items-center gap-2">
              <Key className="h-3.5 w-3.5" />
              {t("lineChannelToken")}
            </Label>
            <Input
              id="host-line-token"
              type="password"
              value={lineChannelToken}
              onChange={(e) => setLineChannelToken(e.target.value)}
              placeholder={t("lineChannelTokenPlaceholder")}
            />
            <p className="text-xs text-gray-500">{t("lineChannelTokenHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="host-promptpay" className="flex items-center gap-2">
              <CreditCard className="h-3.5 w-3.5" />
              {t("promptpay")}
            </Label>
            <Input
              id="host-promptpay"
              value={promptpayId}
              onChange={(e) => setPromptpayId(e.target.value)}
              placeholder={t("promptpayPlaceholder")}
            />
            <p className="text-xs text-gray-500">{t("promptpayHint")}</p>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full hover:brightness-90"
            style={{ backgroundColor: themeColor }}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
