"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Eye, EyeOff, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import OtpModal from "@/components/otp-modal";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTouched(new Set(["email", "password"]));

    if (!turnstileToken && !turnstileError) {
      setError(t("errorCaptcha"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken: turnstileToken || "" }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setError(t("errorCaptcha"));
        } else {
          setError(data.error || t("errorGeneric"));
        }
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }

      if (data.otpRequired === false) {
        const nextUrl = searchParams.get("next") || "/dashboard";
        router.push(nextUrl);
        router.refresh();
      } else {
        setShowOtpModal(true);
      }
    } catch {
      setError(t("errorGeneric"));
      turnstileRef.current?.reset();
      setTurnstileToken(null);
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

      const nextUrl = searchParams.get("next") || "/dashboard";
      router.push(nextUrl);
      router.refresh();
    } catch {
      setOtpError(t("errorGeneric"));
    } finally {
      setOtpLoading(false);
    }
  }, [email, password, router, searchParams, t]);

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

  const handleMagicLink = async () => {
    if (!magicLinkEmail.trim()) return;
    setMagicLinkError(null);
    setMagicLinkLoading(true);
    try {
      const res = await fetch("/api/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: magicLinkEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.error === "no_account") {
          setMagicLinkError(t("magicLinkNoAccount"));
        } else {
          setMagicLinkError(data.error || t("errorGeneric"));
        }
        return;
      }
      setMagicLinkSent(true);
    } catch {
      setMagicLinkError(t("errorGeneric"));
    } finally {
      setMagicLinkLoading(false);
    }
  };

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
          <span className="text-2xl font-bold text-gray-900">{t('signIn')}</span>
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
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t("email")} <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched(prev => new Set([...prev, "email"]))}
                    required
                    autoComplete="email"
                    className={`!pl-10 p-3.5 !h-auto rounded-xl !border ${touched.has("email") && !email.trim() ? "!border-red-400 hover:!border-red-500 focus-visible:!border-red-400" : "!border-gray-200 hover:!border-gray-400 focus-visible:!border-gray-400"} !bg-white transition-all text-sm font-medium text-gray-900 !shadow-none focus-visible:!ring-0`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t("password")} <span className="text-red-500">*</span></label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-gray-600 hover:text-gray-900"
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
                    onBlur={() => setTouched(prev => new Set([...prev, "password"]))}
                    required
                    autoComplete="current-password"
                    className={`pr-10 p-3.5 !h-auto rounded-xl !border ${touched.has("password") && !password ? "!border-red-400 hover:!border-red-500 focus-visible:!border-red-400" : "!border-gray-200 hover:!border-gray-400 focus-visible:!border-gray-400"} !bg-white transition-all text-sm font-medium text-gray-900 !shadow-none focus-visible:!ring-0`}
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
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => { setTurnstileToken(null); setTurnstileError(true); }}
                  options={{ theme: "light", size: "normal" }}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full bg-brand text-white px-10 py-4 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl"
                disabled={loading || (!turnstileToken && !turnstileError)}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("signInButton")}
              </Button>

              <p className="text-center text-sm text-gray-500">
                {t("noAccount")}{" "}
                <Link
                  href="/register"
                  className="font-medium text-gray-900 hover:text-gray-700"
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
