"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { billingTodayStr } from "@/lib/billing-dates";
import { fmtDate, fmtDateStr } from "@/lib/format-date";
import { EXPENSE_CATEGORIES, shiftMonth, type ExpenseCategory, type MonthSummary } from "@/lib/host-finance";

/** The Team page's controls (staff-card.tsx): 44px on phones, 36px from the sidebar breakpoint. */
const TAP = "h-11 lg:h-9";
const PRIMARY = "rounded-full bg-brand text-white hover:bg-brand-hover";
const OUTLINE = "rounded-full border-earth-200 text-earth-800 shadow-none hover:bg-earth-50";
const FIELD = "rounded-xl shadow-none";
const SURFACE = "rounded-2xl border border-earth-200 bg-white";
const MAX_AMOUNT = 10_000_000;

interface ExpenseRow {
  id: string;
  spent_on: string;
  category: ExpenseCategory;
  amount: number;
  note: string | null;
}
type MonthData = MonthSummary & { month: string; expenses: ExpenseRow[] };

/** Whole baht as ฿1,240; with satang always two places, ฿1,240.50. */
const baht = (n: number) => {
  const v = Math.abs(n);
  return `฿${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};
/** A charge reads as money out; a net refund of commission reads as money back. */
const charge = (n: number) => `${n >= 0 ? "−" : "+"}${baht(n)}`;

/** One month's summary and expenses (null month: this Bangkok month), or null when it could not be loaded. */
async function fetchMonth(month: string | null): Promise<MonthData | null> {
  try {
    const res = await fetch(month ? `/api/host/expenses?month=${month}` : "/api/host/expenses", { cache: "no-store" });
    return res.ok ? ((await res.json()) as MonthData) : null;
  } catch {
    return null;
  }
}

/** Owner-only: the middleware sends staff logins away, and /api/host/expenses refuses them. */
export default function ExpensesPage() {
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const locale = useLocale();
  // null until the server names this Bangkok month on the first load.
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<MonthData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // The add/edit dialog: "new", the row being corrected, or closed.
  const [form, setForm] = useState<ExpenseRow | "new" | null>(null);
  const [removing, setRemoving] = useState<ExpenseRow | null>(null);
  // The row just added or corrected, tinted for a moment so the host sees where it landed.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // The month to load (null: this month, which the server names) and a counter so a retry reloads it.
  const [request, setRequest] = useState<{ month: string | null; n: number }>({ month: null, n: 0 });

  useEffect(() => {
    // Quick ‹ › taps can answer out of order: only the latest request may fill the page.
    let live = true;
    fetchMonth(request.month).then((body) => {
      if (!live) return;
      if (body) {
        setMonth(body.month);
        setData(body);
      }
      setLoadFailed(!body);
    });
    return () => {
      live = false;
    };
  }, [request]);

  useEffect(() => {
    // Once the saved row is on screen: bring it into view, then let the tint fade.
    if (!highlightId || !data?.expenses.some((r) => r.id === highlightId)) return;
    document.getElementById(`expense-${highlightId}`)?.scrollIntoView({ block: "nearest" });
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
  }, [data, highlightId]);

  /** Another month: the skeleton until it arrives. */
  const goTo = (m: string | null) => {
    if (m) setMonth(m);
    setData(null);
    setLoadFailed(false);
    setRequest((r) => ({ month: m, n: r.n + 1 }));
  };
  /** The same month after a change: the old figures stay on screen until the new ones arrive. */
  const reload = (m: string) => setRequest((r) => ({ month: m, n: r.n + 1 }));

  // After a delete the row's trash button is gone, so focus goes to the add button, not <body>.
  const addRef = useRef<HTMLButtonElement>(null);
  const removedRef = useRef(false);

  const thisMonth = billingTodayStr().slice(0, 7);
  const monthLabel = (m: string) => fmtDate(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1), "MMMM yyyy", locale);
  const platform = data ? Math.round((data.commission + data.planFees) * 100) / 100 : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-earth-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-earth-700">{t("intro")}</p>
      </div>

      {!month && !loadFailed && (
        // Holds the month bar's place on the first load, so the page does not jump when it arrives.
        <div className="mb-3 flex h-11 items-center justify-center lg:h-9">
          <Skeleton className="h-6 w-40 bg-earth-100" />
        </div>
      )}
      {month && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-full text-earth-700 hover:text-earth-900 lg:size-9"
            aria-label={t("prevMonth")}
            onClick={() => goTo(shiftMonth(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <h2 aria-live="polite" className="font-serif text-xl text-earth-900 lining-nums">
            {monthLabel(month)}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-full text-earth-700 hover:text-earth-900 lg:size-9"
            aria-label={t("nextMonth")}
            disabled={month >= thisMonth}
            onClick={() => goTo(shiftMonth(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
      {month && month < thisMonth && (
        <div className="-mt-2 mb-3 flex justify-center">
          <button
            type="button"
            onClick={() => goTo(thisMonth)}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand lg:min-h-9"
          >
            {t("backToThisMonth")}
          </button>
        </div>
      )}

      {loadFailed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{t("errorLoad")}</p>
          <Button variant="outline" className={cn(TAP, OUTLINE, "shrink-0")} onClick={() => goTo(month)}>
            {t("retry")}
          </Button>
        </div>
      ) : data === null ? (
        <div role="status" className="space-y-6">
          <span className="sr-only">{tc("loading")}</span>
          <div className={cn(SURFACE, "space-y-3 p-5")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex justify-between gap-3">
                <Skeleton className="h-4 w-2/5 bg-earth-100" />
                <Skeleton className="h-4 w-1/5 bg-earth-100" />
              </div>
            ))}
            <Skeleton className="ml-auto mt-4 h-8 w-1/3 bg-earth-100" />
          </div>
          <Skeleton className="h-28 w-full rounded-2xl bg-earth-100" />
        </div>
      ) : (
        <>
          <section aria-label={t("summaryAria", { month: monthLabel(data.month) })} className={cn(SURFACE, "p-5 lg:p-6")}>
            {/* The intro's formula, line for line: income − platform charges − recorded expenses = net. */}
            <dl className="space-y-2.5 text-sm">
              <SummaryRow label={t("income")} value={baht(data.revenue)} />
              {(data.commission !== 0 || data.planFees !== 0) && (
                <>
                  <SummaryRow label={t("platformFees")} value={charge(platform)} />
                  {data.commission !== 0 && (
                    <SummaryRow
                      sub
                      label={data.commission > 0 ? t("commission") : t("commissionRefund")}
                      value={charge(data.commission)}
                    />
                  )}
                  {data.planFees !== 0 && <SummaryRow sub label={t("planFees")} value={charge(data.planFees)} />}
                </>
              )}
              <SummaryRow
                label={t("listTitle")}
                value={data.totalExpenses > 0 ? charge(data.totalExpenses) : t("noneRecorded")}
                muted={data.totalExpenses === 0}
              />
            </dl>
            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-earth-200 pt-4">
              <span className="text-base font-semibold text-earth-900">{t("net")}</span>
              <span className={cn("font-serif text-3xl lining-nums tabular-nums", data.net < 0 ? "text-red-700" : "text-earth-900")}>
                {data.net < 0 && "−"}
                {baht(data.net)}
              </span>
            </div>
            <p className="mt-3 text-sm text-earth-600">{t("basis")}</p>
          </section>

          <section className="mt-6" aria-labelledby="expenses-list-title">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 id="expenses-list-title" className="text-base font-semibold text-earth-900">
                {t("listTitle")}
              </h2>
              <Button ref={addRef} className={cn(TAP, PRIMARY, "shrink-0 px-4")} onClick={() => setForm("new")}>
                <Plus aria-hidden />
                {t("add")}
              </Button>
            </div>
            <ul className={cn(SURFACE, "divide-y divide-earth-200")}>
              {data.expenses.length === 0 && <li className="px-4 py-6 text-center text-sm text-earth-600">{t("empty")}</li>}
              {data.expenses.map((row) => (
                <li
                  key={row.id}
                  id={`expense-${row.id}`}
                  className="relative flex items-center gap-1 py-1.5 pr-2 pl-1.5 first:rounded-t-2xl last:rounded-b-2xl"
                >
                  {/* The just-saved row: a Forest Mist tint that fades out (opacity only). */}
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-0 rounded-[inherit] bg-brand-50 transition-opacity duration-300 motion-reduce:transition-none",
                      row.id === highlightId ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setForm(row)}
                    aria-label={t("editAria", {
                      category: t(`categories.${row.category}`),
                      date: fmtDateStr(row.spent_on, "d MMM", locale),
                      amount: baht(row.amount),
                    })}
                    className="relative flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-earth-50 focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-earth-900">{t(`categories.${row.category}`)}</span>
                      <span className="block text-sm text-earth-600 [overflow-wrap:anywhere]">
                        {fmtDateStr(row.spent_on, "d MMM", locale)}
                        {row.note && ` · ${row.note}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-base font-medium text-earth-900 tabular-nums">{baht(row.amount)}</span>
                    <Pencil className="size-4 shrink-0 text-earth-600" aria-hidden />
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative size-11 shrink-0 rounded-full text-earth-600 hover:text-red-700 lg:size-9"
                    aria-label={t("deleteAria", {
                      category: t(`categories.${row.category}`),
                      date: fmtDateStr(row.spent_on, "d MMM", locale),
                      amount: baht(row.amount),
                    })}
                    onClick={() => setRemoving(row)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        {form && month && (
          <ExpenseDialog
            key={form === "new" ? "new" : form.id}
            initial={form === "new" ? undefined : form}
            defaultDate={month === thisMonth ? billingTodayStr() : `${month}-01`}
            onClose={() => setForm(null)}
            onSaved={(spentOn, id) => {
              toast.success(t(form === "new" ? "saved" : "updated"));
              setForm(null);
              setHighlightId(id);
              const savedMonth = spentOn.slice(0, 7);
              if (savedMonth === month) reload(month);
              else goTo(savedMonth);
            }}
          />
        )}
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        {removing && (
          <RemoveExpenseDialog
            row={removing}
            onClose={() => setRemoving(null)}
            onCloseAutoFocus={(e) => {
              if (!removedRef.current) return;
              removedRef.current = false;
              e.preventDefault();
              addRef.current?.focus();
            }}
            onRemoved={() => {
              removedRef.current = true;
              setRemoving(null);
              toast.success(t("removed"));
              if (month) reload(month);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function SummaryRow({ label, value, sub, muted }: { label: string; value: string; sub?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", sub && "pl-4")}>
      <dt className={sub ? "text-earth-600" : "text-earth-700"}>{label}</dt>
      <dd className={cn("tabular-nums", sub || muted ? "text-earth-600" : "text-earth-900")}>{value}</dd>
    </div>
  );
}

type Field = "date" | "category" | "amount";
/** Form order, for focusing the first field with an error. */
const FIELD_ORDER: Field[] = ["category", "amount", "date"];

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
      {error}
    </p>
  ) : null;
}

/** Adds an expense, or corrects `initial` when given. */
function ExpenseDialog({
  initial,
  defaultDate,
  onClose,
  onSaved,
}: {
  initial?: ExpenseRow;
  defaultDate: string;
  onClose: () => void;
  onSaved: (spentOn: string, id: string) => void;
}) {
  const t = useTranslations("expenses");
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const [date, setDate] = useState(initial?.spent_on ?? defaultDate);
  const [category, setCategory] = useState<ExpenseCategory | "">(initial?.category ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = billingTodayStr();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, "").trim());
    const invalid: Partial<Record<Field, string>> = {};
    if (!category) invalid.category = t("errorCategory");
    if (!amount.trim()) invalid.amount = t("errorAmountRequired");
    else if (!Number.isFinite(value) || value < 0.01 || value > MAX_AMOUNT) invalid.amount = t("errorAmount");
    if (!date) invalid.date = t("errorDate");
    // The API refuses it too: a future month is past the page's › button.
    else if (date > today) invalid.date = t("errorDateFuture");
    setErrors(invalid);
    setFormError(null);
    const firstInvalid = FIELD_ORDER.find((f) => invalid[f]);
    if (firstInvalid) {
      document.getElementById(id(firstInvalid))?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(initial ? `/api/host/expenses/${initial.id}` : "/api/host/expenses", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spent_on: date, category, amount: value, note: note.trim() || null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { id: savedId } = (await res.json()) as { id: string };
      onSaved(date, savedId);
    } catch {
      setFormError(t("errorSave"));
    } finally {
      setBusy(false);
    }
  };

  const errorId = (f: Field) => (errors[f] ? `${id(f)}-error` : undefined);

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 leading-snug">{initial ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription className="text-earth-600">{t("addDesc")}</DialogDescription>
        </DialogHeader>

        {formError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}

        {/* What, how much, when. The dialog focuses the category first, so no keyboard covers the form on phones. */}
        <div className="space-y-2">
          <Label htmlFor={id("category")}>{t("category")}</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
            <SelectTrigger
              id={id("category")}
              aria-invalid={!!errors.category}
              aria-describedby={errorId("category")}
              // The trigger sets its own data-[size=default]:h-9, which a plain h-11 does not beat.
              className={cn(FIELD, "w-full data-[size=default]:h-11 lg:data-[size=default]:h-9")}
            >
              <SelectValue placeholder={t("categoryPlaceholder")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="min-h-11 lg:min-h-9">
                  {t(`categories.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={id("category")} error={errors.category} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={id("amount")}>{t("amount")}</Label>
            <Input
              id={id("amount")}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("amountPlaceholder")}
              aria-invalid={!!errors.amount}
              aria-describedby={errorId("amount")}
              className={cn(TAP, FIELD, "tabular-nums")}
            />
            <FieldError id={id("amount")} error={errors.amount} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("date")}>{t("date")}</Label>
            <Input
              id={id("date")}
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!errors.date}
              aria-describedby={errorId("date")}
              className={cn(TAP, FIELD)}
            />
            <FieldError id={id("date")} error={errors.date} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={id("note")}>{t("note")}</Label>
          <Input
            id={id("note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            autoComplete="off"
            placeholder={t("notePlaceholder")}
            className={cn(TAP, FIELD)}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className={cn(TAP, OUTLINE)} onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={busy} className={cn(TAP, PRIMARY)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RemoveExpenseDialog({
  row,
  onClose,
  onRemoved,
  onCloseAutoFocus,
}: {
  row: ExpenseRow;
  onClose: () => void;
  onRemoved: () => void;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/host/expenses/${row.id}`, { method: "DELETE" });
      // 404: already gone (deleted in another tab), which is what the host wanted.
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      onRemoved();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-sm" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader className="text-left">
        <DialogTitle className="pr-6 leading-snug">{t("removeTitle")}</DialogTitle>
        <DialogDescription className="text-earth-600">{t("removeDesc")}</DialogDescription>
      </DialogHeader>
      <p className="flex justify-between gap-3 rounded-xl bg-earth-50 px-3 py-2 text-sm text-earth-900">
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {t(`categories.${row.category}`)} · {fmtDateStr(row.spent_on, "d MMM yyyy", locale)}
          {row.note && ` · ${row.note}`}
        </span>
        <span className="shrink-0 font-medium tabular-nums">{baht(row.amount)}</span>
      </p>
      {failed && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("errorRemove")}
        </div>
      )}
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" className={cn(TAP, OUTLINE)} onClick={onClose} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={remove}
          className={cn(TAP, "rounded-full bg-red-700 text-white hover:bg-red-800")}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("remove")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
