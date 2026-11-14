"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [passwordWarning, setPasswordWarning] = useState<string | null>(null);
  const [confirmPasswordWarning, setConfirmPasswordWarning] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[_#@]).{6,}$/;

  const handlePasswordBlur = () => {
    setTouched(prev => new Set([...prev, "password"]));
    if (password && !passwordRegex.test(password)) {
      setPasswordWarning(t("errorPasswordWeak"));
    } else {
      setPasswordWarning(null);
    }
  };

  const handleConfirmPasswordBlur = () => {
    setTouched(prev => new Set([...prev, "confirmPassword"]));
    if (confirmPassword && password !== confirmPassword) {
      setConfirmPasswordWarning(t("errorPasswordMismatch"));
    } else {
      setConfirmPasswordWarning(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTouched(new Set(["password", "confirmPassword"]));
    if (!passwordRegex.test(password)) {
      setError(t("errorPasswordWeak"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("errorPasswordMismatch"));
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const code = (error as { code?: string }).code;
        const msg = error.message?.toLowerCase() ?? "";
        if (code === "same_password" || msg.includes("should be different")) {
          setError(t("errorPasswordSameAsCurrent"));
        } else if (code === "weak_password" || msg.includes("password should be")) {
          setError(t("errorPasswordWeak"));
        } else if (
          code === "session_not_found" ||
          code === "invalid_credentials" ||
          msg.includes("session") ||
          msg.includes("token") ||
          msg.includes("expired")
        ) {
          setError(t("errorResetSessionExpired"));
        } else {
          setError(t("errorGeneric"));
        }
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-earth-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <h1 className="font-serif text-3xl leading-tight text-earth-900">{t("resetPasswordTitle")}</h1>
          <p className="text-sm text-earth-600">{t("hostDashboard")}</p>
        </div>

        {success ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                <CheckCircle className="h-8 w-8 text-brand" />
              </div>
              <h2 className="text-xl font-semibold text-earth-900">
                {t("passwordUpdatedTitle")}
              </h2>
              <p className="text-center text-sm text-earth-600">
                {t("passwordUpdatedDesc")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("resetPasswordTitle")}</CardTitle>
              <CardDescription>
                {t("resetPasswordDesc")}
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 mb-5">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-[13px] font-medium text-earth-700">{t("newPassword")} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={t("passwordPlaceholder")}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (passwordWarning) setPasswordWarning(null);
                      }}
                      onBlur={handlePasswordBlur}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className={`pr-10 p-3.5 !h-auto rounded-xl !border ${touched.has("password") && (!password || !!passwordWarning) ? "!border-red-400 hover:!border-red-500 focus-visible:!border-red-400" : "!border-earth-200 hover:!border-earth-400 focus-visible:!border-earth-400"} !bg-white transition-all text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-0`}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? t("hidePassword") : t("showPassword")} onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-earth-600 hover:text-earth-700"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {passwordWarning && (
                    <p className="text-xs text-amber-600 mt-1">{passwordWarning}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="text-[13px] font-medium text-earth-700">{t("confirmNewPassword")} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder={t("confirmPasswordPlaceholder")}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (confirmPasswordWarning) setConfirmPasswordWarning(null);
                      }}
                      onBlur={handleConfirmPasswordBlur}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className={`pr-10 p-3.5 !h-auto rounded-xl !border ${touched.has("confirmPassword") && (!confirmPassword || !!confirmPasswordWarning) ? "!border-red-400 hover:!border-red-500 focus-visible:!border-red-400" : "!border-earth-200 hover:!border-earth-400 focus-visible:!border-earth-400"} !bg-white transition-all text-sm font-medium text-earth-900 !shadow-none focus-visible:!ring-0`}
                    />
                    <button
                      type="button"
                      aria-label={showConfirmPassword ? t("hidePassword") : t("showPassword")} onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-earth-600 hover:text-earth-700"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {confirmPasswordWarning && (
                    <p className="text-xs text-amber-600 mt-1">{confirmPasswordWarning}</p>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full bg-brand text-white px-10 py-6 rounded-full font-bold text-sm hover:bg-brand-hover transition-colors"
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("updatePassword")}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
