"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, Eye, EyeOff, Loader2, CheckCircle2, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BillingConfig {
  id: string;
  commission_pct: number;
  fixed_rate_amount: number;
  promptpay_id: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  payment_display: string;
}

export default function AdminSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Billing config state
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSuccess, setBillingSuccess] = useState(false);
  const [billingForm, setBillingForm] = useState({
    commission_pct: "",
    fixed_rate_amount: "",
    promptpay_id: "",
    bank_name: "",
    bank_account_number: "",
    bank_account_name: "",
    payment_display: "qr",
  });

  const fetchBillingConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/billing-config");
      if (res.ok) {
        const data: BillingConfig = await res.json();
        setBillingConfig(data);
        setBillingForm({
          commission_pct: String(data.commission_pct),
          fixed_rate_amount: String(data.fixed_rate_amount),
          promptpay_id: data.promptpay_id || "",
          bank_name: data.bank_name || "",
          bank_account_number: data.bank_account_number || "",
          bank_account_name: data.bank_account_name || "",
          payment_display: data.payment_display,
        });
      }
    } catch {
      console.error("Failed to fetch billing config");
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingConfig();
  }, [fetchBillingConfig]);

  const handleBillingSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBillingError(null);
    setBillingSuccess(false);
    setBillingSaving(true);
    try {
      const res = await fetch("/api/admin/billing-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commission_pct: parseFloat(billingForm.commission_pct) || 0,
          fixed_rate_amount: parseInt(billingForm.fixed_rate_amount) || 0,
          promptpay_id: billingForm.promptpay_id || null,
          bank_name: billingForm.bank_name || null,
          bank_account_number: billingForm.bank_account_number || null,
          bank_account_name: billingForm.bank_account_name || null,
          payment_display: billingForm.payment_display,
        }),
      });
      if (res.ok) {
        setBillingSuccess(true);
        const data = await res.json();
        setBillingConfig(data);
      } else {
        const data = await res.json();
        setBillingError(data.error || "Failed to save");
      }
    } catch {
      setBillingError("Something went wrong");
    } finally {
      setBillingSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from current password");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-slate-200 p-2">
          <Settings className="h-5 w-5 text-slate-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Manage your admin account</p>
        </div>
      </div>

      {/* Billing Configuration */}
      <Card className="max-w-md mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-base">Billing Configuration</CardTitle>
          </div>
          <CardDescription>Platform commission, fixed rate, and payment details for hosts</CardDescription>
        </CardHeader>
        <CardContent>
          {billingLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <form onSubmit={handleBillingSave} className="space-y-4">
              {billingError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {billingError}
                </div>
              )}
              {billingSuccess && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Billing configuration saved
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commission_pct">Commission (%)</Label>
                  <Input
                    id="commission_pct"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={billingForm.commission_pct}
                    onChange={(e) => setBillingForm((f) => ({ ...f, commission_pct: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fixed_rate_amount">Fixed Rate (THB/month)</Label>
                  <Input
                    id="fixed_rate_amount"
                    type="number"
                    min="0"
                    value={billingForm.fixed_rate_amount}
                    onChange={(e) => setBillingForm((f) => ({ ...f, fixed_rate_amount: e.target.value }))}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Platform Payment Details</p>
                <p className="text-xs text-gray-500 mb-3">
                  These are shown to hosts when they need to pay (wallet top-up or monthly invoice).
                </p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="promptpay_id">PromptPay ID</Label>
                    <Input
                      id="promptpay_id"
                      value={billingForm.promptpay_id}
                      onChange={(e) => setBillingForm((f) => ({ ...f, promptpay_id: e.target.value }))}
                      placeholder="Phone number or citizen ID"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank_name">Bank Name</Label>
                    <Input
                      id="bank_name"
                      value={billingForm.bank_name}
                      onChange={(e) => setBillingForm((f) => ({ ...f, bank_name: e.target.value }))}
                      placeholder="e.g. Bangkok Bank"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="bank_account_number">Account Number</Label>
                      <Input
                        id="bank_account_number"
                        value={billingForm.bank_account_number}
                        onChange={(e) => setBillingForm((f) => ({ ...f, bank_account_number: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bank_account_name">Account Name</Label>
                      <Input
                        id="bank_account_name"
                        value={billingForm.bank_account_name}
                        onChange={(e) => setBillingForm((f) => ({ ...f, bank_account_name: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Display</Label>
                    <div className="flex gap-3">
                      {(["qr", "bank"] as const).map((opt) => (
                        <Button
                          key={opt}
                          type="button"
                          size="sm"
                          variant={billingForm.payment_display === opt ? "default" : "outline"}
                          onClick={() => setBillingForm((f) => ({ ...f, payment_display: opt }))}
                          className={billingForm.payment_display === opt ? "bg-slate-800" : ""}
                        >
                          {opt === "qr" ? "PromptPay QR" : "Bank Transfer"}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800"
                disabled={billingSaving}
              >
                {billingSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Billing Configuration
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription>Update your admin login password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Password changed successfully
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="current">Current Password</Label>
              <div className="relative">
                <Input
                  id="current"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new">New Password</Label>
              <div className="relative">
                <Input
                  id="new"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400">Minimum 8 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
