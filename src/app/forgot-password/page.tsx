"use client";

import { useState, useRef } from "react";
import { Loader2, Mail, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import { isValidEmail } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [touched, setTouched] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTouched(true);

    if (!isValidEmail(email)) {
      setError(t("errorInvalidEmail"));
      return;
    }

    if (!turnstileToken && !turnstileError) {
      setError(t("errorCaptcha"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: turnstileToken || "" }),
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

      setEmailSent(true);
    } catch {
      setError(t("errorGeneric"));
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <span className="text-2xl font-bold ">{t('forgotPasswordTitle')}</span>
          <p className="text-sm text-gray-500">{t("hostDashboard")}</p>
        </div>

        {emailSent ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                <Mail className="h-8 w-8 text-brand" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t("resetEmailTitle")}
              </h2>
              <p className="text-center text-sm text-gray-500">
                {t("resetEmailDesc", { email })}
              </p>
              <Link
                href="/login"
                className="mt-2 text-sm font-medium text-gray-900 hover:text-gray-700"
              >
                {t("backToSignIn")}
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("forgotPasswordTitle")}</CardTitle>
              <CardDescription>
                {t("forgotPasswordDesc")}
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
                  <label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t("email")} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <Input
                      id="email"
                      type="email"
                      placeholder={t("emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setTouched(true)}
                      required
                      autoComplete="email"
                      className={`!pl-10 p-3.5 !h-auto rounded-xl !border ${touched && !email.trim() ? "!border-red-400 hover:!border-red-500 focus-visible:!border-red-400" : "!border-gray-200 hover:!border-gray-400 focus-visible:!border-gray-400"} !bg-white transition-all text-sm font-medium text-gray-900 !shadow-none focus-visible:!ring-0`}
                    />
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
                  className="w-full bg-brand text-white px-10 py-6 rounded-full font-bold text-sm tracking-widest uppercase hover:bg-brand-hover transition-all shadow-lg hover:shadow-xl"
                  disabled={loading || (!turnstileToken && !turnstileError)}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("sendResetLink")}
                </Button>
                <Link
                  href="/login"
                  className="flex items-center gap-1 text-sm font-medium text-gray-900 hover:text-gray-700"
                >
                  <ArrowLeft className="h-3 w-3" />
                  {t("backToSignIn")}
                </Link>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
