import { Clock, CalendarX } from "lucide-react";
import { getTranslations } from "next-intl/server";

interface BeforeYouStayProps {
  checkInTime: string | null;
  checkOutTime: string | null;
  /** hosts.cancellation_days: free cancellation up to this many days before check-in; 0 means no such promise. */
  cancellationDays: number;
}

/**
 * What a guest checks last before booking, at the end of /book: the stay times
 * and the cancellation window, each only when the host set it (no promise the
 * host didn't make). How paying works is not repeated here: the booking card
 * above already says it, worded for the host's booking mode.
 */
export async function BeforeYouStaySection({ checkInTime, checkOutTime, cancellationDays }: BeforeYouStayProps) {
  const t = await getTranslations("booking");

  const times = [checkInTime && t("checkInTime", { time: checkInTime }), checkOutTime && t("checkOutTime", { time: checkOutTime })].filter(Boolean);
  const items = [
    ...(times.length > 0 ? [{ icon: Clock, title: t("stayTimes"), body: times.join(" · ") }] : []),
    ...(cancellationDays > 0 ? [{ icon: CalendarX, title: t("cancellationPolicy"), body: t("cancellationPolicyNote", { days: cancellationDays }) }] : []),
  ];
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="before-you-stay" className="py-14 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 id="before-you-stay" className="font-serif text-2xl text-ink md:text-3xl">
          {t("beforeYouStay")}
        </h2>
        <ul className={`mt-6 grid gap-3 ${items.length > 1 ? "md:grid-cols-2" : "max-w-xl"}`}>
          {items.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 rounded-[20px] bg-white p-5 md:p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pine-mist text-pine">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <h3 className="font-medium text-ink">{title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{body}</p>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
