"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff, Shield } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import OtpModal from "@/components/otp-modal";
import { createClient } from "@/lib/supabase/client";
import { adminNextPath } from "@/lib/next-path";
import { isValidEmail } from "@/lib/utils";

/** English text for the codes /api/auth/send-otp and /verify-otp answer with. */
function authErrorText(code: unknown) {
  if (code === "INVALID_CREDENTIALS") return "Incorrect email or password";
  if (code === "EMAIL_NOT_CONFIRMED") return "This email is not confirmed yet";
  return "Something went wrong";
}

/** DESIGN.md "Inputs / Fields": white, 44px tall, 14px radius and padding, a 2px Forest ring on focus. */
const FIELD =
  "h-11 rounded-[14px] bg-white px-3.5 shadow-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

/** The rate limiter's 429 (src/lib/rate-limit.ts), with its Retry-After seconds as whole minutes. */
function tooManyText(res: Response) {
  const seconds = Number(res.headers.get("Retry-After"));
  if (!(seconds > 0)) return "Too many attempts. Please wait a few minutes and try again.";
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

export default function AdminLoginPage() {
  const router = useRouter();
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
  const turnstileRef = useRef<TurnstileInstance>(null);
  // A field's own mistake shows under that field (DESIGN.md "Inputs / Fields"); the banner keeps server answers.
  const [fieldError, setFieldError] = useState<{ field: "email" | "password"; message: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const signInRef = useRef<HTMLButtonElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (!isValidEmail(email)) {
      setFieldError({ field: "email", message: "Please enter a valid email address" });
      emailRef.current?.focus();
      return;
    }

    if (!password) {
      setFieldError({ field: "password", message: "Enter your password" });
      passwordRef.current?.focus();
      return;
    }

    if (!turnstileToken && !turnstileError) {
      setError("Wait for the security check below to finish, then sign in.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken: turnstileToken || "", source: "admin" }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setError("CAPTCHA verification failed");
        } else if (res.status === 429) {
          setError(tooManyText(res));
        } else {
          setError(authErrorText(data.error));
        }
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }

      setShowOtpModal(true);
    } catch {
      setError("Something went wrong");
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = useCallback(
    async (otp: string) => {
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
          if (res.status === 429) {
            setOtpError(tooManyText(res));
          } else if (data.error === "code_expired") {
            setOtpError("Verification code expired. Please request a new one.");
          } else if (data.error === "invalid_code") {
            setOtpError("Invalid verification code.");
          } else {
            setOtpError(authErrorText(data.error));
          }
          return;
        }

        // Verify this user is actually a platform admin
        const verifyRes = await fetch("/api/admin/auth/verify", { method: "POST" });
        if (verifyRes.status === 403) {
          // verify-otp already signed this account in; leaving it signed in bounces /admin/login to / on reload.
          await createClient().auth.signOut();
          setOtpError("This account isn't a platform admin. You've been signed out.");
          return;
        }
        if (!verifyRes.ok) {
          setOtpError("Something went wrong. Please try again.");
          return;
        }

        // The page they opened before login, if the middleware recorded one (internal /admin only).
        router.push(adminNextPath(new URLSearchParams(window.location.search).get("next")));
        router.refresh();
      } catch {
        setOtpError("Something went wrong");
      } finally {
        setOtpLoading(false);
      }
    },
    [email, password, router]
  );

  const handleResendOtp = useCallback(async () => {
    setOtpError(null);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, source: "admin" }),
      });
      if (res.status === 429) {
        setOtpError(tooManyText(res));
      } else if (!res.ok) {
        const data = await res.json();
        setOtpError(authErrorText(data.error));
      }
    } catch {
      setOtpError("Something went wrong");
    }
  }, [email, password]);

  return (
    // The root <html lang> follows the guest locale (Thai by default); this page is English.
    // Stone (admin-surface), the admin shell's background: staff can tell the back office from the host sign-in.
    <main lang="en" className="admin-surface flex min-h-screen items-center justify-center px-4">
      {showOtpModal && (
        <OtpModal
          email={email}
          onVerify={handleVerifyOtp}
          onResend={handleResendOtp}
          onClose={() => {
            setShowOtpModal(false);
            setOtpError(null);
          }}
          error={otpError}
          loading={otpLoading}
          returnFocusRef={signInRef}
        />
      )}
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Peaksnature"
              width={32}
              height={32}
              className="h-8 w-8 rounded"
            />
            <h1 className="font-serif text-3xl leading-tight text-earth-900">Platform Admin</h1>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-earth-600">
            <Shield className="h-3.5 w-3.5" />
            <span>Restricted access</span>
          </div>
        </div>

        <Card className="rounded-[18px] border-earth-200 shadow-none">
          <CardHeader>
            <CardDescription className="text-earth-600">
              Enter your admin credentials to access the platform dashboard.
            </CardDescription>
          </CardHeader>
          {/* noValidate: handleLogin's English messages replace the browser's bubble, which speaks the browser's language. */}
          <form onSubmit={handleLogin} noValidate>
            <CardContent className="space-y-4 mb-5">
              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="font-semibold text-earth-700">Email</Label>
                <Input
                  ref={emailRef}
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldError?.field === "email") setFieldError(null);
                  }}
                  required
                  autoComplete="email"
                  aria-invalid={fieldError?.field === "email" || undefined}
                  aria-describedby={fieldError?.field === "email" ? "email-error" : undefined}
                  className={FIELD}
                />
                {fieldError?.field === "email" && (
                  <p id="email-error" role="alert" className="text-xs text-destructive">{fieldError.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="font-semibold text-earth-700">Password</Label>
                <div className="relative">
                  <Input
                    ref={passwordRef}
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldError?.field === "password") setFieldError(null);
                    }}
                    required
                    autoComplete="current-password"
                    aria-invalid={fieldError?.field === "password" || undefined}
                    aria-describedby={fieldError?.field === "password" ? "password-error" : undefined}
                    className={`${FIELD} pr-12`}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0.5 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-earth-600 outline-none hover:text-earth-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                {fieldError?.field === "password" && (
                  <p id="password-error" role="alert" className="text-xs text-destructive">{fieldError.message}</p>
                )}
              </div>
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => {
                    setTurnstileToken(null);
                    setTurnstileError(true);
                  }}
                  options={{ theme: "light", size: "normal" }}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                ref={signInRef}
                type="submit"
                className="h-12 w-full rounded-full bg-brand font-semibold text-white hover:bg-brand-hover"
                // Not greyed out while Turnstile runs: a press then says what it is waiting for (handleLogin).
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  );
}
