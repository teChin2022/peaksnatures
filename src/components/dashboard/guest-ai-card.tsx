"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Clock, Loader2, MessageCircleQuestion, PauseCircle, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AI_INSTRUCTIONS_MAX } from "@/lib/host-ai";
import { cn } from "@/lib/utils";
import type { HostAiSettings } from "@/types/database";

/** What /api/host/ai-admin returns (HOST_AI_COLUMNS). */
export type GuestAiSettings = Omit<HostAiSettings, "decided_by" | "updated_at" | "wallet_low_notified_at">;

type Toggle = "enabled" | "can_answer" | "can_set_dates" | "can_suggest_houses" | "can_navigate";

const PERMISSIONS: { key: Exclude<Toggle, "enabled">; label: string; desc: string }[] = [
  { key: "can_answer", label: "canAnswer", desc: "canAnswerDesc" },
  { key: "can_set_dates", label: "canSetDates", desc: "canSetDatesDesc" },
  { key: "can_suggest_houses", label: "canSuggestHouses", desc: "canSuggestHousesDesc" },
  { key: "can_navigate", label: "canNavigate", desc: "canNavigateDesc" },
];

/** Same controls as the Team page (DESIGN.md: pill buttons, flat Sand cards, 44px on phones). */
const TAP = "h-11 lg:h-9";
const PRIMARY = "rounded-full bg-brand text-white hover:bg-brand-hover";
const OUTLINE = "rounded-full border-earth-200 text-earth-800 shadow-none hover:bg-earth-50";
const SURFACE = "rounded-2xl border border-earth-200 bg-white";

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; settings: GuestAiSettings | null };

async function fetchSettings(): Promise<{ settings: GuestAiSettings | null; pricePerReply: number } | undefined> {
  try {
    const res = await fetch("/api/host/ai-admin");
    if (!res.ok) return undefined;
    const body = (await res.json()) as { settings: GuestAiSettings | null; pricePerReply?: number };
    return { settings: body.settings, pricePerReply: body.pricePerReply ?? 0 };
  } catch {
    return undefined;
  }
}

/**
 * The host's guest AI assistant (migration 084): ask for it, then — once a
 * platform admin approves — turn it on, choose what it may do and give it notes.
 * Owner only, like the Team page.
 */
export function GuestAiCard() {
  const t = useTranslations("guestAi");
  const tc = useTranslations("common");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [pricePerReply, setPricePerReply] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let live = true;
    fetchSettings().then((got) => {
      if (!live) return;
      setLoad(got === undefined ? { state: "error" } : { state: "ready", settings: got.settings });
      if (got) setPricePerReply(got.pricePerReply);
    });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const request = async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/host/ai-admin", { method: "POST" });
      if (res.ok) {
        const { settings } = (await res.json()) as { settings: GuestAiSettings };
        setLoad({ state: "ready", settings });
        toast.success(t("requestSent"));
      } else {
        toast.error(res.status === 409 ? t("errorChanged") : t("errorSave"));
        reload();
      }
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setRequesting(false);
    }
  };

  const settings = load.state === "ready" ? load.settings : null;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-earth-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-earth-700">{t("intro")}</p>
      </div>

      {load.state === "error" ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{t("errorLoad")}</p>
          <Button variant="outline" className={cn(TAP, OUTLINE, "shrink-0")} onClick={reload}>
            {t("retry")}
          </Button>
        </div>
      ) : load.state === "loading" ? (
        <div role="status" className={cn(SURFACE, "space-y-3 p-5")}>
          <span className="sr-only">{tc("loading")}</span>
          <Skeleton className="h-5 w-1/2 bg-earth-100" />
          <Skeleton className="h-4 w-3/4 bg-earth-100" />
        </div>
      ) : !settings ? (
        <div className={cn(SURFACE, "px-5 py-8 text-center")}>
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand">
            <MessageCircleQuestion className="size-6" aria-hidden />
          </span>
          <p className="mt-3 text-base font-semibold text-earth-900">{t("noneTitle")}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-earth-600">{t("noneBody")}</p>
          <Button className={cn("mt-5 h-12 px-6", PRIMARY)} onClick={request} disabled={requesting}>
            {requesting && <Loader2 className="animate-spin" />}
            {t("request")}
          </Button>
        </div>
      ) : settings.status === "approved" ? (
        <ApprovedSettings
          settings={settings}
          pricePerReply={pricePerReply}
          onChange={(s) => setLoad({ state: "ready", settings: s })}
          onStale={reload}
        />
      ) : (
        <StatusNotice settings={settings} onRequestAgain={request} requesting={requesting} />
      )}

      <ul className="mt-6 space-y-2 text-sm text-earth-700">
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>
            <span className="font-semibold text-earth-900">{t("canTitle")}</span> {t("canList")}
          </span>
        </li>
        <li className="flex gap-2">
          <X className="mt-0.5 size-4 shrink-0 text-earth-600" aria-hidden />
          <span>
            <span className="font-semibold text-earth-900">{t("cannotTitle")}</span> {t("cannotList")}
          </span>
        </li>
      </ul>
    </div>
  );
}

/** Waiting, not approved, or suspended: one line of what happens next. */
function StatusNotice({
  settings,
  onRequestAgain,
  requesting,
}: {
  settings: GuestAiSettings;
  onRequestAgain: () => void;
  requesting: boolean;
}) {
  const t = useTranslations("guestAi");
  const locale = useLocale();
  const date = new Date(settings.requested_at).toLocaleDateString(locale === "th" ? "th-TH" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const notice =
    settings.status === "requested"
      ? { icon: Clock, tone: "border-amber-200 bg-amber-50 text-amber-800", title: t("requestedTitle"), body: t("requestedBody", { date }) }
      : settings.status === "rejected"
        ? { icon: XCircle, tone: "border-earth-200 bg-white text-earth-800", title: t("rejectedTitle"), body: t("rejectedBody") }
        : { icon: PauseCircle, tone: "border-red-200 bg-red-50 text-red-800", title: t("suspendedTitle"), body: t("suspendedBody") };
  const Icon = notice.icon;

  return (
    <div role="status" className={cn("rounded-2xl border px-4 py-4", notice.tone)}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-semibold">{notice.title}</p>
          <p className="mt-0.5 text-sm">{notice.body}</p>
          {settings.status === "rejected" && (
            <Button className={cn("mt-3", TAP, PRIMARY)} onClick={onRequestAgain} disabled={requesting}>
              {requesting && <Loader2 className="animate-spin" />}
              {t("requestAgain")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One switch row; the whole row is the label, so the tap target is the row, not the 18px switch. */
function ToggleRow({
  id,
  label,
  desc,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-earth-900">{label}</span>
        <span id={`${id}-desc`} className="mt-0.5 block text-sm text-earth-600">
          {desc}
        </span>
      </span>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-describedby={`${id}-desc`}
        className="mt-1"
      />
    </label>
  );
}

function ApprovedSettings({
  settings,
  pricePerReply,
  onChange,
  onStale,
}: {
  settings: GuestAiSettings;
  pricePerReply: number;
  onChange: (s: GuestAiSettings) => void;
  onStale: () => void;
}) {
  const t = useTranslations("guestAi");
  const ids = useId();
  const [saving, setSaving] = useState<Toggle | "instructions" | null>(null);
  const [draft, setDraft] = useState(settings.instructions ?? "");
  const dirty = draft.trim() !== (settings.instructions ?? "");

  const save = async (patch: Partial<Pick<GuestAiSettings, Toggle | "instructions">>, what: Toggle | "instructions") => {
    setSaving(what);
    // Switches move at once and go back if the save fails.
    const before = settings;
    if (what !== "instructions") onChange({ ...settings, ...patch });
    try {
      const res = await fetch("/api/host/ai-admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const { settings: saved } = (await res.json()) as { settings: GuestAiSettings };
        onChange(saved);
        if (what === "instructions") {
          setDraft(saved.instructions ?? "");
          toast.success(t("saved"));
        }
      } else {
        onChange(before);
        toast.error(res.status === 409 ? t("errorChanged") : t("errorSave"));
        if (res.status === 409) onStale();
      }
    } catch {
      onChange(before);
      toast.error(t("errorSave"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className={SURFACE}>
        <ToggleRow
          id={`${ids}-enabled`}
          label={t("enabledLabel")}
          desc={settings.enabled ? t("enabledOn") : t("enabledOff")}
          checked={settings.enabled}
          disabled={saving !== null}
          onChange={(v) => save({ enabled: v }, "enabled")}
        />
        <div className="space-y-1 border-t border-earth-200 px-4 py-3 text-sm text-earth-600">
          <p>{t("capLine", { cap: settings.daily_reply_cap })}</p>
          {/* 086: what a reply costs, charged from the wallet once a day; free while the price is 0. */}
          <p>{pricePerReply > 0 ? t("priceLine", { price: pricePerReply.toFixed(2) }) : t("priceFree")}</p>
        </div>
      </div>

      <section aria-labelledby={`${ids}-perm`}>
        <h2 id={`${ids}-perm`} className="mb-2 text-base font-semibold text-earth-900">
          {t("permissionsTitle")}
        </h2>
        <div className={cn(SURFACE, "divide-y divide-earth-200")}>
          {PERMISSIONS.map((p) => (
            <ToggleRow
              key={p.key}
              id={`${ids}-${p.key}`}
              label={t(p.label)}
              desc={t(p.desc)}
              checked={settings[p.key]}
              disabled={saving !== null}
              onChange={(v) => save({ [p.key]: v }, p.key)}
            />
          ))}
        </div>
      </section>

      <form
        className={cn(SURFACE, "space-y-2 p-4")}
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save({ instructions: draft.trim() || null }, "instructions");
        }}
      >
        <Label htmlFor={`${ids}-notes`} className="text-base font-semibold text-earth-900">
          {t("instructionsLabel")}
        </Label>
        <p id={`${ids}-notes-hint`} className="text-sm text-earth-600">
          {t("instructionsHint")}
        </p>
        <Textarea
          id={`${ids}-notes`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={AI_INSTRUCTIONS_MAX}
          rows={5}
          placeholder={t("instructionsPlaceholder")}
          aria-describedby={`${ids}-notes-hint ${ids}-notes-count`}
          className="min-h-32 rounded-xl text-base shadow-none"
        />
        <div className="flex items-center justify-between gap-3">
          <p id={`${ids}-notes-count`} className="text-xs text-earth-600 tabular-nums">
            {t("instructionsCount", { count: draft.length, max: AI_INSTRUCTIONS_MAX })}
          </p>
          <Button type="submit" className={cn(TAP, PRIMARY)} disabled={!dirty || saving !== null}>
            {saving === "instructions" && <Loader2 className="animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
