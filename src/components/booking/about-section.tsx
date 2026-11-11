"use client";

import { useState } from "react";

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

/** Rows before "show all": the desktop grid holds 12, the phone column 6, so it stays short there. */
const VISIBLE_ITEMS = 12;
const PHONE_ITEMS = 6;

/**
 * `icons` are resolved from the original Thai labels on the server. In English
 * the labels are a translation that is not guaranteed to keep the array's
 * length, so a mismatched list re-picks icons from the words it shows.
 * With a `limit` (the in-page list), rows past PHONE_ITEMS show from sm up only.
 */
function ListRows({ labels, icons, kind, limit }: { labels: string[]; icons?: string[]; kind: ListKind; limit?: number }) {
  const aligned = icons?.length === labels.length;
  return (
    <>
      {labels.slice(0, limit).map((label, i) => (
        <div
          key={label}
          className={`flex items-center gap-3 text-sm text-earth-700 ${limit && i >= PHONE_ITEMS ? "hidden sm:flex" : ""}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-earth-300">
            <ListIcon
              name={(aligned && icons[i]) || autoIconKey(label, kind)}
              kind={kind}
              className="h-4 w-4 text-brand"
            />
          </span>
          <span>{label}</span>
        </div>
      ))}
    </>
  );
}

/** "Show all" past what the list shows: from the 7th row on phones, from the 13th on wider screens. */
function ShowAllButton({ count, onClick }: { count: number; onClick: () => void }) {
  const t = useTranslations("about");
  if (count <= PHONE_ITEMS) return null;
  return (
    <div className={`mt-6 text-center ${count > VISIBLE_ITEMS ? "" : "sm:hidden"}`}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-earth-900 underline underline-offset-4 hover:text-earth-600 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
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
    <section id="about" className="scroll-mt-20 py-14 md:py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Description: heading on the left, text on the right. 5/12 on tablets: at 4/12 the serif heading splits Thai words. */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-12">
          <div className="md:col-span-5 lg:col-span-4">
            <SectionMark />
            <SectionHeading>{t("title")}</SectionHeading>
            {maxGuests > 0 && (
              <p className="mt-4 text-sm text-earth-600">{t("upToGuests", { count: maxGuests })}</p>
            )}
          </div>

          <ExpandableText html={description} clampClassName="line-clamp-8 md:line-clamp-12" className="md:col-span-7 lg:col-span-8" />
        </div>

        {/* Amenities */}
        {amenities.length > 0 && (
          <div id="amenities" className="scroll-mt-20 mt-14 md:mt-20 lg:mt-28">
            <h3 className="text-center font-serif text-2xl text-earth-900 md:text-3xl">{t("amenities")}</h3>
            <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <ListRows labels={amenities} icons={amenityIcons} kind="amenity" limit={VISIBLE_ITEMS} />
            </div>
            <ShowAllButton count={amenities.length} onClick={() => setAmenitiesModal(true)} />
          </div>
        )}

        {/* House rules */}
        {prohibitions.length > 0 && (
          <div className="mt-12 md:mt-20">
            <h3 className="text-center font-serif text-2xl text-earth-900 md:text-3xl">{t("rules")}</h3>
            <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <ListRows labels={prohibitions} icons={prohibitionIcons} kind="rule" limit={VISIBLE_ITEMS} />
            </div>
            <ShowAllButton count={prohibitions.length} onClick={() => setRulesModal(true)} />
          </div>
        )}
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
