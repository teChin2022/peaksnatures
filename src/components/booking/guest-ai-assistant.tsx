"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { ArrowUp, CalendarDays, Loader2, MessageCircle, MessageCircleQuestion, Phone, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useBookingCartOptional } from "./booking-cart-context";
import { useBookingBarVisible } from "./use-booking-bar-visible";
import { useIsMobile } from "@/lib/use-is-mobile";
import { fmtDate } from "@/lib/format-date";
import { QUESTION_MAX, type GuestAiResponse } from "@/lib/guest-ai/rules";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { upcomingSeasons } from "@/lib/room-rates";
import { billingTodayStr } from "@/lib/billing-dates";
import { cn, lineUrl } from "@/lib/utils";

/**
 * The guest AI assistant on /[slug]/book (docs/ai-admin-plan.md, "Brief ช่องถาม AI").
 * Phones ask from a bottom sheet, opened by the booking bar's "ถาม" button or the
 * link under the date panel; from 768px a non-modal panel on the right, opened by
 * a button in the corner, so the guest sees the dates change beside it.
 *
 * The assistant only turns words into a stay: the page's own cart sets the dates
 * (then `dates-picked`, as the date picker's Done sends), and the page's own code
 * says what is free. Availability and prices never come from the model.
 */

/** Opens the assistant from anywhere on the page (the bar's button, the link under the dates). */
export const OPEN_GUEST_AI = "open-guest-ai";
export const openGuestAi = () => document.dispatchEvent(new Event(OPEN_GUEST_AI));

const PANEL_WIDTH = 380;
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2";

type ErrorKind = "failed" | "limit" | "unavailable";
type Turn = { id: number; q: string } & (
  | { state: "thinking" }
  | { state: "error"; kind: ErrorKind }
  | { state: "done"; res: GuestAiResponse; proposed?: boolean }
);
/** How a guest reaches the host from an answer: the homestay's own public LINE and phone (never from the model). */
export interface GuestAiContact {
  lineId: string | null;
  phone: string | null;
}
type Cart = NonNullable<ReturnType<typeof useBookingCartOptional>>;

/** The cart's stay matches the one a reply set: only then are its notes about free houses true. */
const sameStay = (cart: Cart | null, ci: string, co: string) =>
  !!cart?.dateRange?.from &&
  !!cart.dateRange.to &&
  cart.dateRange.from.getTime() === localDay(ci).getTime() &&
  cart.dateRange.to.getTime() === localDay(co).getTime();

/** The house to show first for this stay: the one asked for if free, else a free one that fits the group. */
function targetHouse(cart: Cart, prefer: string | null, guests: number | null): string | null {
  const free = cart.catalog.rooms.filter((r) => cart.isRoomAvailableForRange(r));
  return (
    free.find((r) => r.id === prefer)?.id ??
    free.find((r) => !guests || r.max_guests >= guests)?.id ??
    free[0]?.id ??
    null
  );
}

/** "2026-11-28" as a local date, the way the date picker holds it. */
const localDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * The link under the date panel, phones only: the booking bar is hidden while the date panel shows.
 * Server-rendered either way and hidden by `data-guest-ai="off"`, so it never shifts the page in
 * after hydration, and the E2E specs can switch it on in the HTML and the payload alike
 * (e2e/support.ts) without a host row.
 */
export function GuestAiEntryLink({ guestAiEnabled }: { guestAiEnabled: boolean }) {
  const t = useTranslations("guestAiAsk");
  return (
    <div
      data-guest-ai={guestAiEnabled ? "on" : "off"}
      className="mx-auto mt-3 flex max-w-4xl justify-center px-4 data-[guest-ai=off]:hidden md:hidden"
    >
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={openGuestAi}
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-[15px] font-medium text-pine underline decoration-1 underline-offset-4 hover:bg-pine-mist",
          FOCUS,
        )}
      >
        <MessageCircleQuestion className="size-[18px]" aria-hidden />
        {t("title")}
      </button>
    </div>
  );
}

const noop = () => () => {};
/**
 * Rendered after hydration only: the corner button and the panel float over the page, so nothing
 * shifts, and the server HTML never depends on `guestAiEnabled` (which the E2E specs rewrite).
 */
export function GuestAiAssistant({
  slug,
  guestAiEnabled,
  contact,
}: {
  slug: string;
  guestAiEnabled: boolean;
  contact: GuestAiContact;
}) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  return guestAiEnabled && hydrated ? <Assistant slug={slug} contact={contact} /> : null;
}

function Assistant({ slug, contact }: { slug: string; contact: GuestAiContact }) {
  const t = useTranslations("guestAiAsk");
  const locale = useLocale() === "en" ? "en" : "th";
  const isMobile = useIsMobile();
  const cart = useBookingCartOptional();
  const dockShown = useBookingBarVisible(!isMobile && !!cart && cart.catalog.rooms.length > 0);
  const ids = useId();

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  // A session cookie exists once a question went through; until then Turnstile runs first.
  const [verified, setVerified] = useState(false);
  const [needVerify, setNeedVerify] = useState(false);
  const pending = useRef<{ id: number; q: string } | null>(null);
  const retried = useRef(new Set<number>());
  const turnstileRef = useRef<TurnstileInstance>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const nextId = useRef(1);
  // A stay the cart was just given: once the page has re-rendered, show its first house (as Done does).
  const picking = useRef<{ prefer: string | null; guests: number | null } | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener(OPEN_GUEST_AI, onOpen);
    return () => document.removeEventListener(OPEN_GUEST_AI, onOpen);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // From 1024px the open panel takes its width from the page instead of covering it.
  useEffect(() => {
    if (!open || isMobile || window.innerWidth < 1024) return;
    const before = document.body.style.paddingRight;
    document.body.style.paddingRight = `${PANEL_WIDTH}px`;
    return () => {
      document.body.style.paddingRight = before;
    };
  }, [open, isMobile]);

  const update = (id: number, patch: Partial<Turn>) =>
    setTurns((all) => all.map((turn) => (turn.id === id ? ({ ...turn, ...patch } as Turn) : turn)));

  useEffect(() => {
    const job = picking.current;
    if (!job || !cart?.dateRange?.to) return;
    picking.current = null;
    document.dispatchEvent(new CustomEvent("dates-picked", { detail: { roomId: targetHouse(cart, job.prefer, job.guests) } }));
  }, [cart]);

  const send = async (id: number, q: string, withToken?: string) => {
    const history = turns
      .filter((turn): turn is Turn & { state: "done" } => turn.state === "done")
      .slice(-2)
      .map((turn) => ({ q: turn.q, a: turn.res.reply }));
    try {
      const res = await fetch("/api/guest-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, question: q, locale, history, ...(withToken ? { turnstileToken: withToken } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setVerified(true);
        const reply = data as GuestAiResponse;
        update(id, { state: "done", res: reply });
        const intent = reply.intent;
        if (cart && intent?.check_in && intent.check_out && !sameStay(cart, intent.check_in, intent.check_out)) {
          // A stay the guest already built (houses chosen) is not replaced by a question: offer it instead.
          if (cart.lines.length > 0) update(id, { proposed: true });
          else applyStay(intent);
        }
        return;
      }
      const code = (data as { code?: string }).code;
      if (code === "verify" && !retried.current.has(id)) {
        // No session yet, or it ran out: Turnstile again, then this question once more.
        retried.current.add(id);
        setVerified(false);
        verify(id, q);
        return;
      }
      update(id, { state: "error", kind: code === "limit" ? "limit" : code === "unavailable" ? "unavailable" : "failed" });
    } catch {
      update(id, { state: "error", kind: "failed" });
    }
  };

  /** Puts a reply's stay on the page, as the date picker would; then its first house shows (effect above). */
  const applyStay = (intent: NonNullable<GuestAiResponse["intent"]>) => {
    if (!cart || !intent.check_in || !intent.check_out) return;
    picking.current = { prefer: intent.room_ids[0] ?? null, guests: intent.guests };
    cart.setDates({ from: localDay(intent.check_in), to: localDay(intent.check_out) });
  };

  /** Gets a Turnstile token for this question, then sends it. Without a site key (local development) the server skips the check too. */
  const verify = (id: number, q: string) => {
    if (!siteKey) return void send(id, q, "no-site-key");
    pending.current = { id, q };
    setNeedVerify(true);
  };
  const onToken = (token: string) => {
    const job = pending.current;
    pending.current = null;
    setNeedVerify(false);
    if (job) void send(job.id, job.q, token);
  };
  const onTurnstileError = () => {
    const job = pending.current;
    pending.current = null;
    setNeedVerify(false);
    if (job) update(job.id, { state: "error", kind: "failed" });
  };

  const ask = (raw: string) => {
    const q = raw.trim().slice(0, QUESTION_MAX);
    if (!q) return inputRef.current?.focus();
    const id = nextId.current++;
    setDraft("");
    setTurns((all) => [...all.slice(-2), { id, q, state: "thinking" }]);
    if (verified) void send(id, q);
    else verify(id, q);
  };

  const close = () => {
    setOpen(false);
    if (!isMobile) launcherRef.current?.focus();
  };
  /** A suggested house: the page's own config dialog takes over (RoomsSection listens), after the sheet or panel is gone. */
  const chooseHouse = (roomId: string) => {
    setOpen(false);
    setTimeout(() => document.dispatchEvent(new CustomEvent("choose-house", { detail: { roomId } })), isMobile ? 300 : 0);
  };
  const scrollToId = (selector: string) => {
    setOpen((o) => (isMobile ? false : o));
    setTimeout(() => document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" }), isMobile ? 250 : 0);
  };

  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
        {turns.map((turn) => (
          <TurnView
            key={turn.id}
            turn={turn}
            cart={cart}
            slug={slug}
            locale={locale}
            onRetry={() => {
              update(turn.id, { state: "thinking" });
              retried.current.delete(turn.id);
              if (verified) void send(turn.id, turn.q);
              else verify(turn.id, turn.q);
            }}
            contact={contact}
            onApply={applyStay}
            onChooseHouse={chooseHouse}
            onSeeHouses={(target) => scrollToId(target ? `[data-room-id="${target}"]` : "#rooms-section")}
            onChangeDates={() => scrollToId("#date-panel")}
            onContact={() => scrollToId("footer")}
          />
        ))}
      </div>

      {siteKey && needVerify && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[13px] text-ink-2">{t("verifying")}</p>
          <Turnstile
            ref={turnstileRef}
            siteKey={siteKey}
            onSuccess={onToken}
            onError={onTurnstileError}
            options={{ theme: "light", size: "flexible" }}
          />
        </div>
      )}

      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor={`${ids}-q`} className="sr-only">
          {t("inputLabel")}
        </label>
        <input
          ref={inputRef}
          id={`${ids}-q`}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={QUESTION_MAX}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={t("placeholder")}
          className="min-h-[52px] w-full rounded-full border border-line-strong bg-white py-2 pr-14 pl-5 text-base text-ink placeholder:text-ink-3 focus:border-pine focus:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
        />
        <button
          type="submit"
          aria-label={t("send")}
          disabled={needVerify}
          className={cn(
            "absolute top-1/2 right-1 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-pine text-white transition-colors hover:bg-pine-hover disabled:cursor-not-allowed disabled:opacity-50",
            FOCUS,
          )}
        >
          <ArrowUp className="size-[18px]" aria-hidden />
        </button>
      </form>

      {turns.length === 0 && (
        <div role="group" aria-label={t("examples")} className="flex flex-wrap gap-2">
          {[t("example1"), t("example2"), t("example3")].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => ask(example)}
              className={cn(
                "min-h-9 cursor-pointer rounded-full border border-line bg-white px-3.5 text-sm text-ink-2 transition-colors hover:border-line-strong hover:bg-mist",
                FOCUS,
              )}
            >
              {example}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs leading-relaxed text-ink-3">{t("note")}</p>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          className="max-h-[85dvh] gap-0 rounded-t-[18px] border-line bg-white px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        >
          <div className="mb-2 flex items-center justify-between">
            <SheetTitle className="font-serif text-xl font-normal text-ink">{t("title")}</SheetTitle>
            <button type="button" onClick={close} aria-label={t("close")} className={cn("-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-mist", FOCUS)}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <SheetDescription className="sr-only">{t("note")}</SheetDescription>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      {/* Stays mounted while the panel is open (the panel covers it), so closing can give focus back. */}
      <button
          ref={launcherRef}
          type="button"
          aria-expanded={open}
          aria-controls={`${ids}-panel`}
          onClick={() => setOpen(true)}
          className={cn(
            "fixed right-6 z-40 inline-flex min-h-[52px] cursor-pointer items-center gap-2 rounded-full bg-pine px-5 text-[15px] font-medium text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.12)] transition-[background-color,bottom] duration-200 hover:bg-pine-hover",
            // Above the desktop booking dock while it shows.
            dockShown ? "bottom-24" : "bottom-6",
            FOCUS,
          )}
        >
          <MessageCircleQuestion className="size-[18px]" aria-hidden />
          {t("title")}
        </button>
      {open && (
        <aside
          id={`${ids}-panel`}
          aria-labelledby={`${ids}-title`}
          onKeyDown={(e) => e.key === "Escape" && close()}
          style={{ width: PANEL_WIDTH }}
          className="fixed inset-y-0 right-0 z-[60] flex max-w-full flex-col border-l border-line bg-white px-6 pt-4 pb-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1)] lg:shadow-none"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 id={`${ids}-title`} className="font-serif text-xl text-ink">
              {t("title")}
            </h2>
            <button type="button" onClick={close} aria-label={t("close")} className={cn("-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-mist", FOCUS)}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {body}
        </aside>
      )}
    </>
  );
}

function TurnView({
  turn,
  cart,
  slug,
  locale,
  contact,
  onApply,
  onChooseHouse,
  onRetry,
  onSeeHouses,
  onChangeDates,
  onContact,
}: {
  turn: Turn;
  cart: Cart | null;
  slug: string;
  locale: "th" | "en";
  contact: GuestAiContact;
  onApply: (intent: NonNullable<GuestAiResponse["intent"]>) => void;
  onChooseHouse: (roomId: string) => void;
  onRetry: () => void;
  onSeeHouses: (target: string | null) => void;
  onChangeDates: () => void;
  onContact: () => void;
}) {
  const t = useTranslations("guestAiAsk");
  const day = (d: Date) => fmtDate(d, locale === "th" ? "EEE d MMM" : "EEE MMM d", locale);
  const primary = cn("inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-pine px-4 text-sm font-medium text-white hover:bg-pine-hover", FOCUS);
  const outline = cn("inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-mist", FOCUS);

  // The host's own LINE and phone (public on the page), never a link from the model; the footer when there is neither.
  const contactLinks =
    contact.lineId || contact.phone ? (
      <>
        {contact.lineId && (
          <a href={lineUrl(contact.lineId)} target="_blank" rel="noopener noreferrer" className={outline}>
            <MessageCircle className="size-4" aria-hidden />
            {t("contactLine")}
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className={outline}>
            <Phone className="size-4" aria-hidden />
            {t("contactPhone")}
          </a>
        )}
      </>
    ) : (
      <button type="button" onClick={onContact} className={outline}>
        {t("goContact")}
      </button>
    );

  // What the stay this reply set looks like on the page right now; nothing once the guest picked other dates.
  const intent = turn.state === "done" ? turn.res.intent : null;
  const ci = intent?.check_in;
  const co = intent?.check_out;
  const live = !!ci && !!co && sameStay(cart, ci, co) ? cart : null;
  // Houses were chosen when this reply came: its stay waits for the guest's "use these dates".
  const proposal = turn.state === "done" && !!turn.proposed && !!ci && !!co && !live;
  let stay: { nights: number; free: string; fit: string | null; target: string | null } | null = null;
  // Houses the reply suggested that are free for this stay, priced as their cards price them (rooms-section).
  let suggested: { id: string; name: string; maxGuests: number; total: number }[] = [];
  if (live && ci && co) {
    const rooms = live.catalog.rooms;
    const free = rooms.filter((r) => live.isRoomAvailableForRange(r)).length;
    const guests = intent?.guests ?? null;
    const fits = guests ? rooms.filter((r) => r.max_guests >= guests) : rooms;
    stay = {
      nights: live.nights,
      free: free === rooms.length ? t("allFree") : free === 0 ? t("noneFree") : t("someFree", { free, total: rooms.length }),
      fit: !guests
        ? null
        : fits.length === rooms.length
          ? t("fitAll", { guests })
          : fits.length === 0
            ? t("fitNone", { guests })
            : t("fitSome", { guests, names: fits.slice(0, 3).map((r) => r.name).join(", ") }),
      target: targetHouse(live, intent?.room_ids[0] ?? null, guests),
    };
    const from = localDay(ci);
    const to = localDay(co);
    const today = billingTodayStr();
    suggested = (intent?.room_ids ?? [])
      .map((id) => rooms.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => !!r && live.isRoomAvailableForRange(r))
      .slice(0, 2)
      .map((r) => ({
        id: r.id,
        name: r.name,
        maxGuests: r.max_guests,
        total: calculateTotalPrice({
          basePricePerNight: r.price_per_night,
          checkIn: from,
          checkOut: to,
          seasons: upcomingSeasons(live.catalog.seasonalPrices.filter((p) => p.room_id === r.id), today),
          specialPrices: live.catalog.specialPrices.filter((p) => p.room_id === r.id),
        }).total,
      }));
  }

  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
      <p className="mb-1.5 text-sm text-ink-2">
        {t("you")} <span className="font-semibold text-ink">{turn.q}</span>
      </p>
      <div className={cn("rounded-2xl px-4 py-3.5 text-[15px] leading-relaxed", turn.state === "error" ? "bg-red-50 text-red-800" : "bg-mist text-ink")}>
        {turn.state === "thinking" && (
          <span className="inline-flex items-center gap-2 text-sm text-ink-2">
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
            {t("thinking")}
          </span>
        )}
        {turn.state === "error" && (
          <>
            <p>{t(turn.kind === "limit" ? "errorLimit" : turn.kind === "unavailable" ? "errorUnavailable" : "errorFailed")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {turn.kind === "failed" ? (
                <button type="button" onClick={onRetry} className={outline}>
                  {t("retry")}
                </button>
              ) : (
                contactLinks
              )}
            </div>
          </>
        )}
        {turn.state === "done" && (
          <>
            {stay && ci && co && (
              <p className="font-semibold">
                {t("datesSet", { from: day(localDay(ci)), to: day(localDay(co)), nights: stay.nights })}
              </p>
            )}
            {proposal && ci && co && (
              <>
                <p className="font-semibold">{t("proposeDates", { from: day(localDay(ci)), to: day(localDay(co)) })}</p>
                <p className="text-sm text-ink-2">{t("proposeNote")}</p>
              </>
            )}
            {stay && <p>{stay.free}</p>}
            {stay?.fit && <p>{stay.fit}</p>}
            {stay && suggested.length > 0 && (
              <ul aria-label={t("suggestTitle")} className="mt-2.5 space-y-2">
                {suggested.map((house) => (
                  <li key={house.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white py-2.5 pr-2.5 pl-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{house.name}</p>
                      <p className="text-sm text-ink-2">
                        {t("suggestMeta", { guests: house.maxGuests, total: house.total.toLocaleString(), nights: stay.nights })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onChooseHouse(house.id)}
                      aria-label={t("chooseHouseAria", { name: house.name })}
                      className={cn(primary, "shrink-0")}
                    >
                      {t("chooseHouse")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* Plain text only (security review F-03): never HTML or links from the model. */}
            <p className={stay ? "mt-1.5" : undefined}>{turn.res.reply}</p>
            {stay && <p className="mt-1.5 text-xs text-ink-3">{t("source")}</p>}
            {(stay || proposal || turn.res.action) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {proposal && intent && (
                  <button type="button" onClick={() => onApply(intent)} className={primary}>
                    {t("useTheseDates")}
                  </button>
                )}
                {stay && (
                  <>
                    <button type="button" onClick={() => onSeeHouses(stay.target)} className={suggested.length > 0 ? outline : primary}>
                      {t("seeHouses")}
                    </button>
                    <button type="button" onClick={onChangeDates} className={outline}>
                      <CalendarDays className="size-4" aria-hidden />
                      {t("changeDates")}
                    </button>
                  </>
                )}
                {turn.res.action === "change_booking" && (
                  <a href={`/${slug}/change-booking`} className={outline}>
                    {t("goChangeBooking")}
                  </a>
                )}
                {turn.res.action === "check_in" && (
                  <a href={`/${slug}/check-in-out`} className={outline}>
                    {t("goCheckIn")}
                  </a>
                )}
                {turn.res.action === "contact" && contactLinks}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
