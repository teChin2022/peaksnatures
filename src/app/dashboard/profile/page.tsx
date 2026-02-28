"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { User, Phone, CreditCard, Mail, MessageCircle, Loader2, Save, Key, Lock, Eye, EyeOff, Bell, BellOff, Trash2, AlertTriangle, UserPlus, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useThemeColor } from "@/components/dashboard/theme-context";
import { useUserRole } from "@/components/dashboard/dashboard-shell";

import { isPushSupported, isPushSubscribed, subscribeHostToPush, unsubscribeFromPush } from "@/lib/push-notifications";

interface AssistantData {
  id: string;
  email: string;
  name: string;
  status: "pending" | "active" | "revoked";
  invited_at: string;
  accepted_at: string | null;
}

interface HostData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  line_user_id: string | null;
  line_channel_access_token: string | null;
  promptpay_id: string;
  deposit_amount: number;
  notification_preference: string;
}

export default function ProfilePage() {
  const t = useTranslations("dashboardProfile");
  const router = useRouter();
  const themeColor = useThemeColor();
  const { role, hostId: contextHostId } = useUserRole();
  const isAssistant = role === "assistant";
  const isOwner = role === "owner";
  const [host, setHost] = useState<HostData | null>(null);
  const [hostName, setHostName] = useState("");
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

  // Assistant management state (owner only)
  const [assistants, setAssistants] = useState<AssistantData[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    // Wait for role context to resolve before fetching
    if (role === null) return;

    const fetchHost = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("hosts")
        .select("id, name, email, phone, line_user_id, line_channel_access_token, promptpay_id, deposit_amount, notification_preference");

      if (isAssistant && contextHostId) {
        query = query.eq("id", contextHostId);
      } else {
        query = query.eq("user_id", user.id);
      }

      const { data } = await query.maybeSingle();

      if (data) {
        const h = data as HostData;
        setHost(h);
        setHostName(h.name);
        setName(h.name);
        setEmail(h.email);
        setPhone(h.phone || "");
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
        // Assistants should not see the real promptpay value
        if (!isAssistant) {
          setPromptpayId(h.promptpay_id);
        }
        setDepositAmount(h.deposit_amount || 0);
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

    // Fetch assistants list (owner only)
    if (isOwner) {
      fetch("/api/host-assistants")
        .then((res) => res.json())
        .then((data) => {
          if (data.assistants) setAssistants(data.assistants as AssistantData[]);
        })
        .catch(() => {});
    }
  }, [role, contextHostId, isAssistant, isOwner]);

  const handleSave = async () => {
    if (!host) return;
    if (!name.trim() || !email.trim() || (!isAssistant && !promptpayId.trim())) {
      toast.error(t("errorRequired"));
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const updateData: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        line_user_id: lineUserId.trim() || null,
        ...(lineTokenMasked ? {} : { line_channel_access_token: lineChannelToken.trim() || null }),
        deposit_amount: depositAmount,
        notification_preference: notificationPreference,
      };

      // Only owners can update promptpay_id
      if (!isAssistant) {
        updateData.promptpay_id = promptpayId.trim();
      }

      const { error } = await supabase
        .from("hosts")
        .update(updateData as never)
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

  const handleInviteAssistant = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/host-assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "This email has already been invited") {
          toast.error(t("alreadyInvited"));
        } else if (data.error === "Cannot invite yourself") {
          toast.error(t("cannotInviteSelf"));
        } else {
          toast.error(data.error || t("inviteError"));
        }
        return;
      }
      toast.success(data.activated ? t("inviteActivated") : t("inviteSuccess"));
      setInviteEmail("");
      setInviteName("");
      // Refresh assistants list
      const listRes = await fetch("/api/host-assistants");
      const listData = await listRes.json();
      if (listData.assistants) setAssistants(listData.assistants as AssistantData[]);
    } catch {
      toast.error(t("inviteError"));
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeAssistant = async (assistantId: string) => {
    try {
      const res = await fetch("/api/host-assistants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId, action: "revoke" }),
      });
      if (!res.ok) {
        toast.error(t("revokeError"));
        return;
      }
      toast.success(t("revokeSuccess"));
      setAssistants((prev) => prev.filter((a) => a.id !== assistantId));
    } catch {
      toast.error(t("revokeError"));
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

      {isAssistant && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {t("assistantBanner", { hostName: hostName })}
        </div>
      )}

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
            {isAssistant ? (
              <div className="flex h-10 items-center rounded-md border bg-gray-50 px-3 text-sm text-gray-600">
                {name || "-"}
              </div>
            ) : (
              <Input
                id="host-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="host-email" className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              {t("email")}
            </Label>
            {isAssistant ? (
              <div className="flex h-10 items-center rounded-md border bg-gray-50 px-3 text-sm text-gray-600">
                {email || "-"}
              </div>
            ) : (
              <Input
                id="host-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="host-phone" className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              {t("phone")}
            </Label>
            {isAssistant ? (
              <div className="flex h-10 items-center rounded-md border bg-gray-50 px-3 text-sm text-gray-600">
                {phone || "-"}
              </div>
            ) : (
              <Input
                id="host-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("phonePlaceholder")}
              />
            )}
          </div>

          {!isAssistant && (
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
          )}

          {isAssistant && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5" />
                {t("promptpay")}
              </Label>
              <div className="flex h-10 items-center rounded-md border bg-gray-50 px-3 text-sm text-gray-400">
                {t("promptpayHidden")}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="host-deposit" className="flex items-center gap-2">
              <CreditCard className="h-3.5 w-3.5" />
              {t("depositAmount")}
            </Label>
            <Input
              id="host-deposit"
              type="number"
              min={0}
              value={depositAmount || ""}
              onChange={(e) => setDepositAmount(parseInt(e.target.value) || 0)}
              placeholder={t("depositPlaceholder")}
            />
            <p className="text-xs text-gray-500">{t("depositHint")}</p>
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

      {!isAssistant && (<Card className="mt-6">
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
                      ? { backgroundColor: themeColor, borderColor: themeColor }
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
                    <Bell className="h-4 w-4" style={{ color: themeColor }} />
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
                  className="w-full hover:brightness-90"
                  style={!pushSubscribed ? { backgroundColor: themeColor } : undefined}
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
      </Card>)}

      {!isAssistant && (
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
              className="w-full hover:brightness-90"
              style={{ backgroundColor: themeColor }}
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
      )}

      {/* Assistants Management — Owner only */}
      {isOwner && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4" />
              {t("assistants")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500">{t("assistantsDesc")}</p>

            {/* Invite form */}
            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="invite-email" className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" />
                  {t("assistantEmail")}
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("assistantEmailPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-name" className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  {t("assistantName")}
                </Label>
                <Input
                  id="invite-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder={t("assistantNamePlaceholder")}
                />
              </div>
              <Button
                onClick={handleInviteAssistant}
                disabled={inviting || !inviteEmail.trim()}
                className="w-full hover:brightness-90"
                style={{ backgroundColor: themeColor }}
              >
                {inviting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                {inviting ? t("inviting") : t("invite")}
              </Button>
            </div>

            {/* Assistants list */}
            {assistants.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-2">{t("noAssistants")}</p>
            ) : (
              <div className="space-y-2">
                {assistants.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {a.name || a.email}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{a.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {a.status === "active" ? t("statusActive") : t("statusPending")}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-red-600"
                        onClick={() => handleRevokeAssistant(a.id)}
                        title={t("revokeAccess")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isAssistant && (
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
      )}

      {isAssistant && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-400">
          {t("restrictedAccess")}
        </div>
      )}
    </div>
  );
}
