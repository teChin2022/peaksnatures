"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Shuffle, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="space-y-4">
      {loadFailed ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm text-red-700">{t("errorLoad")}</p>
          <Button variant="outline" className={cn(TAP, "shrink-0")} onClick={load}>
            {t("retry")}
          </Button>
        </div>
      ) : staff === null ? (
        <div role="status" className="space-y-2">
          <span className="sr-only">{tc("loading")}</span>
          <Skeleton className="h-16 w-full bg-earth-100" />
          <Skeleton className="h-16 w-full bg-earth-100" />
        </div>
      ) : staff.length === 0 ? (
        <p className="rounded-2xl border border-earth-200 bg-white p-5 text-sm text-earth-600">{t("empty")}</p>
      ) : (
        // The list is the page's one surface: flat, Sand border, 18px corners (DESIGN.md cards).
        <ul aria-label={t("title")} className="divide-y divide-earth-200 rounded-2xl border border-earth-200 bg-white">
          {staff.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-2 sm:pr-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-earth-900 [overflow-wrap:anywhere]">{row.name}</p>
                <p className="text-sm break-all text-earth-700">{row.email}</p>
                <p className="text-xs text-earth-600">{t("addedOn", { date: addedOn(row.created_at) })}</p>
              </div>
              <div className="-mr-2 flex shrink-0 justify-end gap-3 sm:mr-0">
                <Button
                  variant="ghost"
                  className={cn(TAP, "px-3 text-earth-700 hover:text-earth-900")}
                  aria-label={t("resetAria", { name: row.name })}
                  onClick={() => setDialog({ mode: "reset", row })}
                >
                  <KeyRound />
                  {t("resetPassword")}
                </Button>
                <Button
                  variant="ghost"
                  className={cn(TAP, "px-3 text-earth-700 hover:bg-red-50 hover:text-red-700")}
                  aria-label={t("removeAria", { name: row.name })}
                  onClick={() => setDialog({ mode: "remove", row })}
                >
                  <Trash2 />
                  {t("remove")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {atLimit && <p className="text-sm text-earth-700">{t("limitReached", { max: MAX_STAFF })}</p>}

      <Button
        className={cn(TAP, "w-full bg-brand text-white hover:bg-brand-hover")}
        disabled={staff === null || atLimit}
        onClick={() => setDialog({ mode: "add" })}
      >
        <UserPlus className="mr-2 h-4 w-4" />
        {t("add")}
      </Button>

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
      <p id={`${id}-hint`} className="text-xs break-all text-earth-600">
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
          className={cn(TAP, "pr-12")}
        />
        <button
          type="button"
          className="absolute right-0.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-earth-600 hover:text-earth-800 focus-visible:outline-2 focus-visible:outline-brand lg:size-9"
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
  const description =
    mode === "add" ? t("addDesc") : mode === "reset" ? t("resetDesc") : t("removeDesc", { email: row!.email });
  const passwordHint = t("passwordHint");

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug [overflow-wrap:anywhere]">{title}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">{description}</DialogDescription>
        </DialogHeader>

        {formError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
                className={TAP}
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
                className={TAP}
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
                className={cn(TAP, "min-w-0 flex-1 font-mono")}
              />
              <Button
                type="button"
                variant="outline"
                className={cn(TAP, "shrink-0")}
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
          <Button type="button" variant="outline" className={TAP} onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={busy}
            variant={mode === "remove" ? "destructive" : undefined}
            className={cn(TAP, mode !== "remove" && "bg-brand text-white hover:bg-brand-hover")}
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
      <DialogHeader>
        <DialogTitle className="leading-snug [overflow-wrap:anywhere]">{t("doneTitle", { name })}</DialogTitle>
        <DialogDescription>{t("doneDesc")}</DialogDescription>
      </DialogHeader>

      <dl className="space-y-3 rounded-lg bg-earth-50 p-4 text-sm">
        <div>
          <dt className="text-earth-600">{t("loginAt")}</dt>
          <dd className="font-medium break-all text-earth-900 select-all">{url}</dd>
        </div>
        <div>
          <dt className="text-earth-600">{t("summaryEmail")}</dt>
          <dd className="font-medium break-all text-earth-900 select-all">{email}</dd>
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
        <Button type="button" variant="outline" className={TAP} onClick={onClose}>
          {t("done")}
        </Button>
        <Button type="button" className={cn(TAP, "bg-brand text-white hover:bg-brand-hover")} onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? t("copied") : t("copyAll")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
