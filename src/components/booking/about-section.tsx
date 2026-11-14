"use client";

import { useState } from "react";

import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ExpandableText } from "@/components/booking/expandable-text";
import { ListIcon } from "@/components/booking/list-icon";
import { SectionHeading, SectionMark } from "@/components/booking/section-mark";
import { autoIconKey, type ListKind } from "@/lib/list-icons";

/** Rows before "show all": amenities and rules sit side by side from md, so each stays at six. */
const VISIBLE_ITEMS = 6;

/**
 * `icons` are resolved from the original Thai labels on the server. In English
 * the labels are a translation that is not guaranteed to keep the array's
 * length, so a mismatched list re-picks icons from the words it shows.
 */
function ListRows({ labels, icons, kind, limit }: { labels: string[]; icons?: string[]; kind: ListKind; limit?: number }) {
  const aligned = icons?.length === labels.length;
  return (
    <>
      {labels.slice(0, limit).map((label, i) => (
        <div key={label} className="flex items-center gap-3 text-[15px] text-ink">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
            <ListIcon
              name={(aligned && icons[i]) || autoIconKey(label, kind)}
              kind={kind}
              className={`h-[18px] w-[18px] ${kind === "rule" ? "text-ink-2" : "text-pine"}`}
            />
          </span>
          <span>{label}</span>
        </div>
      ))}
    </>
  );
}

/** "Show all" past what the list shows, from the 7th row. */
function ShowAllButton({ count, onClick }: { count: number; onClick: () => void }) {
  const t = useTranslations("about");
  if (count <= VISIBLE_ITEMS) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-sm text-[15px] font-medium text-pine underline underline-offset-4 hover:text-pine-hover outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
        onClick={onClick}
      >
        {t("showAll", { count })}
      </button>
    </div>
  );
}

interface AboutSectionProps {
  description: string;
  amenities: string[];
  maxGuests: number;
  prohibitions?: string[];
  amenityIcons?: string[];
  prohibitionIcons?: string[];
}

export function AboutSection({
  description,
  amenities,
  maxGuests,
  prohibitions = [],
  amenityIcons,
  prohibitionIcons,
}: AboutSectionProps) {
  const t = useTranslations("about");
  const [amenitiesModal, setAmenitiesModal] = useState(false);
  const [rulesModal, setRulesModal] = useState(false);

  return (
    <section id="about" className="scroll-mt-20 pb-14 md:pb-20 lg:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Heading on the left, the place on the right from lg. Below lg the heading sits on top: at 4/12 the serif heading splits Thai words. */}
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-4">
            <SectionMark />
            <SectionHeading>{t("title")}</SectionHeading>
          </div>

          <div className="min-w-0 lg:col-span-8">
            <ExpandableText
              html={description}
              clampClassName="line-clamp-6 md:line-clamp-8"
              textClassName="font-serif text-xl leading-[1.6] text-ink md:text-2xl"
              fadeClassName="from-mist via-mist/80"
            />
            {maxGuests > 0 && (
              <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-[15px] text-ink">
                <Users className="h-[18px] w-[18px] text-pine" aria-hidden />
                {t("upToGuests", { count: maxGuests })}
              </p>
            )}

            {(amenities.length > 0 || prohibitions.length > 0) && (
              <div className="mt-10 grid gap-8 md:grid-cols-2 md:gap-10">
                {amenities.length > 0 && (
                  <div id="amenities" className="scroll-mt-20">
                    <h3 className="mb-4 font-serif text-2xl text-ink">{t("amenities")}</h3>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                      <ListRows labels={amenities} icons={amenityIcons} kind="amenity" limit={VISIBLE_ITEMS} />
                    </div>
                    <ShowAllButton count={amenities.length} onClick={() => setAmenitiesModal(true)} />
                  </div>
                )}
                {prohibitions.length > 0 && (
                  <div>
                    <h3 className="mb-4 font-serif text-2xl text-ink">{t("rules")}</h3>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                      <ListRows labels={prohibitions} icons={prohibitionIcons} kind="rule" limit={VISIBLE_ITEMS} />
                    </div>
                    <ShowAllButton count={prohibitions.length} onClick={() => setRulesModal(true)} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Amenities Modal */}
      <Dialog open={amenitiesModal} onOpenChange={setAmenitiesModal}>
        <DialogContent className="sm:max-w-md overflow-y-auto max-h-[85svh]">
          <DialogHeader>
            <DialogTitle>{t("amenities")}</DialogTitle>
            <DialogDescription className="sr-only">{t("amenities")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <ListRows labels={amenities} icons={amenityIcons} kind="amenity" />
          </div>
        </DialogContent>
      </Dialog>

      {/* House Rules Modal */}
      <Dialog open={rulesModal} onOpenChange={setRulesModal}>
        <DialogContent className="sm:max-w-md overflow-y-auto max-h-[85svh]">
          <DialogHeader>
            <DialogTitle>{t("rules")}</DialogTitle>
            <DialogDescription className="sr-only">{t("rules")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <ListRows labels={prohibitions} icons={prohibitionIcons} kind="rule" />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
