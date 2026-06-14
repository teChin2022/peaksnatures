"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Settings, Eye, EyeOff, Loader2, CreditCard, Plus, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/page-header";
import { cn } from "@/lib/utils";
import type { FixedRateTermTier } from "@/types/database";

interface BillingConfig {
  id: string;
  commission_pct: number;
  fixed_rate_amount: number;
  fixed_rate_term_tiers: FixedRateTermTier[];
  promptpay_id: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  payment_display: string;
}

interface TierDraft {
  months: string;
  discount_pct: string;
}

function BillingFormSkeleton() {
  return (
    <div className="space-y-4">
      {/* Commission % + Fixed Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>

      {/* Fixed Rate Subscription Terms */}
      <div className="border-t border-earth-100 pt-4 space-y-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-3/4" />
        <div className="flex items-end gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      {/* Platform Payment Details */}
      <div className="border-t border-earth-100 pt-4 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-2/3" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <div className="flex gap-3">
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </div>
      </div>

      {/* Save button */}
      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  );
}

export default function AdminSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [, setBillingConfig] = useState<BillingConfig | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingForm, setBillingForm] = useState({
    commission_pct: "",
    fixed_rate_amount: "",
    promptpay_id: "",
    bank_name: "",
    bank_account_number: "",
    bank_account_name: "",
    payment_display: "qr",
  });
  const [tierDrafts, setTierDrafts] = useState<TierDraft[]>([]);
  const [tierError, setTierError] = useState<string | null>(null);
  const [confirmRemoveTier, setConfirmRemoveTier] = useState<number | null>(null);

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
        setTierDrafts(
          (data.fixed_rate_term_tiers || []).map((t) => ({
            months: String(t.months),
            discount_pct: String(t.discount_pct),
          })),
        );
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

    setTierError(null);
    const seen = new Set<number>();
    const tiers: FixedRateTermTier[] = [];
    for (const draft of tierDrafts) {
      const months = parseInt(draft.months, 10);
      const discount = parseFloat(draft.discount_pct);
      if (!Number.isInteger(months) || months < 1 || months > 60) {
        setTierError(`Months must be a whole number between 1 and 60.`);
        return;
      }
      if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
        setTierError(`Discount must be between 0 and 100.`);
        return;
      }
      if (seen.has(months)) {
        setTierError(`Duplicate term: ${months} months.`);
        return;
      }
      seen.add(months);
      tiers.push({ months, discount_pct: discount });
    }
    tiers.sort((a, b) => a.months - b.months);

    setBillingSaving(true);
    try {
      const res = await fetch("/api/admin/billing-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commission_pct: parseFloat(billingForm.commission_pct) || 0,
          fixed_rate_amount: parseInt(billingForm.fixed_rate_amount) || 0,
          fixed_rate_term_tiers: tiers,
          promptpay_id: billingForm.promptpay_id || null,
          bank_name: billingForm.bank_name || null,
          bank_account_number: billingForm.bank_account_number || null,
          bank_account_name: billingForm.bank_account_name || null,
          payment_display: billingForm.payment_display,
        }),
      });
      if (res.ok) {
        toast.success("Billing configuration saved");
        const data = await res.json();
        setBillingConfig(data);
        setTierDrafts(
          (data.fixed_rate_term_tiers || []).map((t: FixedRateTermTier) => ({
            months: String(t.months),
            discount_pct: String(t.discount_pct),
          })),
        );
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBillingSaving(false);
    }
  };

  const addTier = () => {
    setTierError(null);
    setTierDrafts((prev) => [...prev, { months: "1", discount_pct: "0" }]);
  };
  const removeTier = (idx: number) => {
    setTierError(null);
    setTierDrafts((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateTier = (idx: number, key: keyof TierDraft, value: string) => {
    setTierError(null);
    setTierDrafts((prev) => prev.map((t, i) => (i === idx ? { ...t, [key]: value } : t)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (currentPassword === newPassword) {
      toast.error("New password must be different from current password");
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
        toast.error(data.error || "Failed to change password");
        return;
      }

      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Manage your admin account"
        title="Settings"
        icon={Settings}
      />

      <Card className="border-earth-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-serif text-earth-900">
            <CreditCard className="h-4 w-4 text-brand" />
            Billing Configuration
          </CardTitle>
          <CardDescription className="text-earth-500">
            Platform commission, fixed rate, and payment details for hosts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {billingLoading ? (
            <BillingFormSkeleton />
          ) : (
            <form onSubmit={handleBillingSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="border-t border-earth-100 pt-4">
                <p className="text-sm font-medium text-earth-900 mb-1">Fixed Rate Subscription Terms</p>
                <p className="text-xs text-earth-500 mb-3">
                  Durations (in months) that hosts can choose. Hosts pay upfront for the whole term; the discount % reduces the total.
                </p>
                <div className="space-y-2">
                  {tierDrafts.length === 0 && (
                    <p className="text-xs text-earth-400 italic">No terms configured. Hosts will only see the default 1-month option after their term expires.</p>
                  )}
                  {tierDrafts.map((tier, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor={`tier-months-${i}`} className="text-xs">Months</Label>
                        <Input
                          id={`tier-months-${i}`}
                          type="number"
                          min="1"
                          max="60"
                          step="1"
                          value={tier.months}
                          onChange={(e) => updateTier(i, "months", e.target.value)}
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label htmlFor={`tier-discount-${i}`} className="text-xs">Discount (%)</Label>
                        <Input
                          id={`tier-discount-${i}`}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={tier.discount_pct}
                          onChange={(e) => updateTier(i, "discount_pct", e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setConfirmRemoveTier(i)}
                        aria-label="Remove term"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {tierError && (
                    <p className="text-xs text-red-600">{tierError}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTier}
                    className="mt-2"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Term
                  </Button>
                </div>
              </div>

              <div className="border-t border-earth-100 pt-4">
                <p className="text-sm font-medium text-earth-900 mb-1">Platform Payment Details</p>
                <p className="text-xs text-earth-500 mb-3">
                  Shown to hosts when they need to pay (wallet top-up or monthly invoice).
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          onClick={() => setBillingForm((f) => ({ ...f, payment_display: opt }))}
                          className={cn(
                            "cursor-pointer",
                            billingForm.payment_display === opt
                              ? "bg-brand hover:bg-brand-hover text-white"
                              : "bg-white border border-earth-200 text-earth-700 hover:bg-earth-50 hover:text-brand"
                          )}
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
                className="w-full cursor-pointer bg-brand hover:bg-brand-hover text-white"
                disabled={billingSaving}
              >
                {billingSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Billing Configuration
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 border-earth-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-serif text-earth-900">
            <Lock className="h-4 w-4 text-brand" />
            Change Password
          </CardTitle>
          <CardDescription className="text-earth-500">Update your admin login password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-earth-400 hover:text-brand"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-earth-400 hover:text-brand"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-earth-500">Minimum 8 characters</p>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-earth-400 hover:text-brand"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full cursor-pointer bg-brand hover:bg-brand-hover text-white"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={confirmRemoveTier !== null} onOpenChange={(open) => { if (!open) setConfirmRemoveTier(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Remove Term</DialogTitle>
            <DialogDescription>
              Remove this fixed-rate subscription term? The change takes effect when you save the billing configuration.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer border-earth-200"
              onClick={() => setConfirmRemoveTier(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={() => {
                if (confirmRemoveTier !== null) removeTier(confirmRemoveTier);
                setConfirmRemoveTier(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
