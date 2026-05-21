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
  CardTitle,
} from "@/components/ui/card";
import OtpModal from "@/components/otp-modal";
import { isValidEmail } from "@/lib/utils";

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!turnstileToken && !turnstileError) {
      setError("Please complete the CAPTCHA verification");
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
        } else {
          setError(data.error || "Something went wrong");
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
          if (data.error === "code_expired") {
            setOtpError("Verification code expired. Please request a new one.");
          } else if (data.error === "invalid_code") {
            setOtpError("Invalid verification code.");
          } else {
            setOtpError(data.error || "Something went wrong");
          }
          return;
        }

        // Verify this user is actually a platform admin
        const verifyRes = await fetch("/api/admin/auth/verify", { method: "POST" });
        if (!verifyRes.ok) {
          setOtpError("You are not authorized as a platform admin.");
          return;
        }

        router.push("/admin");
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
      if (!res.ok) {
        const data = await res.json();
        setOtpError(data.error || "Something went wrong");
      }
    } catch {
      setOtpError("Something went wrong");
    }
  }, [email, password]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
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
            <span className="text-2xl font-bold text-slate-800">Platform Admin</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <Shield className="h-3.5 w-3.5" />
            <span>Restricted access</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Admin Sign In</CardTitle>
            <CardDescription>
              Enter your admin credentials to access the platform dashboard.
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
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800"
                disabled={loading || (!turnstileToken && !turnstileError)}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
