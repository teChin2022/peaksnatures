"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { User, Phone, CreditCard, Mail, MessageCircle, Loader2, Save, Key, Lock, Eye, EyeOff, Bell, Trash2, AlertTriangle, ShieldCheck, Unlock, Camera } from "lucide-react";
import Image from "next/image";
import { compressImage } from "@/lib/compress-image";
import { getInitials, isValidEmail, isValidPhone, sanitizePhoneInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { logClientEvent } from "@/lib/history-log-client";

import { SecurityPinDialog } from "@/components/security-pin-dialog";

interface HostData {
  id: string;
  name: string;
  maskedEmail: string;
  maskedPhone: string;
  maskedPromptpay: string;
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
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [notificationPreference, setNotificationPreference] = useState("sms");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deletePin, setDeletePin] = useState("");
  const [showDeletePinDialog, setShowDeletePinDialog] = useState(false);
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState<"verify" | "change">("verify");
  const [hasPinSet, setHasPinSet] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [paymentDisplay, setPaymentDisplay] = useState<"qr" | "bank">("qr");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [requireOtp, setRequireOtp] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    const { signal } = ctrl;

    const fetchHost = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (signal.aborted || !user) return;
      setUserId(user.id);

      const res = await fetch("/api/host/profile", { signal });
      if (signal.aborted) return;
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (signal.aborted) return;

      setHost({
        id: data.id,
        name: data.name,
        maskedEmail: data.masked.email,
        maskedPhone: data.masked.phone,
        maskedPromptpay: data.masked.promptpay_id,
      });
      setName(data.name);
      setHasPinSet(data.hasPinSet);
      setEmail(data.masked.email);
      setPhone(data.masked.phone);
      setLineUserId(data.line_user_id || "");
      if (data.hasLineToken) {
        setLineChannelToken("••••••••" + (data.line_token_tail || ""));
        setLineTokenMasked(true);
      } else {
        setLineChannelToken("");
        setLineTokenMasked(false);
      }
      setPromptpayId(data.masked.promptpay_id);
      setNotificationPreference(data.notification_preference || "sms");
      setAvatarUrl(data.avatar_url || null);
      setPaymentDisplay((data.payment_display as "qr" | "bank") || "qr");
      setBankName(data.bank_name || "");
      setBankAccountNumber(data.bank_account_number || "");
      setBankAccountName(data.bank_account_name || "");
      setRequireOtp(data.require_otp !== false);
      setLoading(false);
    };
    fetchHost().catch((e: unknown) => {
      if ((e as Error)?.name !== "AbortError") throw e;
    });

    return () => ctrl.abort();
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !host) return;

    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const compressed = await compressImage(file, { maxDimension: 512 });
      const ext = "webp";
      const path = `${host.id}/avatar/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("homestay-photos")
        .upload(path, compressed);

      if (uploadError) {
        console.error("Avatar upload error:", uploadError);
        toast.error(t("errorSave"));
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("homestay-photos")
        .getPublicUrl(path);

      const { error: updateError } = await supabase
        .from("hosts")
        .update({ avatar_url: publicUrl, updated_by: host.name } as never)
        .eq("id", host.id);

      if (updateError) {
        console.error("Avatar save error:", updateError);
        toast.error(t("errorSave"));
        return;
      }

      setAvatarUrl(publicUrl);
      toast.success(t("saved"));
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!host) return;
    if (!name.trim()) {
      toast.error(t("errorRequired"));
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // Validate bank fields if payment_display is "bank" and sensitive is unlocked
      if (sensitiveUnlocked && paymentDisplay === "bank" && (!bankName.trim() || !bankAccountNumber.trim() || !bankAccountName.trim())) {
        toast.error(t("bankFieldsRequired"));
        setSaving(false);
        return;
      }

      // Validate email/phone format when sensitive fields are being saved
      if (sensitiveUnlocked) {
        if (email.trim() && !isValidEmail(email)) {
          toast.error(t("errorInvalidEmail"));
          setSaving(false);
          return;
        }
        if (phone.trim() && !isValidPhone(phone)) {
          toast.error(t("errorInvalidPhone"));
          setSaving(false);
          return;
        }
      }

      // Save non-sensitive fields via Supabase client
      const nonSensitiveUpdate: Record<string, unknown> = {
        name: name.trim(),
        line_user_id: lineUserId.trim() || null,
        ...(lineTokenMasked ? {} : { line_channel_access_token: lineChannelToken.trim() || null }),
        notification_preference: notificationPreference,
        require_otp: requireOtp,
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
            payment_display: paymentDisplay,
            bank_name: bankName.trim() || null,
            bank_account_number: bankAccountNumber.trim() || null,
            bank_account_name: bankAccountName.trim() || null,
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
    setEmail(host.maskedEmail);
    setPhone(host.maskedPhone);
    setPromptpayId(host.maskedPromptpay);
  };

  const handleDeleteButtonClick = () => {
    if (hasPinSet) {
      setShowDeletePinDialog(true);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const handleDeletePinVerified = (pin: string) => {
    setDeletePin(pin);
    setShowDeletePinDialog(false);
    setShowDeleteConfirm(true);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: deletePin || undefined }),
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
          {/* Avatar Upload */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <div
              className="relative h-24 w-24 cursor-pointer overflow-hidden rounded-full bg-gray-100 ring-2 ring-gray-200 transition-opacity hover:opacity-80"
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={name || "Avatar"}
                  width={96}
                  height={96}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-200 text-2xl font-bold text-gray-500">
                  {name ? getInitials(name) : <User className="h-8 w-8 text-gray-400" />}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                {uploadingAvatar ? (
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-brand hover:underline"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
            >
              {avatarUrl ? t("changeAvatar") : t("uploadAvatar")}
            </button>
            <p className="text-xs text-gray-400">{t("avatarHint")}</p>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

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
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(sensitiveUnlocked ? sanitizePhoneInput(e.target.value) : e.target.value)}
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

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="h-3.5 w-3.5" />
                {t("paymentDisplayTitle")}
              </div>
              <p className="text-xs text-gray-500">{t("paymentDisplayHint")}</p>

              <div className="flex gap-2">
                {(["qr", "bank"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={!sensitiveUnlocked}
                    className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${!sensitiveUnlocked ? "opacity-60 cursor-not-allowed" : ""}`}
                    style={
                      paymentDisplay === option
                        ? { backgroundColor: "#2F5D50", color: "white", borderColor: "#2F5D50" }
                        : { borderColor: "#d1d5db", color: "#374151" }
                    }
                    onClick={() => setPaymentDisplay(option)}
                  >
                    {t(option === "qr" ? "paymentDisplayQr" : "paymentDisplayBank")}
                  </button>
                ))}
              </div>

              {paymentDisplay === "bank" && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <Label htmlFor="host-bank-name" className="text-sm">{t("bankName")}</Label>
                    <select
                      id="host-bank-name"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      disabled={!sensitiveUnlocked}
                      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${!sensitiveUnlocked ? "bg-gray-50 cursor-not-allowed" : ""}`}
                    >
                      <option value="">{t("bankNamePlaceholder")}</option>
                      <option value="กรุงเทพ">ธ.กรุงเทพ (BBL)</option>
                      <option value="กสิกรไทย">ธ.กสิกรไทย (KBANK)</option>
                      <option value="ไทยพาณิชย์">ธ.ไทยพาณิชย์ (SCB)</option>
                      <option value="กรุงไทย">ธ.กรุงไทย (KTB)</option>
                      <option value="กรุงศรีอยุธยา">ธ.กรุงศรีอยุธยา (BAY)</option>
                      <option value="ทหารไทยธนชาต">ธ.ทหารไทยธนชาต (TTB)</option>
                      <option value="ออมสิน">ธ.ออมสิน (GSB)</option>
                      <option value="ธ.ก.ส.">ธ.ก.ส. (BAAC)</option>
                      <option value="เกียรตินาคินภัทร">ธ.เกียรตินาคินภัทร (KKP)</option>
                      <option value="ซีไอเอ็มบี">ธ.ซีไอเอ็มบี (CIMB)</option>
                      <option value="ยูโอบี">ธ.ยูโอบี (UOB)</option>
                      <option value="แลนด์แอนด์เฮ้าส์">ธ.แลนด์แอนด์เฮ้าส์ (LHFG)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="host-bank-account-number" className="text-sm">{t("bankAccountNumber")}</Label>
                    <Input
                      id="host-bank-account-number"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder={t("bankAccountNumberPlaceholder")}
                      readOnly={!sensitiveUnlocked}
                      className={!sensitiveUnlocked ? "bg-gray-50 cursor-not-allowed" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="host-bank-account-name" className="text-sm">{t("bankAccountName")}</Label>
                    <Input
                      id="host-bank-account-name"
                      value={bankAccountName}
                      onChange={(e) => setBankAccountName(e.target.value)}
                      placeholder={t("bankAccountNamePlaceholder")}
                      readOnly={!sensitiveUnlocked}
                      className={!sensitiveUnlocked ? "bg-gray-50 cursor-not-allowed" : ""}
                    />
                  </div>
                </div>
              )}
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
              {(["sms", "line"] as const).map((option) => (
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
                  {t(`notification${option.charAt(0).toUpperCase() + option.slice(1)}` as "notificationSms" | "notificationLine")}
                </button>
              ))}
            </div>
          </div>

          {/* SMS Settings — shown when SMS is selected */}
          {notificationPreference === "sms" && (
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-500">{t("smsSettingsHint")}</p>
            </div>
          )}

          {/* LINE Settings — shown when LINE is selected */}
          {notificationPreference === "line" && (
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
            <ShieldCheck className="h-4 w-4" />
            {t("requireOtpLabel")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500">{t("requireOtpHint")}</p>
          <div className="flex gap-2">
            {([true, false] as const).map((option) => (
              <button
                key={String(option)}
                type="button"
                onClick={() => setRequireOtp(option)}
                className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                  requireOtp === option
                    ? "border-current text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
                style={
                  requireOtp === option
                    ? { backgroundColor: "#2F5D50", borderColor: "#2F5D50" }
                    : undefined
                }
              >
                {t(option ? "otpEnabled" : "otpDisabled")}
              </button>
            ))}
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
              onClick={handleDeleteButtonClick}
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
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); setDeletePin(""); }}
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

      <SecurityPinDialog
        open={showDeletePinDialog}
        onClose={() => setShowDeletePinDialog(false)}
        mode="verify"
        onVerified={handleDeletePinVerified}
      />
    </div>
  );
}
