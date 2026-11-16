"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, MoreHorizontal, Shuffle, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, isValidEmail, PASSWORD_RE } from "@/lib/utils";

/** Mirrors MAX_STAFF_PER_HOST in src/lib/host-staff.ts (server-only); the API enforces it. */
const MAX_STAFF = 10;

/** 44px on phones, the dense 36px from the sidebar breakpoint up (DESIGN.md: buttons, inputs). */
const TAP = "h-11 lg:h-9";
/**
 * This page's controls as DESIGN.md draws them: pill buttons, earth outlines
 * without a shadow, and fields with a visible earth-500 border (the shared
 * --input border is ~1.3:1, under the 3:1 a control edge needs; fixing that
 * token app-wide is a separate change).
 */
const PRIMARY = "rounded-full bg-brand text-white hover:bg-brand-hover";
const OUTLINE = "rounded-full border-earth-200 text-earth-800 shadow-none hover:bg-earth-50";
const FIELD = "rounded-xl border-earth-500 shadow-none";

/** First letter for the avatar disc: skips a Thai leading vowel (เ แ โ ใ ไ) so "เอก" shows "อ". */
export function initialOf(name: string): string {
  const chars = Array.from(name.trim());
  const first = chars.find((c) => !"เแโใไ".includes(c)) ?? chars[0] ?? "?";
  return first.toLocaleUpperCase();
}

/** An email that wraps after a dot or before the "@" rather than mid-word. */
function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf("@");
  if (at <= 0) return <>{email}</>;
  return (
    <>
      {email
        .slice(0, at)
        .split(".")
        .map((part, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <>
                .<wbr />
              </>
            )}
            {part}
          </Fragment>
        ))}
      <wbr />
      {email.slice(at)}
    </>
  );
}

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

type DialogState = { mode: "add" } | { mode: "reset" | "remove"; row: StaffRow };
type Field = "name" | "email" | "password" | "ownerPassword";

/** The owner's staff logins, or null when they could not be loaded. */
async function fetchStaff(): Promise<StaffRow[] | null> {
  try {
    const res = await fetch("/api/host/staff");
    if (!res.ok) return null;
    return ((await res.json()) as { staff: StaffRow[] }).staff;
  } catch {
    return null;
  }
}

/** The API's error codes, as the `hostStaff` message to show. */
export function staffErrorKey(status: number, code: unknown) {
  if (status === 429) return "errorTooMany";
  if (status === 404) return "errorGone";
  if (code === "WRONG_PASSWORD") return "errorWrongPassword";
  if (code === "EMAIL_IN_USE") return "errorEmailInUse";
  if (code === "STAFF_LIMIT") return "limitReached";
  if (code === "INVALID_INPUT") return "errorInvalid";
  return "errorGeneric";
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "_#@";
const randomBelow = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;

/**
 * A 12-character password that meets PASSWORD_RE, without look-alikes (0/O,
 * 1/l/I) and with a single symbol, because the owner passes it on by chat.
 */
export function generateStaffPassword(): string {
  const pick = (set: string) => set[randomBelow(set.length)];
  const any = UPPER + LOWER + DIGITS;
  const chars = [pick(UPPER), pick(DIGITS), pick(SYMBOLS), ...Array.from({ length: 9 }, () => pick(any))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Staff logins (migration 081), on the owner's Team page: the owner adds a
 * login with a real email, resets its password or removes it. Every change asks
 * for the owner's own password again.
 */
export function StaffCard() {
  const t = useTranslations("hostStaff");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);
  // Shown next to the owner-password field, so it cannot be mistaken for "confirm the staff password".
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (live) setOwnerEmail(data.user?.email ?? null);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    fetchStaff().then((rows) => {
      if (!live) return;
      if (rows) setStaff(rows);
      setLoadFailed(!rows);
    });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const addedOn = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "th" ? "th-TH" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const atLimit = (staff?.length ?? 0) >= MAX_STAFF;
  const openAdd = () => setDialog({ mode: "add" });
  // The page's one surface: flat, Sand border, 18px corners (DESIGN.md cards).
  const surface = "rounded-2xl border border-earth-200 bg-white";

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-bold text-earth-900">{t("title")}</h1>
          {staff && (
            <p className="shrink-0 text-sm text-earth-600 tabular-nums">
              {t("count", { count: staff.length, max: MAX_STAFF })}
            </p>
          )}
        </div>
        <p className="mt-1 text-sm text-earth-700">{t("intro")}</p>
      </div>

      {loadFailed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{t("errorLoad")}</p>
          <Button variant="outline" className={cn(TAP, OUTLINE, "shrink-0")} onClick={load}>
            {t("retry")}
          </Button>
        </div>
      ) : staff === null ? (
        <div role="status" className={cn(surface, "divide-y divide-earth-200")}>
          <span className="sr-only">{tc("loading")}</span>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3.5">
              <Skeleton className="size-10 shrink-0 rounded-full bg-earth-100" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-2/5 bg-earth-100" />
                <Skeleton className="h-3.5 w-3/4 bg-earth-100" />
              </div>
            </div>
          ))}
        </div>
      ) : staff.length === 0 ? (
        <div className={cn(surface, "px-5 py-8 text-center")}>
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand">
            <Users className="size-6" aria-hidden />
          </span>
          <p className="mt-3 text-base font-semibold text-earth-900">{t("emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-earth-600">{t("emptyBody")}</p>
          <Button className={cn("mt-5 h-12 px-6", PRIMARY)} onClick={openAdd}>
            <UserPlus />
            {t("add")}
          </Button>
        </div>
      ) : (
        <ul aria-label={t("title")} className={cn(surface, "divide-y divide-earth-200")}>
          {staff.map((row) => (
            <li key={row.id} className="flex items-start gap-3 py-3.5 pr-2 pl-4">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
              >
                {initialOf(row.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-earth-900 [overflow-wrap:anywhere]">{row.name}</p>
                <p className="text-sm text-earth-600 [overflow-wrap:anywhere]">
                  <EmailText email={row.email} />
                </p>
                <p className="mt-0.5 text-xs text-earth-600">{t("addedOn", { date: addedOn(row.created_at) })}</p>
              </div>
              {/* Not modal: a modal menu closing as the dialog opens can leave the page unclickable. */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mt-1 size-11 shrink-0 rounded-full text-earth-600 hover:text-earth-900 lg:size-9"
                    aria-label={t("rowMenuAria", { name: row.name })}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48 rounded-xl">
                  <DropdownMenuItem className="min-h-11 lg:min-h-9" onSelect={() => setDialog({ mode: "reset", row })}>
                    <KeyRound />
                    {t("resetPassword")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    className="min-h-11 text-red-700 lg:min-h-9"
                    onSelect={() => setDialog({ mode: "remove", row })}
                  >
                    <Trash2 />
                    {t("confirmRemove")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
          <li>
            {atLimit ? (
              <p className="px-4 py-4 text-sm text-earth-700">{t("limitReached", { max: MAX_STAFF })}</p>
            ) : (
              <button
                type="button"
                onClick={openAdd}
                className="flex min-h-14 w-full items-center gap-3 rounded-b-2xl px-4 py-2 text-left text-base font-semibold text-brand outline-none transition-colors hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50">
                  <UserPlus className="size-5" aria-hidden />
                </span>
                {t("add")}
              </button>
            )}
          </li>
        </ul>
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

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog && (
          <StaffDialog
            key={dialog.mode === "add" ? "add" : `${dialog.mode}-${dialog.row.id}`}
            state={dialog}
            ownerEmail={ownerEmail}
            onChanged={load}
            onClose={() => setDialog(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

/** Hint and error ids for aria-describedby, and the error line itself. */
function FieldNotes({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-earth-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

const describedBy = (id: string, hint?: string, error?: string) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

/**
 * The owner's own login password, set apart below a rule and named with the
 * owner's email: right after the staff password it was read as "confirm
 * password" (seen in testing), so the hint comes first and says whose it is.
 */
function OwnerPasswordField({
  id,
  ownerEmail,
  value,
  onChange,
  error,
  inputRef,
  autoFocus,
}: {
  id: string;
  ownerEmail: string | null;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  inputRef: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
}) {
  const t = useTranslations("hostStaff");
  const ta = useTranslations("auth");
  const [shown, setShown] = useState(false);
  const hint = ownerEmail ? t("ownerPasswordHint", { email: ownerEmail }) : t("ownerPasswordHintNoEmail");
  return (
    <div className="space-y-2 border-t border-earth-200 pt-4">
      <Label htmlFor={id}>{t("ownerPassword")}</Label>
      <p id={`${id}-hint`} className="text-xs text-earth-600 [overflow-wrap:anywhere]">
        {hint}
      </p>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="current-password"
          autoFocus={autoFocus}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(TAP, FIELD, "pr-12")}
        />
        <button
          type="button"
          className="absolute right-0.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-earth-600 hover:text-earth-800 focus-visible:outline-2 focus-visible:outline-brand lg:size-9"
          aria-label={shown ? ta("hidePassword") : ta("showPassword")}
          onClick={() => setShown(!shown)}
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <FieldNotes id={id} error={error} />
    </div>
  );
}

function StaffDialog({
  state,
  ownerEmail,
  onChanged,
  onClose,
}: {
  state: DialogState;
  ownerEmail: string | null;
  onChanged: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("hostStaff");
  const ids = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Pre-generated, so the only password the owner types is their own.
  const [password, setPassword] = useState(() => (state.mode === "remove" ? "" : generateStaffPassword()));
  const [ownerPassword, setOwnerPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; email: string; password: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const ownerPasswordRef = useRef<HTMLInputElement>(null);

  const { mode } = state;
  const row = mode === "add" ? null : state.row;
  const id = (field: Field) => `${ids}-${field}`;

  const showErrors = (next: Partial<Record<Field, string>>) => {
    setErrors(next);
    const first = (["name", "email", "password", "ownerPassword"] as const).find((f) => next[f]);
    const refFor = { name: nameRef, email: emailRef, password: passwordRef, ownerPassword: ownerPasswordRef };
    if (first) refFor[first].current?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid: Partial<Record<Field, string>> = {};
    if (mode === "add" && !name.trim()) invalid.name = t("errorNameRequired");
    if (mode === "add" && !isValidEmail(email)) invalid.email = t("errorEmailInvalid");
    if (mode !== "remove" && !PASSWORD_RE.test(password)) invalid.password = t("errorPasswordRule");
    if (!ownerPassword) invalid.ownerPassword = t("errorOwnerPasswordRequired");
    // Caught here, before it costs one of the owner's ten password checks.
    else if (mode !== "remove" && ownerPassword === password) invalid.ownerPassword = t("errorOwnerSameAsStaff");
    setFormError(null);
    showErrors(invalid);
    if (Object.keys(invalid).length > 0) return;

    setBusy(true);
    try {
      const res = await fetch(row ? `/api/host/staff/${row.id}` : "/api/host/staff", {
        method: mode === "add" ? "POST" : mode === "reset" ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "add"
            ? { name, email, password, ownerPassword }
            : mode === "reset"
              ? { password, ownerPassword }
              : { ownerPassword },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const key = staffErrorKey(res.status, (data as { error?: unknown }).error);
        if (key === "errorWrongPassword") {
          setOwnerPassword("");
          showErrors({ ownerPassword: t(key) });
        } else if (key === "errorEmailInUse") {
          showErrors({ email: t(key) });
        } else {
          setFormError(key === "limitReached" ? t(key, { max: MAX_STAFF }) : t(key));
          if (key === "errorGone") onChanged();
        }
        return;
      }
      onChanged();
      if (mode === "remove") {
        toast.success(t("removed", { name: row!.name }));
        onClose();
      } else {
        setDone({ name: row?.name ?? name.trim(), email: row?.email ?? email.trim().toLowerCase(), password });
      }
    } catch {
      setFormError(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  if (done) return <HandoverSummary {...done} onClose={onClose} />;

  const title =
    mode === "add" ? t("addTitle") : mode === "reset" ? t("resetTitle", { name: row!.name }) : t("removeTitle", { name: row!.name });
  const description = mode === "add" ? t("addDesc") : mode === "reset" ? t("resetDesc") : t("removeDesc");
  const passwordHint = t("passwordHint");

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 leading-snug [overflow-wrap:anywhere]">{title}</DialogTitle>
          <DialogDescription className="text-earth-600">{description}</DialogDescription>
        </DialogHeader>

        {mode === "remove" && (
          <p className="rounded-xl bg-earth-50 px-3 py-2 text-sm font-medium text-earth-900 [overflow-wrap:anywhere]">
            <EmailText email={row!.email} />
          </p>
        )}

        {formError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}

        {mode === "add" && (
          <>
            <div className="space-y-2">
              <Label htmlFor={id("name")}>{t("name")}</Label>
              <Input
                ref={nameRef}
                id={id("name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                maxLength={80}
                autoComplete="off"
                autoFocus
                aria-invalid={!!errors.name}
                aria-describedby={describedBy(id("name"), undefined, errors.name)}
                className={cn(TAP, FIELD)}
              />
              <FieldNotes id={id("name")} error={errors.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={id("email")}>{t("email")}</Label>
              <Input
                ref={emailRef}
                id={id("email")}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="noi@example.com"
                autoComplete="off"
                autoCapitalize="none"
                aria-invalid={!!errors.email}
                aria-describedby={describedBy(id("email"), t("emailHint"), errors.email)}
                className={cn(TAP, FIELD)}
              />
              <FieldNotes id={id("email")} hint={t("emailHint")} error={errors.email} />
            </div>
          </>
        )}

        {mode !== "remove" && (
          <div className="space-y-2">
            <Label htmlFor={id("password")}>{mode === "add" ? t("password") : t("newPassword")}</Label>
            <div className="flex gap-2">
              {/* Plain text on purpose: the owner passes it on, and a password
                  field here would make browsers offer to save it over the
                  owner's own login. */}
              <Input
                ref={passwordRef}
                id={id("password")}
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                aria-invalid={!!errors.password}
                aria-describedby={describedBy(id("password"), passwordHint, errors.password)}
                className={cn(TAP, FIELD, "min-w-0 flex-1 font-mono")}
              />
              <Button
                type="button"
                variant="outline"
                className={cn(TAP, OUTLINE, "shrink-0")}
                onClick={() => {
                  setPassword(generateStaffPassword());
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }}
              >
                <Shuffle />
                {t("generate")}
              </Button>
            </div>
            <FieldNotes id={id("password")} hint={passwordHint} error={errors.password} />
          </div>
        )}

        <OwnerPasswordField
          id={id("ownerPassword")}
          ownerEmail={ownerEmail}
          value={ownerPassword}
          onChange={setOwnerPassword}
          error={errors.ownerPassword}
          inputRef={ownerPasswordRef}
          autoFocus={mode !== "add"}
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className={cn(TAP, OUTLINE)} onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className={cn(TAP, mode === "remove" ? "rounded-full bg-red-700 text-white hover:bg-red-800" : PRIMARY)}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "add" ? t("add") : mode === "reset" ? t("confirmReset") : t("confirmRemove")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** After an add or a reset: the one time the owner sees the password, to pass it on. */
function HandoverSummary({
  name,
  email,
  password,
  onClose,
}: {
  name: string;
  email: string;
  password: string;
  onClose: () => void;
}) {
  const t = useTranslations("hostStaff");
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/login`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t("copyText", { url, email, password }));
      setCopied(true);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    // Only "Done" closes it: a stray tap or Esc would lose the one view of the password.
    <DialogContent
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      showCloseButton={false}
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => e.preventDefault()}
    >
      <DialogHeader className="text-left">
        <DialogTitle className="leading-snug [overflow-wrap:anywhere]">{t("doneTitle", { name })}</DialogTitle>
        <DialogDescription className="text-earth-600">{t("doneDesc")}</DialogDescription>
      </DialogHeader>

      <dl className="space-y-3 rounded-xl bg-earth-50 p-4 text-sm">
        <div>
          <dt className="text-earth-600">{t("loginAt")}</dt>
          <dd className="font-medium break-all text-earth-900 select-all">{url}</dd>
        </div>
        <div>
          <dt className="text-earth-600">{t("summaryEmail")}</dt>
          <dd className="font-medium text-earth-900 select-all [overflow-wrap:anywhere]">
            <EmailText email={email} />
          </dd>
        </div>
        <div>
          <dt className="text-earth-600">{t("summaryPassword")}</dt>
          <dd className="font-mono text-base font-medium break-all text-earth-900 select-all">{password}</dd>
        </div>
      </dl>
      <p className="text-xs text-earth-600">{t("otpNote")}</p>

      <p aria-live="polite" className="sr-only">
        {copied ? t("copied") : ""}
      </p>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" className={cn(TAP, OUTLINE)} onClick={onClose}>
          {t("done")}
        </Button>
        <Button type="button" className={cn(TAP, PRIMARY)} onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? t("copied") : t("copyAll")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
