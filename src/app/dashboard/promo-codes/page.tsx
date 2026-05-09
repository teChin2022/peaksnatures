"use client";

import { useState, useEffect, useMemo } from "react";
import { format, parse } from "date-fns";
import { th as thLocale } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { useTranslations, useLocale } from "next-intl";
import {
  Tag,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  CheckCircle2,
  Clock,
  Percent,
  Banknote,
  UserPlus,
  CalendarDays,
} from "lucide-react";
import type { PromoCode, PromoRedemption } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

interface PromoFormState {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  start_at: string;
  expires_at: string;
  max_uses: string;
  one_use_per_guest: boolean;
  is_active: boolean;
  recommender_enabled: boolean;
  recommender_name: string;
  recommender_phone: string;
  recommender_promptpay: string;
  recommender_note: string;
  commission_type: "percentage" | "fixed";
  commission_value: string;
}

const emptyForm: PromoFormState = {
  code: "",
  discount_type: "percentage",
  discount_value: "",
  start_at: "",
  expires_at: "",
  max_uses: "",
  one_use_per_guest: true,
  is_active: true,
  recommender_enabled: false,
  recommender_name: "",
  recommender_phone: "",
  recommender_promptpay: "",
  recommender_note: "",
  commission_type: "percentage",
  commission_value: "",
};

type RedemptionRow = PromoRedemption & {
  promo_code: Pick<PromoCode, "code" | "recommender_name"> | null;
};

export default function PromoCodesPage() {
  const t = useTranslations("dashboardPromoCodes");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [loading, setLoading] = useState(true);
  const [hostName, setHostName] = useState<string | null>(null);
  const [homestayId, setHomestayId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [form, setForm] = useState<PromoFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<RedemptionRow | null>(null);
  const [payNote, setPayNote] = useState("");

  const fmtDate = (s: string | null) => {
    if (!s) return "—";
    const d = parse(s, "yyyy-MM-dd", new Date());
    if (locale === "th") {
      const formatted = format(d, "d MMM", { locale: thLocale });
      return `${formatted} ${d.getFullYear() + 543}`;
    }
    return format(d, "d MMM yyyy");
  };

  const fetchData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: hostRow } = await supabase
      .from("hosts")
      .select("id, name")
      .eq("user_id", user.id)
      .maybeSingle();
    const host = hostRow as { id: string; name: string } | null;
    if (!host) {
      setLoading(false);
      return;
    }
    setHostName(host.name);

    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("id, promo_codes_enabled")
      .eq("host_id", host.id)
      .limit(1)
      .single();
    const homestay = homestayRow as { id: string; promo_codes_enabled: boolean } | null;
    if (!homestay) {
      setLoading(false);
      return;
    }
    setHomestayId(homestay.id);
    setEnabled(homestay.promo_codes_enabled);

    const [{ data: codeRows }, { data: redemptionRows }] = await Promise.all([
      supabase
        .from("promo_codes")
        .select("*")
        .eq("homestay_id", homestay.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("promo_redemptions")
        .select("*, promo_code:promo_codes(code, recommender_name, homestay_id)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    setCodes((codeRows as unknown as PromoCode[]) || []);
    const allRedemptions = (redemptionRows as unknown as (RedemptionRow & { promo_code: { code: string; recommender_name: string | null; homestay_id: string } | null })[]) || [];
    // Filter to this homestay (RLS already restricts but the join may surface nulls)
    setRedemptions(allRedemptions.filter((r) => r.promo_code?.homestay_id === homestay.id));
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  async function toggleEnabled(next: boolean) {
    if (!homestayId) return;
    setSavingFlag(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("homestays")
      .update({ promo_codes_enabled: next, updated_by: hostName || "host" } as never)
      .eq("id", homestayId);
    if (error) {
      toast.error(t("errorSaveFlag"));
    } else {
      setEnabled(next);
      toast.success(next ? t("flagEnabled") : t("flagDisabled"));
    }
    setSavingFlag(false);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(code: PromoCode) {
    setEditing(code);
    setForm({
      code: code.code,
      discount_type: code.discount_type,
      discount_value: String(code.discount_value),
      start_at: code.start_at || "",
      expires_at: code.expires_at || "",
      max_uses: code.max_uses != null ? String(code.max_uses) : "",
      one_use_per_guest: code.one_use_per_guest,
      is_active: code.is_active,
      recommender_enabled: !!code.recommender_name,
      recommender_name: code.recommender_name || "",
      recommender_phone: code.recommender_phone || "",
      recommender_promptpay: code.recommender_promptpay || "",
      recommender_note: code.recommender_note || "",
      commission_type: code.commission_type || "percentage",
      commission_value: code.commission_value != null ? String(code.commission_value) : "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!homestayId) return;
    const codeUpper = form.code.trim().toUpperCase();
    if (!codeUpper) {
      toast.error(t("errorCodeRequired"));
      return;
    }
    const discountValue = Number(form.discount_value);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      toast.error(t("errorDiscountValue"));
      return;
    }
    if (form.discount_type === "percentage" && discountValue > 100) {
      toast.error(t("errorPercentRange"));
      return;
    }

    let commissionType: "percentage" | "fixed" | null = null;
    let commissionValue: number | null = null;
    if (form.recommender_enabled) {
      if (!form.recommender_name.trim()) {
        toast.error(t("errorRecommenderName"));
        return;
      }
      const cv = Number(form.commission_value);
      if (!Number.isFinite(cv) || cv < 0) {
        toast.error(t("errorCommissionValue"));
        return;
      }
      if (form.commission_type === "percentage" && cv > 100) {
        toast.error(t("errorPercentRange"));
        return;
      }
      commissionType = form.commission_type;
      commissionValue = cv;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      homestay_id: homestayId,
      code: codeUpper,
      discount_type: form.discount_type,
      discount_value: discountValue,
      start_at: form.start_at || null,
      expires_at: form.expires_at || null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      one_use_per_guest: form.one_use_per_guest,
      is_active: form.is_active,
      recommender_name: form.recommender_enabled ? form.recommender_name.trim() : null,
      recommender_phone: form.recommender_enabled ? form.recommender_phone.trim() || null : null,
      recommender_promptpay: form.recommender_enabled ? form.recommender_promptpay.trim() || null : null,
      recommender_note: form.recommender_enabled ? form.recommender_note.trim() || null : null,
      commission_type: commissionType,
      commission_value: commissionValue,
      updated_by: hostName || "host",
    };

    if (editing) {
      const { error } = await supabase
        .from("promo_codes")
        .update(payload as never)
        .eq("id", editing.id);
      if (error) {
        console.error(error);
        toast.error(t("errorSave"));
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("promo_codes")
        .insert({ ...payload, created_by: hostName || "host" } as never);
      if (error) {
        console.error(error);
        if ((error.code || "").includes("23505")) {
          toast.error(t("errorDuplicate"));
        } else {
          toast.error(t("errorSave"));
        }
        setSaving(false);
        return;
      }
    }

    toast.success(t("saveSuccess"));
    setDialogOpen(false);
    setSaving(false);
    await fetchData();
  }

  async function handleDelete(code: PromoCode) {
    const used = redemptions.some((r) => r.promo_code_id === code.id);
    const message = used ? t("confirmDeactivate") : t("confirmDelete");
    if (!window.confirm(message)) return;

    const supabase = createClient();
    if (used) {
      const { error } = await supabase
        .from("promo_codes")
        .update({ is_active: false, updated_by: hostName || "host" } as never)
        .eq("id", code.id);
      if (error) {
        toast.error(t("errorSave"));
        return;
      }
      toast.success(t("deactivated"));
    } else {
      const { error } = await supabase.from("promo_codes").delete().eq("id", code.id);
      if (error) {
        toast.error(t("errorSave"));
        return;
      }
      toast.success(t("deleted"));
    }
    await fetchData();
  }

  function openMarkPaid(redemption: RedemptionRow) {
    setPayTarget(redemption);
    setPayNote("");
    setPayDialogOpen(true);
  }

  async function confirmMarkPaid() {
    if (!payTarget) return;
    try {
      const res = await fetch(`/api/host/promo-redemptions/${payTarget.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_note: payNote.trim() || null }),
      });
      if (!res.ok) {
        toast.error(t("errorSave"));
        return;
      }
      toast.success(t("paidSaved"));
      setPayDialogOpen(false);
      setPayTarget(null);
      await fetchData();
    } catch {
      toast.error(t("errorSave"));
    }
  }

  const codeStatus = (c: PromoCode): { label: string; color: string } => {
    const today = format(new Date(), "yyyy-MM-dd");
    if (!c.is_active) return { label: t("statusInactive"), color: "bg-gray-100 text-gray-600" };
    if (c.expires_at && c.expires_at < today) return { label: t("statusExpired"), color: "bg-red-100 text-red-700" };
    if (c.max_uses != null && c.times_used >= c.max_uses) return { label: t("statusUsedUp"), color: "bg-amber-100 text-amber-700" };
    if (c.start_at && c.start_at > today) return { label: t("statusScheduled"), color: "bg-blue-100 text-blue-700" };
    return { label: t("statusActive"), color: "bg-emerald-100 text-emerald-700" };
  };

  const pendingCount = useMemo(
    () => redemptions.filter((r) => r.payout_status === "pending" && r.commission_amount > 0).length,
    [redemptions],
  );

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!homestayId) {
    return <div className="p-6 text-sm text-gray-500">{t("noHomestay")}</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-earth-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-earth-500">{t("subtitle")}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
              <Tag className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="text-base font-semibold text-earth-900">{t("masterTitle")}</p>
              <p className="text-sm text-earth-500">{t("masterDesc")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {savingFlag && <Loader2 className="h-4 w-4 animate-spin text-earth-400" />}
            <Switch checked={enabled} onCheckedChange={toggleEnabled} disabled={savingFlag} />
          </div>
        </CardContent>
      </Card>

      <div className={enabled ? "" : "opacity-60 pointer-events-none"}>
        <Tabs defaultValue="codes" className="w-full">
          <TabsList>
            <TabsTrigger value="codes">{t("tabCodes")} ({codes.length})</TabsTrigger>
            <TabsTrigger value="redemptions">
              {t("tabRedemptions")} ({redemptions.length})
              {pendingCount > 0 && (
                <Badge className="ml-2 bg-amber-100 text-amber-700">{pendingCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="codes" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> {t("newCode")}
              </Button>
            </div>

            {codes.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-earth-500">
                  {t("emptyCodes")}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {codes.map((c) => {
                  const status = codeStatus(c);
                  return (
                    <Card key={c.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="font-mono text-lg">{c.code}</CardTitle>
                            <p className="mt-1 text-xs text-earth-500">
                              {c.discount_type === "percentage"
                                ? `${c.discount_value}% ${t("off")}`
                                : `฿${c.discount_value.toLocaleString()} ${t("off")}`}
                            </p>
                          </div>
                          <Badge className={status.color}>{status.label}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-0">
                        <div className="grid grid-cols-2 gap-2 text-xs text-earth-600">
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-earth-400" />
                            <span>{fmtDate(c.start_at)} → {fmtDate(c.expires_at)}</span>
                          </div>
                          <div>
                            {t("uses")}: {c.times_used}{c.max_uses != null ? ` / ${c.max_uses}` : ""}
                          </div>
                        </div>
                        {c.recommender_name && (
                          <div className="rounded-lg bg-violet-50 p-2 text-xs text-violet-800">
                            <p className="font-medium">{t("recommender")}: {c.recommender_name}</p>
                            {c.commission_type && c.commission_value != null && (
                              <p>
                                {t("commission")}: {c.commission_type === "percentage" ? `${c.commission_value}%` : `฿${c.commission_value.toLocaleString()}`}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            {tc("edit")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(c)} className="text-red-600 hover:bg-red-50">
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            {tc("delete")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="redemptions" className="mt-4 space-y-3">
            {redemptions.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-earth-500">
                  {t("emptyRedemptions")}
                </CardContent>
              </Card>
            ) : (
              redemptions.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-earth-900">
                          {r.promo_code?.code || "—"}
                        </span>
                        {r.payout_status === "pending" ? (
                          <Badge className="bg-amber-100 text-amber-700"><Clock className="mr-1 h-3 w-3" />{t("statusPending")}</Badge>
                        ) : r.payout_status === "paid" ? (
                          <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />{t("statusPaid")}</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-600">{t("statusCancelled")}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-earth-500">
                        {r.guest_phone} · {r.guest_email}
                      </p>
                      <p className="text-xs text-earth-600">
                        {t("discount")}: ฿{r.discount_amount.toLocaleString()}
                        {r.commission_amount > 0 && (
                          <>
                            {" · "}
                            {t("commission")}: <span className="font-semibold text-violet-700">฿{r.commission_amount.toLocaleString()}</span>
                            {r.promo_code?.recommender_name && ` (${r.promo_code.recommender_name})`}
                          </>
                        )}
                      </p>
                      {r.paid_note && (
                        <p className="text-xs text-earth-500 italic">{t("paidNote")}: {r.paid_note}</p>
                      )}
                    </div>
                    {r.commission_amount > 0 && r.payout_status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => openMarkPaid(r)}>
                        <Banknote className="mr-1.5 h-3.5 w-3.5" />
                        {t("markPaid")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{t("formDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t("codeLabel")}</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="SUMMER25"
                className="font-mono uppercase"
                disabled={!!editing}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("discountType")}</Label>
                <Select
                  value={form.discount_type}
                  onValueChange={(v) => setForm({ ...form, discount_type: v as "percentage" | "fixed" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage"><Percent className="mr-1 inline h-3.5 w-3.5" />{t("percentage")}</SelectItem>
                    <SelectItem value="fixed"><Banknote className="mr-1 inline h-3.5 w-3.5" />{t("fixed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("discountValue")}</Label>
                <Input
                  type="number"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                  placeholder={form.discount_type === "percentage" ? "10" : "500"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("startAt")}</Label>
                <DatePickerField
                  value={form.start_at}
                  onChange={(v) => setForm({ ...form, start_at: v })}
                />
              </div>
              <div>
                <Label>{t("expiresAt")}</Label>
                <DatePickerField
                  value={form.expires_at}
                  onChange={(v) => setForm({ ...form, expires_at: v })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("maxUses")}</Label>
                <Input
                  type="number"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  placeholder={t("unlimited")}
                />
              </div>
              <div className="flex items-end gap-2">
                <Switch
                  checked={form.one_use_per_guest}
                  onCheckedChange={(v) => setForm({ ...form, one_use_per_guest: v })}
                  id="one-use"
                />
                <Label htmlFor="one-use" className="text-sm">{t("oneUsePerGuest")}</Label>
              </div>
            </div>

            <div className="rounded-lg border border-earth-200 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-violet-600" />
                  <Label className="text-sm font-semibold">{t("recommenderSection")}</Label>
                </div>
                <Switch
                  checked={form.recommender_enabled}
                  onCheckedChange={(v) => setForm({ ...form, recommender_enabled: v })}
                />
              </div>
              {form.recommender_enabled && (
                <div className="mt-3 space-y-3">
                  <div>
                    <Label>{t("recommenderName")}</Label>
                    <Input
                      value={form.recommender_name}
                      onChange={(e) => setForm({ ...form, recommender_name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("recommenderPhone")}</Label>
                      <Input
                        type="tel"
                        value={form.recommender_phone}
                        onChange={(e) => setForm({ ...form, recommender_phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{t("recommenderPromptpay")}</Label>
                      <Input
                        value={form.recommender_promptpay}
                        onChange={(e) => setForm({ ...form, recommender_promptpay: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>{t("recommenderNote")}</Label>
                    <Textarea
                      value={form.recommender_note}
                      onChange={(e) => setForm({ ...form, recommender_note: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("commissionType")}</Label>
                      <Select
                        value={form.commission_type}
                        onValueChange={(v) => setForm({ ...form, commission_type: v as "percentage" | "fixed" })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">{t("percentage")}</SelectItem>
                          <SelectItem value="fixed">{t("fixed")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("commissionValue")}</Label>
                      <Input
                        type="number"
                        value={form.commission_value}
                        onChange={(e) => setForm({ ...form, commission_value: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                id="is-active"
              />
              <Label htmlFor="is-active" className="text-sm">{t("active")}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tc("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("markPaidTitle")}</DialogTitle>
            <DialogDescription>
              {payTarget && (
                <span>
                  {t("markPaidDesc", { amount: payTarget.commission_amount.toLocaleString(), name: payTarget.promo_code?.recommender_name || "—" })}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("paidNote")}</Label>
            <Textarea
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder={t("paidNotePlaceholder")}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>{tc("cancel")}</Button>
            <Button onClick={confirmMarkPaid}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {t("confirmPaid")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DatePickerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const date = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal">
          <CalendarDays className="mr-2 h-4 w-4" />
          {value || "—"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
        {value && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => { onChange(""); setOpen(false); }}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
