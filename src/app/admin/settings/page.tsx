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
import { LoadError, NETWORK_ERROR, actionFailed } from "@/components/admin/load-error";
import { AdminListCard } from "@/components/admin/admin-list-card";
import { cn } from "@/lib/utils";
import type { FixedRateTermTier } from "@/types/database";
import { PHONE_TAP } from "@/components/admin/table-classes";

const PAYOUT_FIELDS = [
  ["promptpay_id", "PromptPay ID"],
  ["bank_name", "Bank"],
  ["bank_account_number", "Account number"],
  ["bank_account_name", "Account name"],
] as const;

interface BillingConfig {
  id: string;
  commission_pct: number;
  quick_commission_pct: number;
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
      {/* Guest commission % + Quick commission % + Fixed Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1, 2].map((i) => (
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

/** Show/hide password: reachable by keyboard, 36px (44px on phones) inside the field's right edge. */
const EYE =
  "absolute right-1 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-earth-600 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand max-md:size-11 max-md:right-0";

export default function AdminSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  // Tiers waiting on the payout-account confirmation; null when no dialog is open.
  const [payoutConfirm, setPayoutConfirm] = useState<FixedRateTermTier[] | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingSaving, setBillingSaving] = useState(false);
  // Never show the form over blank defaults: saving it would overwrite the real config.
  const [billingLoadFailed, setBillingLoadFailed] = useState(false);
  const [billingForm, setBillingForm] = useState({
    commission_pct: "",
    quick_commission_pct: "",
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
    setBillingLoading(true);
    try {
      const res = await fetch("/api/admin/billing-config");
      if (res.ok) {
        const data: BillingConfig = await res.json();
        setBillingConfig(data);
        setBillingForm({
          commission_pct: String(data.commission_pct),
          quick_commission_pct: String(data.quick_commission_pct),
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
      setBillingLoadFailed(!res.ok);
    } catch {
      setBillingLoadFailed(true);
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

    // Hosts pay into these: a typo sends real money to the wrong place, so confirm first.
    if (payoutChanges.length > 0) {
      setPayoutConfirm(tiers);
      return;
    }
    await saveBilling(tiers);
  };

  const saveBilling = async (tiers: FixedRateTermTier[]) => {
    setBillingSaving(true);
    try {
      const res = await fetch("/api/admin/billing-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commission_pct: parseFloat(billingForm.commission_pct) || 0,
          quick_commission_pct: parseFloat(billingForm.quick_commission_pct) || 0,
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
        toast.error(data.error || actionFailed("save the billing configuration"));
      }
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBillingSaving(false);
    }
  };

  const payoutChanges = PAYOUT_FIELDS.filter(
    ([key]) => billingConfig !== null && (billingConfig[key] || "") !== (billingForm[key] || ""),
  ).map(([key, label]) => ({ label, from: billingConfig?.[key] || "(empty)", to: billingForm[key] || "(empty)" }));

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
        toast.error(data.error || actionFailed("change the password"));
        return;
      }

      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        subtitle="Platform billing and your admin account"
        title="Settings"
        icon={Settings}
      />

      <Card className="border-earth-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-serif text-earth-900">
            <CreditCard className="h-4 w-4 text-brand" />
            Billing Configuration
          </CardTitle>
          <CardDescription className="text-earth-600">
            Platform commission, fixed rate, and payment details for hosts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {billingLoading ? (
            <BillingFormSkeleton />
          ) : billingLoadFailed ? (
            <LoadError what="the billing configuration" onRetry={fetchBillingConfig} />
          ) : (
            // Phones: 44px fields, and Save stays in reach at the bottom while the form is on screen.
            <form onSubmit={handleBillingSave} className="space-y-4 max-md:[&_input]:h-11">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commission_pct">Guest booking commission (%)</Label>
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
                  <Label htmlFor="quick_commission_pct">Quick booking commission (%)</Label>
                  <Input
                    id="quick_commission_pct"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={billingForm.quick_commission_pct}
                    onChange={(e) => setBillingForm((f) => ({ ...f, quick_commission_pct: e.target.value }))}
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
                <p className="text-xs text-earth-600 mb-3">
                  Durations (in months) that hosts can choose. Hosts pay upfront for the whole term; the discount % reduces the total.
                </p>
                <div className="space-y-2">
                  {tierDrafts.length === 0 && (
                    <p className="text-xs text-earth-600 italic">No terms configured. Hosts will only see the default 1-month option after their term expires.</p>
                  )}
                  {tierDrafts.map((tier, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        {/* One visible header row; every field keeps its label for screen readers. */}
                        <Label htmlFor={`tier-months-${i}`} className={cn("text-xs", i > 0 && "sr-only")}>Months</Label>
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
                        <Label htmlFor={`tier-discount-${i}`} className={cn("text-xs", i > 0 && "sr-only")}>Discount (%)</Label>
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
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 max-md:size-11"
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
                    className={cn("mt-2", PHONE_TAP)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Term
                  </Button>
                </div>
              </div>

              <div className="border-t border-earth-100 pt-4">
                <p className="text-sm font-medium text-earth-900 mb-1">Platform Payment Details</p>
                <p className="text-xs text-earth-600 mb-3">
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
                          aria-pressed={billingForm.payment_display === opt}
                          className={cn(
                            "cursor-pointer",
                            PHONE_TAP,
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

              <div className="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-6 max-md:border-t max-md:border-earth-100 max-md:bg-white max-md:px-6 max-md:pt-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button
                  type="submit"
                  className="w-full cursor-pointer bg-brand text-white hover:bg-brand-hover max-md:h-12"
                  disabled={billingSaving}
                >
                  {billingSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Billing Configuration
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <AdminListCard />

      <Card className="mt-6 border-earth-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-serif text-earth-900">
            <Lock className="h-4 w-4 text-brand" />
            Change Password
          </CardTitle>
          <CardDescription className="text-earth-600">Update your admin login password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 max-md:[&_input]:h-11">
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
                  className="pr-12"
                />
                <button
                  type="button"
                  aria-label={showCurrent ? "Hide password" : "Show password"} onClick={() => setShowCurrent(!showCurrent)}
                  className={EYE}
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
                  className="pr-12"
                />
                <button
                  type="button"
                  aria-label={showNew ? "Hide password" : "Show password"} onClick={() => setShowNew(!showNew)}
                  className={EYE}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-earth-600">Minimum 8 characters</p>
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
                  className="pr-12"
                />
                <button
                  type="button"
                  aria-label={showConfirm ? "Hide password" : "Show password"} onClick={() => setShowConfirm(!showConfirm)}
                  className={EYE}
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

      <Dialog open={payoutConfirm !== null} onOpenChange={(o) => !o && setPayoutConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change where hosts pay?</DialogTitle>
            <DialogDescription>
              Hosts see these details for wallet top-ups and invoices. Check them against the bank before saving.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            {payoutChanges.map((c) => (
              <div key={c.label}>
                <dt className="text-xs text-earth-600">{c.label}</dt>
                <dd className="break-all text-earth-800">
                  <span className="text-earth-600 line-through">{c.from}</span> → <span className="font-medium">{c.to}</span>
                </dd>
              </div>
            ))}
          </dl>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setPayoutConfirm(null)}>
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              onClick={() => {
                const tiers = payoutConfirm;
                setPayoutConfirm(null);
                if (tiers) saveBilling(tiers);
              }}
            >
              Save new details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
