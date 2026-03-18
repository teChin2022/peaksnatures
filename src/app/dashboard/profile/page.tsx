"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { User, Phone, CreditCard, Mail, MessageCircle, Loader2, Save, Key, Lock, Eye, EyeOff, Bell, BellOff, Trash2, AlertTriangle, ShieldCheck, Unlock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { logClientEvent } from "@/lib/history-log-client";

import { isPushSupported, isPushSubscribed, subscribeHostToPush, unsubscribeFromPush } from "@/lib/push-notifications";
import { SecurityPinDialog } from "@/components/security-pin-dialog";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return local.charAt(0) + "***@" + domain;
}

function maskPhone(phone: string): string {
  if (phone.length < 4) return "***";
  return phone.slice(0, 2) + "x-xxx-x" + phone.slice(-3);
}

function maskPromptpay(id: string): string {
  if (id.length < 4) return "***";
  return "x-xxxx-xx" + id.slice(-3);
}

const MONTH_KEYS = ["1","2","3","4","5","6","7","8","9","10","11","12"] as const;

interface HostData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  line_user_id: string | null;
  line_channel_access_token: string | null;
  promptpay_id: string;
  deposit_amount: number;
  deposit_by_month: Record<string, number> | null;
  cancellation_days: number;
  notification_preference: string;
}

export default function ProfilePage() {
  const t = useTranslations("dashboardProfile");
  const router = useRouter();
  const [host, setHost] = useState<HostData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lineUserId, setLineUserId] = useState("");
  const [lineChannelToken, setLineChannelToken] = useState("");
  const [lineTokenMasked, setLineTokenMasked] = useState(false);
  const [promptpayId, setPromptpayId] = useState("");
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositByMonth, setDepositByMonth] = useState<Record<string, number>>({});
  const [cancellationDays, setCancellationDays] = useState(0);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [notificationPreference, setNotificationPreference] = useState("push");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [togglingPush, setTogglingPush] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState<"verify" | "change">("verify");
  const [hasPinSet, setHasPinSet] = useState(false);

  useEffect(() => {
    const fetchHost = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("hosts")
        .select("id, name, email, phone, line_user_id, line_channel_access_token, promptpay_id, deposit_amount, deposit_by_month, cancellation_days, notification_preference, security_pin_hash")
        .eq("user_id", user.id)
        .single();

      if (data) {
        const h = data as HostData & { security_pin_hash: string | null };
        setHost(h);
        setName(h.name);
        setHasPinSet(!!h.security_pin_hash);
        // Always show masked values for sensitive fields
        setEmail(maskEmail(h.email));
        setPhone(h.phone ? maskPhone(h.phone) : "");
        setLineUserId(h.line_user_id || "");
        // Never expose the full LINE channel token to the browser
        const token = h.line_channel_access_token || "";
        if (token) {
          setLineChannelToken("••••••••" + token.slice(-4));
          setLineTokenMasked(true);
        } else {
          setLineChannelToken("");
          setLineTokenMasked(false);
        }
        setPromptpayId(maskPromptpay(h.promptpay_id));
        setDepositAmount(h.deposit_amount || 0);
        setDepositByMonth(h.deposit_by_month || {});
        setCancellationDays(h.cancellation_days || 0);
        setNotificationPreference(h.notification_preference || "push");

        // Check push support and subscription status
        const supported = isPushSupported();
        setPushSupported(supported);
        if (supported) {
          isPushSubscribed(h.id).then(setPushSubscribed);
        }
      }
      setLoading(false);
    };
    fetchHost();
  }, []);

  const handleSave = async () => {
    if (!host) return;
    if (!name.trim()) {
      toast.error(t("errorRequired"));
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // Save non-sensitive fields via Supabase client
      const nonSensitiveUpdate: Record<string, unknown> = {
        name: name.trim(),
        line_user_id: lineUserId.trim() || null,
        ...(lineTokenMasked ? {} : { line_channel_access_token: lineChannelToken.trim() || null }),
        deposit_amount: depositAmount,
        deposit_by_month: Object.keys(depositByMonth).length > 0 ? depositByMonth : null,
        cancellation_days: cancellationDays,
        notification_preference: notificationPreference,
        updated_by: host.name,
      };

      const { error } = await supabase
        .from("hosts")
        .update(nonSensitiveUpdate as never)
        .eq("id", host.id);

      if (error) {
        toast.error(t("errorSave"));
        console.error("Update host error:", error);
        return;
      }

      // If sensitive fields are unlocked, save them via PIN-protected API
      if (sensitiveUnlocked && currentPin) {
        const res = await fetch("/api/host/update-sensitive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin: currentPin,
            email: email.trim(),
            phone: phone.trim() || null,
            promptpay_id: promptpayId.trim(),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || t("errorSave"));
          return;
        }
      }

      logClientEvent({
        entity_type: "host",
        entity_id: host.id,
        event_type: "PROFILE_UPDATED",
        data: { fields_updated: Object.keys(nonSensitiveUpdate).filter(k => k !== "updated_by"), sensitive: false },
      });

      toast.success(t("saved"));
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handlePinVerified = (pin: string) => {
    setCurrentPin(pin);
    // Fetch full values from the reveal-sensitive API
    fetch("/api/host/reveal-sensitive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.email) {
          setEmail(data.email);
          setPhone(data.phone || "");
          setPromptpayId(data.promptpay_id || "");
          setSensitiveUnlocked(true);
        }
      })
      .catch(() => toast.error(t("errorSave")));
  };

  const handleLockSensitive = () => {
    if (!host) return;
    setSensitiveUnlocked(false);
    setCurrentPin("");
    setEmail(maskEmail(host.email));
    setPhone(host.phone ? maskPhone(host.phone) : "");
    setPromptpayId(maskPromptpay(host.promptpay_id));
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      toast.error(t("deleteConfirmMismatch"));
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || t("deleteError"));
        return;
      }

      toast.success(t("deleteSuccess"));
      router.push("/login");
      router.refresh();
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setDeleting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword) {
      toast.error(t("oldPasswordRequired"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("passwordMismatch"));
      return;
    }

    setChangingPassword(true);
    try {
      const supabase = createClient();

      // Verify old password first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        toast.error(t("passwordError"));
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPassword,
      });
      if (signInError) {
        toast.error(t("oldPasswordWrong"));
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(t("passwordError"));
        console.error("Change password error:", error);
        return;
      }
      toast.success(t("passwordChanged"));
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error(t("passwordError"));
    } finally {
      setChangingPassword(false);
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

          <div className="rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-brand" />
                {t("sensitiveFields")}
              </div>
              {hasPinSet && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (sensitiveUnlocked) {
                      handleLockSensitive();
                    } else {
                      setPinDialogMode("verify");
                      setShowPinDialog(true);
                    }
                  }}
                >
                  {sensitiveUnlocked ? (
                    <><Lock className="mr-1.5 h-3.5 w-3.5" />{t("lockFields")}</>
                  ) : (
                    <><Unlock className="mr-1.5 h-3.5 w-3.5" />{t("unlockFields")}</>
                  )}
                </Button>
              )}
            </div>

            {!sensitiveUnlocked && (
              <p className="text-xs text-gray-500">{t("sensitiveHint")}</p>
            )}

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
                readOnly={!sensitiveUnlocked}
                className={!sensitiveUnlocked ? "bg-gray-50 cursor-not-allowed" : ""}
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
                readOnly={!sensitiveUnlocked}
                className={!sensitiveUnlocked ? "bg-gray-50 cursor-not-allowed" : ""}
              />
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
                readOnly={!sensitiveUnlocked}
                className={!sensitiveUnlocked ? "bg-gray-50 cursor-not-allowed" : ""}
              />
              <p className="text-xs text-gray-500">{t("promptpayHint")}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4 text-brand" />
              {t("depositSettings")}
            </div>

            <div className="space-y-2">
              <Label htmlFor="host-deposit" className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5" />
                {t("defaultDeposit")}
              </Label>
              <Input
                id="host-deposit"
                type="number"
                min={0}
                value={depositAmount || ""}
                onChange={(e) => setDepositAmount(parseInt(e.target.value) || 0)}
                placeholder={t("depositPlaceholder")}
              />
              <p className="text-xs text-gray-500">{t("defaultDepositHint")}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("monthlyDeposit")}</Label>
                <button
                  type="button"
                  className="text-xs font-medium hover:opacity-80 transition-opacity text-brand"
                  onClick={() => {
                    const filled: Record<string, number> = {};
                    MONTH_KEYS.forEach((m) => { filled[m] = depositAmount; });
                    setDepositByMonth(filled);
                  }}
                >
                  {t("applyToAll")}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {MONTH_KEYS.map((m) => (
                  <div key={m} className="space-y-1">
                    <label className="text-[11px] text-gray-500 block text-center">
                      {t(`month${m}`)}
                    </label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 text-center text-sm px-1"
                      value={depositByMonth[m] ?? ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setDepositByMonth((prev) => {
                          const next = { ...prev };
                          if (val > 0) {
                            next[m] = val;
                          } else {
                            delete next[m];
                          }
                          return next;
                        });
                      }}
                      placeholder={depositAmount > 0 ? String(depositAmount) : "0"}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">{t("monthlyDepositHint")}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-brand" />
              {t("cancellationPolicy")}
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{t("cancellationDays")}</Label>
              <div className="flex flex-wrap gap-2">
                {[0, 3, 7, 15, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    className="rounded-full px-3 py-1.5 text-sm font-medium border transition-colors"
                    style={
                      cancellationDays === days
                        ? { backgroundColor: "#2F5D50", color: "white", borderColor: "#2F5D50" }
                        : { borderColor: "#d1d5db", color: "#374151" }
                    }
                    onClick={() => setCancellationDays(days)}
                  >
                    {days === 0 ? t("cancellationDisabled") : t("cancellationDaysLabel", { days })}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">{t("cancellationDaysHint")}</p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full hover:brightness-90 bg-brand"
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            {t("notificationSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Notification Preference Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              {t("notificationPreference")}
            </Label>
            <div className="flex gap-2">
              {(["push", "line", "both"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setNotificationPreference(option)}
                  className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                    notificationPreference === option
                      ? "border-current text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                  style={
                    notificationPreference === option
                      ? { backgroundColor: "#2F5D50", borderColor: "#2F5D50" }
                      : undefined
                  }
                >
                  {t(`notification${option.charAt(0).toUpperCase() + option.slice(1)}` as "notificationPush" | "notificationLine" | "notificationBoth")}
                </button>
              ))}
            </div>
          </div>

          {/* Web Push Toggle */}
          {(notificationPreference === "push" || notificationPreference === "both") && (
            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {pushSubscribed ? (
                    <Bell className="h-4 w-4 text-brand" />
                  ) : (
                    <BellOff className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="text-sm font-medium">{t("pushNotifications")}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {!pushSupported
                  ? t("pushNotSupported")
                  : pushSubscribed
                    ? t("pushEnabled")
                    : t("pushDisabled")}
              </p>
              {pushSupported && (
                <Button
                  variant={pushSubscribed ? "outline" : "default"}
                  size="sm"
                  disabled={togglingPush}
                  className={`w-full hover:brightness-90 ${!pushSubscribed ? "bg-brand" : ""}`}
                  onClick={async () => {
                    if (!host) return;
                    setTogglingPush(true);
                    try {
                      if (pushSubscribed) {
                        const result = await unsubscribeFromPush(host.id);
                        if (result.success) {
                          setPushSubscribed(false);
                          toast.success(t("pushDisableSuccess"));
                        } else {
                          toast.error(t("pushError"));
                        }
                      } else {
                        const result = await subscribeHostToPush(host.id);
                        if (result.success) {
                          setPushSubscribed(true);
                          toast.success(t("pushEnableSuccess"));
                        } else if (result.error?.includes("denied")) {
                          toast.error(t("pushPermissionDenied"));
                        } else {
                          toast.error(result.error || t("pushError"));
                        }
                      }
                    } catch {
                      toast.error(t("pushError"));
                    } finally {
                      setTogglingPush(false);
                    }
                  }}
                >
                  {togglingPush ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : pushSubscribed ? (
                    <BellOff className="mr-2 h-4 w-4" />
                  ) : (
                    <Bell className="mr-2 h-4 w-4" />
                  )}
                  {togglingPush
                    ? t("pushEnabling")
                    : pushSubscribed
                      ? t("pushDisable")
                      : t("pushEnable")}
                </Button>
              )}
            </div>
          )}

          {/* LINE Settings — shown when LINE or Both is selected */}
          {(notificationPreference === "line" || notificationPreference === "both") && (
            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <p className="text-xs text-gray-500 mb-2">{t("lineSettingsHint")}</p>
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
                  onChange={(e) => { setLineChannelToken(e.target.value); setLineTokenMasked(false); }}
                  placeholder={t("lineChannelTokenPlaceholder")}
                />
                <p className="text-xs text-gray-500">{t("lineChannelTokenHint")}</p>
              </div>
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full hover:brightness-90 bg-brand"
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            {t("changePassword")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="old-password" className="flex items-center gap-2">
              <Key className="h-3.5 w-3.5" />
              {t("oldPassword")}
            </Label>
            <div className="relative">
              <Input
                id="old-password"
                type={showOldPassword ? "text" : "password"}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder={t("oldPasswordPlaceholder")}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowOldPassword(!showOldPassword)}
                tabIndex={-1}
              >
                {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password" className="flex items-center gap-2">
              <Key className="h-3.5 w-3.5" />
              {t("newPassword")}
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("newPasswordPlaceholder")}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowNewPassword(!showNewPassword)}
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="flex items-center gap-2">
              <Key className="h-3.5 w-3.5" />
              {t("confirmPassword")}
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("confirmPasswordPlaceholder")}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={changingPassword || !oldPassword || !newPassword || !confirmPassword}
            className="w-full hover:brightness-90 bg-brand"
          >
            {changingPassword ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            {t("updatePassword")}
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            {t("securityPin")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">{t("securityPinDesc")}</p>
          {hasPinSet && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setPinDialogMode("change");
                setShowPinDialog(true);
              }}
            >
              <Key className="mr-2 h-4 w-4" />
              {t("changePin")}
            </Button>
          )}
        </CardContent>
      </Card>

      <SecurityPinDialog
        open={showPinDialog}
        onClose={() => setShowPinDialog(false)}
        mode={pinDialogMode}
        onVerified={handlePinVerified}
        onChanged={() => toast.success(t("pinChanged"))}
      />

      <Card className="mt-6 border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-600">
            <Trash2 className="h-4 w-4" />
            {t("deleteAccount")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-red-100 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{t("deleteWarning")}</p>
            </div>
          </div>

          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("deleteAccount")}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">{t("deleteConfirmInstructions")}</p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder='DELETE'
                className="border-red-300 focus-visible:ring-red-500"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                  disabled={deleting}
                >
                  {t("cancelDelete")}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirmText !== "DELETE"}
                >
                  {deleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  {t("confirmDeleteAccount")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
