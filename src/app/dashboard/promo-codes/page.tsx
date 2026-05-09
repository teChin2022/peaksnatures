"use client";

import { useState, useEffect, useMemo } from "react";
import { format, parse, parseISO, subDays, subMonths, startOfMonth } from "date-fns";
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
  Copy,
  Link as LinkIcon,
  Search,
  Lock,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

function slugPrefix(slug: string | null | undefined): string {
  if (!slug) return "PN";
  const parts = slug
    .split("-")
    .map((p) => p.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "PN";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((p) => p[0]).join("").slice(0, 4).toUpperCase();
}

function generateCodeFromSlug(slug: string | null | undefined, now = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${slugPrefix(slug)}${yyyy}${mm}${dd}${hh}${min}${ss}`;
}

const PAGE_SIZE = 20;
import type { PromoCode, PromoRedemption } from "@/types/database";
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";

const LINE_PALETTE = [
  "#2F5D50", // brand green
  "#F59E0B", // amber
  "#7C3AED", // violet
  "#DC2626", // red
  "#0EA5E9", // sky
  "#EC4899", // pink
  "#10B981", // emerald
  "#6366F1", // indigo
  "#F97316", // orange
  "#14B8A6", // teal
  "#A855F7", // purple
  "#EAB308", // yellow
];
const MONTHS_WINDOW = 6;
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
import { getInitials, sanitizePhoneInput } from "@/lib/utils";

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

type RedemptionFilter = "all" | "pending" | "paid" | "cancelled";

export default function PromoCodesPage() {
  const t = useTranslations("dashboardPromoCodes");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [loading, setLoading] = useState(true);
  const [hostName, setHostName] = useState<string | null>(null);
  const [homestayId, setHomestayId] = useState<string | null>(null);
  const [homestaySlug, setHomestaySlug] = useState<string | null>(null);
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

  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [redemptionFilter, setRedemptionFilter] = useState<RedemptionFilter>("all");
  const [redemptionSearch, setRedemptionSearch] = useState("");

  const [codesPage, setCodesPage] = useState(1);
  const [redemptionsPage, setRedemptionsPage] = useState(1);

  const fmtDate = (s: string | null) => {
    if (!s) return "—";
    const d = parse(s, "yyyy-MM-dd", new Date());
    if (locale === "th") {
      const formatted = format(d, "d MMM", { locale: thLocale });
      return `${formatted} ${d.getFullYear() + 543}`;
    }
    return format(d, "d MMM yyyy");
  };

  const fmtDateTime = (iso: string) => {
    try {
      const d = parseISO(iso);
      if (locale === "th") {
        const formatted = format(d, "d MMM", { locale: thLocale });
        return `${formatted} ${d.getFullYear() + 543}`;
      }
      return format(d, "d MMM yyyy");
    } catch {
      return "";
    }
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
      .select("id, slug, promo_codes_enabled")
      .eq("host_id", host.id)
      .limit(1)
      .single();
    const homestay = homestayRow as
      | { id: string; slug: string | null; promo_codes_enabled: boolean }
      | null;
    if (!homestay) {
      setLoading(false);
      return;
    }
    setHomestayId(homestay.id);
    setHomestaySlug(homestay.slug);
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
    if (!Number.isFinite(discountValue) || discountValue < 0) {
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
      // Strip non-digits so the /recommender stats lookup can match exactly.
      recommender_phone: form.recommender_enabled ? form.recommender_phone.replace(/\D/g, "") || null : null,
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

  function requestDelete(code: PromoCode) {
    setDeleteTarget(code);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const code = deleteTarget;
    const used = redemptions.some((r) => r.promo_code_id === code.id);
    setDeleting(true);
    const supabase = createClient();
    if (used) {
      const { error } = await supabase
        .from("promo_codes")
        .update({ is_active: false, updated_by: hostName || "host" } as never)
        .eq("id", code.id);
      if (error) {
        toast.error(t("errorSave"));
        setDeleting(false);
        return;
      }
      toast.success(t("deactivated"));
    } else {
      const { error } = await supabase.from("promo_codes").delete().eq("id", code.id);
      if (error) {
        toast.error(t("errorSave"));
        setDeleting(false);
        return;
      }
      toast.success(t("deleted"));
    }
    setDeleteTarget(null);
    setDeleting(false);
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

  function isActiveNow(c: PromoCode): boolean {
    const today = format(new Date(), "yyyy-MM-dd");
    if (!c.is_active) return false;
    if (c.expires_at && c.expires_at < today) return false;
    if (c.max_uses != null && c.times_used >= c.max_uses) return false;
    if (c.start_at && c.start_at > today) return false;
    return true;
  }

  const codeStatus = (c: PromoCode): { label: string; pill: string; dot: string } => {
    const today = format(new Date(), "yyyy-MM-dd");
    if (!c.is_active) return { label: t("statusInactive"), pill: "bg-gray-100 text-gray-700", dot: "bg-gray-400" };
    if (c.expires_at && c.expires_at < today) return { label: t("statusExpired"), pill: "bg-red-100 text-red-700", dot: "bg-red-500" };
    if (c.max_uses != null && c.times_used >= c.max_uses) return { label: t("statusUsedUp"), pill: "bg-amber-100 text-amber-700", dot: "bg-amber-500" };
    if (c.start_at && c.start_at > today) return { label: t("statusScheduled"), pill: "bg-blue-100 text-blue-700", dot: "bg-blue-500" };
    return { label: t("statusActive"), pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" };
  };

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("copied"));
    } catch {
      // Silently ignore — clipboard may be unavailable in insecure contexts.
    }
  }

  async function copyShareLink(code: string) {
    if (!homestaySlug) return;
    // Click-time origin keeps preview deploys producing preview URLs, prod producing prod URLs.
    const url = `${window.location.origin}/${homestaySlug}?promo=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copyLinkDone"));
    } catch {
      // Silently ignore — clipboard may be unavailable in insecure contexts.
    }
  }

  const activeCodesCount = useMemo(() => codes.filter(isActiveNow).length, [codes]);

  const recentRedemptionsCount = useMemo(() => {
    const cutoff = format(subDays(new Date(), 30), "yyyy-MM-dd'T'00:00:00");
    return redemptions.filter((r) => r.created_at >= cutoff).length;
  }, [redemptions]);

  const pendingPayouts = useMemo(() => {
    const list = redemptions.filter((r) => r.payout_status === "pending" && r.commission_amount > 0);
    return {
      count: list.length,
      amount: list.reduce((sum, r) => sum + Number(r.commission_amount || 0), 0),
    };
  }, [redemptions]);

  const commissionPaid = useMemo(
    () =>
      redemptions
        .filter((r) => r.payout_status === "paid")
        .reduce((sum, r) => sum + Number(r.commission_amount || 0), 0),
    [redemptions],
  );

  const recommenderTrendData = useMemo(() => {
    // Step 1: collect every recommender ever assigned to a promo code (source of truth)
    // plus any that appear in redemptions (defensive — covers deleted codes).
    const recommenderSet = new Set<string>();
    for (const c of codes) {
      if (c.recommender_name) recommenderSet.add(c.recommender_name);
    }
    for (const r of redemptions) {
      const name = r.promo_code?.recommender_name;
      if (name) recommenderSet.add(name);
    }

    // Step 2: total commission per recommender (used for line order; zero is allowed).
    const totals = new Map<string, number>();
    for (const name of recommenderSet) totals.set(name, 0);
    for (const r of redemptions) {
      const name = r.promo_code?.recommender_name;
      if (!name || r.commission_amount <= 0 || r.payout_status === "cancelled") continue;
      totals.set(name, (totals.get(name) || 0) + Number(r.commission_amount));
    }

    const ranked = Array.from(recommenderSet)
      .map((name) => [name, totals.get(name) || 0] as [string, number])
      .sort((a, b) => b[1] - a[1]);
    const allNames = ranked.map(([n]) => n);

    if (allNames.length === 0) {
      return {
        data: [] as Record<string, string | number>[],
        aliases: [] as string[],
        chartConfig: {} as ChartConfig,
      };
    }

    // Step 2: alias each recommender as r0/r1/... so names work as CSS-var keys.
    const chartConfig: ChartConfig = {};
    const aliasOfName = new Map<string, string>();
    allNames.forEach((name, i) => {
      const alias = `r${i}`;
      aliasOfName.set(name, alias);
      chartConfig[alias] = { label: name, color: LINE_PALETTE[i % LINE_PALETTE.length] };
    });

    // Step 3: build the last 6 month buckets (oldest → newest).
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = MONTHS_WINDOW - 1; i >= 0; i--) {
      const d = startOfMonth(subMonths(now, i));
      const key = format(d, "yyyy-MM");
      const label =
        locale === "th" ? format(d, "MMM", { locale: thLocale }) : format(d, "MMM");
      months.push({ key, label });
    }

    const rows: Record<string, string | number>[] = months.map(({ key, label }) => {
      const row: Record<string, string | number> = { month: label, monthKey: key };
      for (const a of aliasOfName.values()) row[a] = 0;
      return row;
    });

    // Step 4: distribute commission into the right month bucket for each top recommender.
    for (const r of redemptions) {
      const name = r.promo_code?.recommender_name;
      if (!name) continue;
      const alias = aliasOfName.get(name);
      if (!alias) continue;
      if (r.commission_amount <= 0 || r.payout_status === "cancelled") continue;
      const monthKey = (r.created_at || "").slice(0, 7);
      const row = rows.find((x) => x.monthKey === monthKey);
      if (row) row[alias] = (row[alias] as number) + Number(r.commission_amount);
    }

    return {
      data: rows,
      aliases: Array.from(aliasOfName.values()),
      chartConfig,
    };
  }, [codes, redemptions, locale]);

  const filteredRedemptions = useMemo(() => {
    const q = redemptionSearch.trim().toLowerCase();
    return redemptions.filter((r) => {
      if (redemptionFilter !== "all" && r.payout_status !== redemptionFilter) return false;
      if (!q) return true;
      const haystack = [
        r.promo_code?.code,
        r.guest_phone,
        r.guest_email,
        r.promo_code?.recommender_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [redemptions, redemptionFilter, redemptionSearch]);

  const codesTotalPages = Math.max(1, Math.ceil(codes.length / PAGE_SIZE));
  const redemptionsTotalPages = Math.max(1, Math.ceil(filteredRedemptions.length / PAGE_SIZE));

  // Clamp during render so the slice stays valid when the list shrinks
  // (e.g. after delete or filter narrows results).
  const effectiveCodesPage = Math.min(codesPage, codesTotalPages);
  const effectiveRedemptionsPage = Math.min(redemptionsPage, redemptionsTotalPages);

  const pagedCodes = useMemo(
    () => codes.slice((effectiveCodesPage - 1) * PAGE_SIZE, effectiveCodesPage * PAGE_SIZE),
    [codes, effectiveCodesPage],
  );
  const pagedRedemptions = useMemo(
    () =>
      filteredRedemptions.slice(
        (effectiveRedemptionsPage - 1) * PAGE_SIZE,
        effectiveRedemptionsPage * PAGE_SIZE,
      ),
    [filteredRedemptions, effectiveRedemptionsPage],
  );

  const livePreview = useMemo(() => {
    const v = Number(form.discount_value);
    if (!Number.isFinite(v) || v <= 0) return t("previewEmpty");
    return form.discount_type === "percentage"
      ? t("previewPercent", { value: v })
      : t("previewFixed", { value: v.toLocaleString() });
  }, [form.discount_type, form.discount_value, t]);

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!homestayId) {
    return <div className="p-6 text-sm text-earth-500">{t("noHomestay")}</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50">
            <Tag className="h-5 w-5 text-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-earth-900">{t("title")}</h1>
            <p className="mt-0.5 text-sm text-earth-500">{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleEnabled(!enabled)}
            disabled={savingFlag}
            aria-pressed={enabled}
            className={`group inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
              enabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-earth-200 bg-earth-50 text-earth-600 hover:bg-earth-100"
            }`}
          >
            {savingFlag ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-500" : "bg-earth-400"}`} />
            )}
            {enabled ? t("masterStatusOn") : t("masterStatusOff")}
          </button>
          <Button onClick={openCreate} className="cursor-pointer bg-brand text-white hover:brightness-90">
            <Plus className="mr-2 h-4 w-4" />
            {t("newCode")}
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className={`grid grid-cols-2 gap-3 md:grid-cols-4 ${enabled ? "" : "opacity-70"}`}>
        <KpiTile
          icon={<Tag className="h-4 w-4" />}
          tone="brand"
          label={t("kpiActiveCodes")}
          value={activeCodesCount.toLocaleString()}
          sub={t("kpiActiveOf", { total: codes.length })}
        />
        <KpiTile
          icon={<TrendingUp className="h-4 w-4" />}
          tone="emerald"
          label={t("kpiRedemptions30d")}
          value={recentRedemptionsCount.toLocaleString()}
          sub={t("kpiAllTime", { total: redemptions.length })}
        />
        <KpiTile
          icon={<Clock className="h-4 w-4" />}
          tone="amber"
          label={t("kpiPendingPayouts")}
          value={pendingPayouts.count.toLocaleString()}
          sub={t("kpiPendingAmount", { amount: pendingPayouts.amount.toLocaleString() })}
        />
        <KpiTile
          icon={<Banknote className="h-4 w-4" />}
          tone="violet"
          label={t("kpiCommissionPaid")}
          value={`฿${commissionPaid.toLocaleString()}`}
          sub={t("kpiToRecommenders")}
        />
      </div>

      {/* Recommender commission trend (multi-line) */}
      <Card className={`rounded-2xl border-earth-100 shadow-sm ${enabled ? "" : "opacity-70"}`}>
        <CardHeader className="px-6 pb-2 pt-5">
          <CardTitle className="text-sm font-semibold text-earth-900">
            {t("chartCommissionTitle")}
          </CardTitle>
          <p className="text-xs text-earth-400">{t("chartCommissionDesc")}</p>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {recommenderTrendData.aliases.length > 0 ? (
            <ChartContainer
              config={recommenderTrendData.chartConfig}
              className="aspect-auto h-[300px] w-full"
            >
              <LineChart
                accessibilityLayer
                data={recommenderTrendData.data}
                margin={{ top: 16, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v) =>
                    v >= 1000 ? `฿${(v / 1000).toFixed(0)}k` : `฿${v}`
                  }
                  width={55}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      formatter={(value, name) => (
                        <>
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: `var(--color-${name})` }}
                          />
                          <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                            <span className="text-muted-foreground">
                              {(recommenderTrendData.chartConfig[String(name)]
                                ?.label as string) ?? String(name)}
                            </span>
                            <span className="font-mono font-medium tabular-nums">
                              ฿{Number(value).toLocaleString()}
                            </span>
                          </div>
                        </>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
                {recommenderTrendData.aliases.map((alias) => (
                  <Line
                    key={alias}
                    type="monotone"
                    dataKey={alias}
                    stroke={`var(--color-${alias})`}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="py-16 text-center text-sm text-earth-400">{t("chartEmpty")}</p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className={enabled ? "" : "pointer-events-none opacity-60"}>
        <Tabs defaultValue="codes" className="w-full">
          <TabsList>
            <TabsTrigger value="codes">
              {t("tabCodes")} <span className="ml-1 text-earth-500">({codes.length})</span>
            </TabsTrigger>
            <TabsTrigger value="redemptions">
              <span>
                {t("tabRedemptions")} <span className="text-earth-500">({redemptions.length})</span>
              </span>
              {pendingPayouts.count > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700">
                  {pendingPayouts.count}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Codes tab */}
          <TabsContent value="codes" className="mt-4 space-y-4">
            {codes.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                    <Tag className="h-6 w-6 text-brand" />
                  </div>
                  <p className="text-sm text-earth-500">{t("emptyCodes")}</p>
                  <Button onClick={openCreate} className="mt-1 cursor-pointer bg-brand text-white hover:brightness-90">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("newCode")}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {pagedCodes.map((c) => {
                  const status = codeStatus(c);
                  const usesPct =
                    c.max_uses != null && c.max_uses > 0
                      ? Math.min(100, Math.round((c.times_used / c.max_uses) * 100))
                      : null;
                  return (
                    <Card
                      key={c.id}
                      className="border-earth-100 transition-shadow duration-200 hover:shadow-md"
                    >
                      <CardContent className="space-y-3 p-4">
                        {/* Code chip + status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="rounded-lg bg-brand-50 px-3 py-1.5 font-mono text-xl font-bold tracking-wider text-brand-700">
                              {c.code}
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 cursor-pointer text-earth-400 hover:text-brand"
                              aria-label={t("copyCode")}
                              onClick={() => copyCode(c.code)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 cursor-pointer text-earth-400 hover:text-brand disabled:opacity-40"
                              aria-label={t("copyLink")}
                              title={t("copyLink")}
                              disabled={!homestaySlug}
                              onClick={() => copyShareLink(c.code)}
                            >
                              <LinkIcon className="h-4 w-4" />
                            </Button>
                          </div>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.pill}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                        </div>

                        {/* Discount + validity */}
                        <div className="space-y-1.5 text-sm">
                          <div className="font-semibold text-earth-900">
                            {c.discount_type === "percentage"
                              ? `${c.discount_value}% ${t("off")}`
                              : `฿${c.discount_value.toLocaleString()} ${t("off")}`}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-earth-500">
                            <CalendarDays className="h-3.5 w-3.5 text-earth-400" />
                            {c.start_at || c.expires_at ? (
                              <span>
                                {c.start_at ? fmtDate(c.start_at) : t("anytime")} →{" "}
                                {c.expires_at ? fmtDate(c.expires_at) : t("noExpiry")}
                              </span>
                            ) : (
                              <span>{t("alwaysValid")}</span>
                            )}
                          </div>
                        </div>

                        {/* Uses */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-earth-600">
                            <span>{t("uses")}</span>
                            <span className="font-medium text-earth-900">
                              {c.times_used}
                              {c.max_uses != null ? ` / ${c.max_uses}` : ""}
                            </span>
                          </div>
                          {usesPct !== null && (
                            <div className="h-1 w-full overflow-hidden rounded-full bg-earth-100">
                              <div
                                className="h-full rounded-full bg-brand transition-[width] duration-300"
                                style={{ width: `${usesPct}%` }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Recommender */}
                        {c.recommender_name && (
                          <div className="flex items-center gap-2 rounded-lg bg-violet-50 p-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-200 text-xs font-bold text-violet-800">
                              {getInitials(c.recommender_name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-violet-900">
                                {c.recommender_name}
                              </p>
                              {c.commission_type && c.commission_value != null && (
                                <p className="text-[11px] text-violet-700">
                                  {t("commission")}:{" "}
                                  {c.commission_type === "percentage"
                                    ? `${c.commission_value}%`
                                    : `฿${c.commission_value.toLocaleString()}`}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex justify-end gap-1.5 border-t border-earth-100 pt-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(c)}
                            className="cursor-pointer text-earth-700 hover:bg-earth-50"
                            aria-label={tc("edit")}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            {tc("edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => requestDelete(c)}
                            className="cursor-pointer text-red-600 hover:bg-red-50"
                            aria-label={tc("delete")}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            {tc("delete")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <PaginationBar
                page={effectiveCodesPage}
                totalPages={codesTotalPages}
                total={codes.length}
                pageSize={PAGE_SIZE}
                onChange={setCodesPage}
                t={t}
              />
              </>
            )}
          </TabsContent>

          {/* Redemptions tab */}
          <TabsContent value="redemptions" className="mt-4 space-y-3">
            {/* Filter chips + search */}
            {redemptions.length > 0 && (
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "pending", "paid", "cancelled"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setRedemptionFilter(f);
                        setRedemptionsPage(1);
                      }}
                      className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ${
                        redemptionFilter === f
                          ? "bg-brand text-white"
                          : "bg-earth-50 text-earth-600 hover:bg-earth-100"
                      }`}
                    >
                      {f === "all"
                        ? t("filterAll")
                        : f === "pending"
                          ? t("filterPending")
                          : f === "paid"
                            ? t("filterPaid")
                            : t("filterCancelled")}
                    </button>
                  ))}
                </div>
                <div className="relative md:w-72">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-earth-400" />
                  <Input
                    value={redemptionSearch}
                    onChange={(e) => {
                      setRedemptionSearch(e.target.value);
                      setRedemptionsPage(1);
                    }}
                    placeholder={t("searchRedemptions")}
                    className="pl-8"
                  />
                </div>
              </div>
            )}

            {redemptions.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                    <Percent className="h-6 w-6 text-emerald-600" />
                  </div>
                  <p className="text-sm text-earth-500">{t("emptyRedemptions")}</p>
                </CardContent>
              </Card>
            ) : filteredRedemptions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-earth-500">
                  {t("emptyFiltered")}
                </CardContent>
              </Card>
            ) : (
              <>
              {pagedRedemptions.map((r) => {
                const borderColor =
                  r.payout_status === "pending"
                    ? "border-l-amber-400"
                    : r.payout_status === "paid"
                      ? "border-l-emerald-400"
                      : "border-l-earth-200";
                return (
                  <Card key={r.id} className={`border-l-4 ${borderColor} border-earth-100`}>
                    <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-earth-900">
                            {r.promo_code?.code || "—"}
                          </span>
                          {r.payout_status === "pending" ? (
                            <Badge className="bg-amber-100 text-amber-700">
                              <Clock className="mr-1 h-3 w-3" />
                              {t("statusPending")}
                            </Badge>
                          ) : r.payout_status === "paid" ? (
                            <Badge className="bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {t("statusPaid")}
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600">
                              {t("statusCancelled")}
                            </Badge>
                          )}
                          <span className="text-xs text-earth-400">{fmtDateTime(r.created_at)}</span>
                        </div>
                        <p className="text-xs text-earth-500">
                          {r.guest_phone} · {r.guest_email}
                        </p>
                        <p className="text-xs text-earth-600">
                          {t("discount")}: ฿{r.discount_amount.toLocaleString()}
                          {r.commission_amount > 0 && (
                            <>
                              {" · "}
                              {t("commission")}:{" "}
                              <span className="font-semibold text-violet-700">
                                ฿{r.commission_amount.toLocaleString()}
                              </span>
                              {r.promo_code?.recommender_name && ` (${r.promo_code.recommender_name})`}
                            </>
                          )}
                        </p>
                        {r.paid_note && (
                          <p className="text-xs italic text-earth-500">
                            {t("paidNote")}: {r.paid_note}
                          </p>
                        )}
                      </div>
                      {r.commission_amount > 0 && r.payout_status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openMarkPaid(r)}
                          className="cursor-pointer"
                        >
                          <Banknote className="mr-1.5 h-3.5 w-3.5" />
                          {t("markPaid")}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              <PaginationBar
                page={effectiveRedemptionsPage}
                totalPages={redemptionsTotalPages}
                total={filteredRedemptions.length}
                pageSize={PAGE_SIZE}
                onChange={setRedemptionsPage}
                t={t}
              />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{t("formDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Visibility (active toggle moved to top) */}
            <div className="flex items-center justify-between rounded-lg bg-earth-50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${form.is_active ? "bg-emerald-500" : "bg-earth-400"}`}
                />
                <Label htmlFor="is-active" className="text-sm font-medium text-earth-800">
                  {t("active")}
                </Label>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                id="is-active"
                className="data-[state=checked]:bg-brand"
              />
            </div>

            {/* Code */}
            <div className="space-y-1.5">
              <Label>{t("codeLabel")}</Label>
              <div className="relative">
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="SUMMER25"
                  className={`font-mono uppercase ${editing ? "pr-9" : "pr-10"}`}
                  disabled={!!editing}
                />
                {editing ? (
                  <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-earth-400" />
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      setForm({ ...form, code: generateCodeFromSlug(homestaySlug) })
                    }
                    aria-label={t("generateCode")}
                    title={t("generateCode")}
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 cursor-pointer text-earth-500 hover:text-brand"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-earth-500">{t("codeHelpAuto")}</p>
            </div>

            {/* Discount section */}
            <section className="space-y-3 border-t border-earth-100 pt-4">
              <h3 className="text-sm font-semibold text-earth-800">{t("sectionDiscount")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("discountType")}</Label>
                  <Select
                    value={form.discount_type}
                    onValueChange={(v) => setForm({ ...form, discount_type: v as "percentage" | "fixed" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">
                        <Percent className="mr-1 inline h-3.5 w-3.5" />
                        {t("percentage")}
                      </SelectItem>
                      <SelectItem value="fixed">
                        <Banknote className="mr-1 inline h-3.5 w-3.5" />
                        {t("fixed")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("discountValue")}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={form.discount_value}
                      onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                      placeholder={form.discount_type === "percentage" ? "10" : "500"}
                      className={form.discount_type === "fixed" ? "pl-7" : "pr-7"}
                    />
                    <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-earth-500"
                      style={form.discount_type === "fixed" ? { left: 12 } : { right: 12 }}>
                      {form.discount_type === "fixed" ? "฿" : "%"}
                    </span>
                  </div>
                </div>
              </div>
              <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-700">
                {livePreview}
              </p>
            </section>

            {/* Validity section */}
            <section className="space-y-3 border-t border-earth-100 pt-4">
              <h3 className="text-sm font-semibold text-earth-800">{t("sectionValidity")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("startAt")}</Label>
                  <DatePickerField
                    value={form.start_at}
                    onChange={(v) => {
                      // Clear expires_at if it would now be before the new start_at.
                      if (form.expires_at && v && form.expires_at < v) {
                        setForm({ ...form, start_at: v, expires_at: "" });
                      } else {
                        setForm({ ...form, start_at: v });
                      }
                    }}
                    placeholder={t("pickDate")}
                    clearLabel={t("clearDate")}
                    locale={locale}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("expiresAt")}</Label>
                  <DatePickerField
                    value={form.expires_at}
                    onChange={(v) => setForm({ ...form, expires_at: v })}
                    placeholder={t("pickDate")}
                    clearLabel={t("clearDate")}
                    locale={locale}
                    disabledBefore={form.start_at || undefined}
                  />
                </div>
              </div>
              {!form.start_at && !form.expires_at && (
                <p className="text-xs text-earth-500">{t("validityAnytime")}</p>
              )}
            </section>

            {/* Limits section */}
            <section className="space-y-3 border-t border-earth-100 pt-4">
              <h3 className="text-sm font-semibold text-earth-800">{t("sectionLimits")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("maxUses")}</Label>
                  <Input
                    type="number"
                    value={form.max_uses}
                    onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                    placeholder={t("unlimited")}
                  />
                  <p className="text-xs text-earth-500">{t("maxUsesHelp")}</p>
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Switch
                    checked={form.one_use_per_guest}
                    onCheckedChange={(v) => setForm({ ...form, one_use_per_guest: v })}
                    id="one-use"
                    className="data-[state=checked]:bg-brand"
                  />
                  <Label htmlFor="one-use" className="text-sm">
                    {t("oneUsePerGuest")}
                  </Label>
                </div>
              </div>
            </section>

            {/* Recommender section */}
            <section className="space-y-3 border-t border-earth-100 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-violet-600" />
                  <h3 className="text-sm font-semibold text-earth-800">{t("sectionRecommender")}</h3>
                </div>
                <Switch
                  checked={form.recommender_enabled}
                  onCheckedChange={(v) => setForm({ ...form, recommender_enabled: v })}
                  className="data-[state=checked]:bg-brand"
                />
              </div>
              {form.recommender_enabled && (
                <div className="space-y-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                  <p className="text-xs text-violet-800">{t("recommenderHelp")}</p>
                  <div className="space-y-1.5">
                    <Label>{t("recommenderName")}</Label>
                    <Input
                      value={form.recommender_name}
                      onChange={(e) => setForm({ ...form, recommender_name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t("recommenderPhone")}</Label>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={form.recommender_phone}
                        onChange={(e) => setForm({ ...form, recommender_phone: sanitizePhoneInput(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("recommenderPromptpay")}</Label>
                      <Input
                        value={form.recommender_promptpay}
                        onChange={(e) => setForm({ ...form, recommender_promptpay: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("recommenderNote")}</Label>
                    <Textarea
                      value={form.recommender_note}
                      onChange={(e) => setForm({ ...form, recommender_note: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t("commissionType")}</Label>
                      <Select
                        value={form.commission_type}
                        onValueChange={(v) =>
                          setForm({ ...form, commission_type: v as "percentage" | "fixed" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">{t("percentage")}</SelectItem>
                          <SelectItem value="fixed">{t("fixed")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("commissionValue")}</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={form.commission_value}
                          onChange={(e) => setForm({ ...form, commission_value: e.target.value })}
                          className={form.commission_type === "fixed" ? "pl-7" : "pr-7"}
                        />
                        <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-earth-500"
                          style={form.commission_type === "fixed" ? { left: 12 } : { right: 12 }}>
                          {form.commission_type === "fixed" ? "฿" : "%"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="cursor-pointer">
              {tc("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="cursor-pointer bg-brand text-white hover:brightness-90">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark paid dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("markPaidTitle")}</DialogTitle>
            <DialogDescription>
              {payTarget && (
                <span>
                  {t("markPaidDesc", {
                    amount: payTarget.commission_amount.toLocaleString(),
                    name: payTarget.promo_code?.recommender_name || "—",
                  })}
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
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} className="cursor-pointer">
              {tc("cancel")}
            </Button>
            <Button onClick={confirmMarkPaid} className="cursor-pointer bg-brand text-white hover:brightness-90">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {t("confirmPaid")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tc("delete")}</DialogTitle>
            <DialogDescription>
              {deleteTarget &&
                (redemptions.some((r) => r.promo_code_id === deleteTarget.id)
                  ? t("confirmDeactivate")
                  : t("confirmDelete"))}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="cursor-pointer"
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="cursor-pointer bg-red-600 text-white hover:bg-red-700"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiTile({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  tone: "brand" | "emerald" | "amber" | "violet";
  label: string;
  value: string;
  sub: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    brand: "bg-brand-50 text-brand",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <Card className="border-earth-100">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
            {icon}
          </span>
          <span className="text-xs font-medium text-earth-500">{label}</span>
        </div>
        <p className="text-2xl font-semibold text-earth-900">{value}</p>
        <p className="truncate text-xs text-earth-500">{sub}</p>
      </CardContent>
    </Card>
  );
}

function DatePickerField({
  value,
  onChange,
  placeholder,
  clearLabel,
  locale,
  disabledBefore,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  clearLabel: string;
  locale?: string;
  disabledBefore?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const minDate = disabledBefore ? parse(disabledBefore, "yyyy-MM-dd", new Date()) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full cursor-pointer justify-start text-left font-normal ${value ? "" : "text-earth-400"}`}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date ?? minDate}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
          locale={locale === "th" ? thLocale : undefined}
          formatters={locale === "th" ? {
            formatMonthDropdown: (d) => d.toLocaleDateString("th-TH", { month: "long" }),
            formatYearDropdown: (d) => String(d.getFullYear() + 543),
            formatCaption: (d) =>
              `${d.toLocaleDateString("th-TH", { month: "long" })} ${d.getFullYear() + 543}`,
            formatWeekdayName: (d) => d.toLocaleDateString("th-TH", { weekday: "narrow" }),
          } : undefined}
          disabled={minDate ? { before: minDate } : undefined}
        />
        {value && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full cursor-pointer"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {clearLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
  t,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col items-center justify-between gap-2 pt-2 sm:flex-row">
      <p className="text-xs text-earth-500">
        {t("showingRange", { from, to, total })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="cursor-pointer"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("previous")}
        </Button>
        <span className="text-xs font-medium text-earth-700">
          {t("pageOf", { page })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="cursor-pointer"
        >
          {t("next")}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
