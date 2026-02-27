"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { useUserRole } from "@/components/dashboard/dashboard-shell";
import { Palette, Loader2, Save, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const PRESET_COLORS = [
  { key: "colorGreen", value: "#16a34a" },
  { key: "colorBlue", value: "#2563eb" },
  { key: "colorPurple", value: "#7c3aed" },
  { key: "colorRose", value: "#e11d48" },
  { key: "colorOrange", value: "#ea580c" },
  { key: "colorTeal", value: "#0d9488" },
  { key: "colorIndigo", value: "#4f46e5" },
  { key: "colorAmber", value: "#d97706" },
  { key: "colorSky", value: "#0284c7" },
  { key: "colorEmerald", value: "#059669" },
  { key: "colorFuchsia", value: "#c026d3" },
  { key: "colorSlate", value: "#475569" },
];

interface HomestayThemeData {
  id: string;
  name: string;
  slug: string;
  theme_color: string;
  hero_image_url: string | null;
  tagline: string | null;
}

export default function ThemePage() {
  const t = useTranslations("dashboardTheme");
  const [homestay, setHomestay] = useState<HomestayThemeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [themeColor, setThemeColor] = useState("#16a34a");

  const { role, hostId: contextHostId } = useUserRole();
  const isAssistant = role === "assistant";

  useEffect(() => {
    if (role === null) return;
    const fetch = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let hostQuery = supabase.from("hosts").select("id");
      if (isAssistant && contextHostId) {
        hostQuery = hostQuery.eq("id", contextHostId);
      } else {
        hostQuery = hostQuery.eq("user_id", user.id);
      }
      const { data: hostRow } = await hostQuery.single();

      const host = hostRow as { id: string } | null;
      if (!host) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("homestays")
        .select("id, name, slug, theme_color, hero_image_url, tagline")
        .eq("host_id", host.id)
        .limit(1)
        .single();

      if (data) {
        const h = data as unknown as HomestayThemeData;
        setHomestay(h);
        setThemeColor(h.theme_color);
      }
      setLoading(false);
    };
    fetch();
  }, [role, contextHostId, isAssistant]);

  const handleSave = async () => {
    if (!homestay) return;

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("homestays")
        .update({ theme_color: themeColor } as never)
        .eq("id", homestay.id);

      if (error) {
        toast.error(t("errorSave"));
        console.error("Update theme error:", error);
        return;
      }

      toast.success(t("saved"));
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Skeleton className="h-7 w-40 mb-6" />
        <div className="space-y-6">
          {/* Color picker skeleton */}
          <Card>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-12 rounded" />
                <Skeleton className="h-9 w-28 rounded-md" />
              </div>
            </CardContent>
          </Card>
          {/* Preview skeleton */}
          <Card>
            <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-40 w-full" />
                <div className="bg-white p-4">
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (!homestay) {
    return (
      <div className="py-20 text-center text-sm text-gray-500">
        {t("noHomestay")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t("title")}</h1>

      <div className="space-y-6">
        {/* Color Picker */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4" />
              {t("selectColor")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Presets */}
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setThemeColor(color.value)}
                  className="group flex flex-col items-center gap-1.5"
                  title={t(color.key)}
                >
                  <div
                    className="relative h-10 w-10 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color.value,
                      borderColor:
                        themeColor === color.value ? color.value : "transparent",
                      boxShadow:
                        themeColor === color.value
                          ? `0 0 0 3px ${color.value}33`
                          : "none",
                    }}
                  >
                    {themeColor === color.value && (
                      <Check className="absolute inset-0 m-auto h-5 w-5 text-white" />
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500">{t(color.key)}</span>
                </button>
              ))}
            </div>

            {/* Custom color */}
            <div className="flex items-center gap-3">
              <Label className="shrink-0">{t("customColor")}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border"
                />
                <Input
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="w-28 font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" />
              {t("preview")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              {/* Simulated booking header */}
              <div className="flex h-12 items-center gap-3 border-b bg-white px-4">
                <div
                  className="h-5 w-5 rounded"
                  style={{ backgroundColor: themeColor }}
                />
                <span className="text-sm font-medium">{homestay.name}</span>
              </div>

              {/* Simulated hero */}
              <div className="relative h-40 bg-gradient-to-br from-gray-700 to-gray-900">
                {homestay.hero_image_url && (
                  <Image
                    src={homestay.hero_image_url}
                    alt="Preview"
                    fill
                    sizes="600px"
                    className="absolute inset-0 h-full w-full object-cover opacity-60"
                  />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                  {homestay.tagline && (
                    <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                      {homestay.tagline}
                    </p>
                  )}
                  <h2 className="mt-1 text-lg font-bold text-white">
                    {homestay.name}
                  </h2>
                  <div
                    className="mt-2 h-1 w-12 rounded-full"
                    style={{ backgroundColor: themeColor }}
                  />
                </div>
              </div>

              {/* Simulated button */}
              <div className="bg-white p-4">
                <button
                  className="w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: themeColor }}
                >
                  {t("bookNow")}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full"
          style={{ backgroundColor: themeColor }}
          size="lg"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
