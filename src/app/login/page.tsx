"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mountain, Loader2, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import OtpModal from "@/components/otp-modal";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("errorGeneric"));
        return;
      }

      setShowOtpModal(true);
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = useCallback(async (otp: string) => {
    setOtpError(null);
    setOtpLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "code_expired") {
          setOtpError(t("otpExpired"));
        } else if (data.error === "invalid_code") {
          setOtpError(t("otpInvalid"));
        } else {
          setOtpError(data.error || t("errorGeneric"));
        }
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setOtpError(t("errorGeneric"));
    } finally {
      setOtpLoading(false);
    }
  }, [email, password, router, t]);

  const handleResendOtp = useCallback(async () => {
    setOtpError(null);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setOtpError(data.error || t("errorGeneric"));
      }
    } catch {
      setOtpError(t("errorGeneric"));
    }
  }, [email, password, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      {showOtpModal && (
        <OtpModal
          email={email}
          onVerify={handleVerifyOtp}
          onResend={handleResendOtp}
          onClose={() => { setShowOtpModal(false); setOtpError(null); }}
          error={otpError}
          loading={otpLoading}
        />
      )}
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="PeaksNature" className="h-8 w-8 rounded" />
            <span className="text-2xl font-bold text-green-800">PeaksNature</span>
          </Link>
          <p className="text-sm text-gray-500">{t("hostDashboard")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("signIn")}</CardTitle>
            <CardDescription>
              {t("signInDesc")}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4 mb-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("password")}</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-green-600 hover:text-green-700"
                  >
                    {t("forgotPassword")}
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("signInButton")}
              </Button>
              <p className="text-center text-sm text-gray-500">
                {t("noAccount")}{" "}
                <Link
                  href="/register"
                  className="font-medium text-green-600 hover:text-green-700"
                >
                  {t("register")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
