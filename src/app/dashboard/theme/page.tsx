"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { Palette, Loader2, Save, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const PRESET_COLORS = [
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Rose", value: "#e11d48" },
  { name: "Orange", value: "#ea580c" },
  { name: "Teal", value: "#0d9488" },
  { name: "Indigo", value: "#4f46e5" },
  { name: "Amber", value: "#d97706" },
  { name: "Sky", value: "#0284c7" },
  { name: "Emerald", value: "#059669" },
  { name: "Fuchsia", value: "#c026d3" },
  { name: "Slate", value: "#475569" },
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

  useEffect(() => {
    const fetch = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: hostRow } = await supabase
        .from("hosts")
        .select("id")
        .eq("user_id", user.id)
        .single();

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
  }, []);

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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
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
                  title={color.name}
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
                  <span className="text-[10px] text-gray-500">{color.name}</span>
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
                  <img
                    src={homestay.hero_image_url}
                    alt="Preview"
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
