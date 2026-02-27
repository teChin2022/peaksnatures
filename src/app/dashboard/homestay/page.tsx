"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { useUserRole } from "@/components/dashboard/dashboard-shell";
import {
  Home,
  MapPin,
  Globe,
  FileText,
  Tag,
  Loader2,
  Save,
  Upload,
  X,
  ImageIcon,
  Plus,
  Clock,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useThemeColor } from "@/components/dashboard/theme-context";

interface HomestayData {
  id: string;
  host_id: string;
  slug: string;
  name: string;
  description: string;
  tagline: string | null;
  location: string;
  map_embed_url: string | null;
  max_guests: number;
  amenities: string[];
  prohibitions: string[];
  check_in_time: string | null;
  check_out_time: string | null;
  hero_image_url: string | null;
  logo_url: string | null;
  gallery: string[];
  theme_color: string;
  is_active: boolean;
}

const COMMON_AMENITIES = [
  "ไวไฟ (WiFi)",
  "ที่จอดรถ (Parking)",
  "ห้องครัว (Kitchen)",
  "เตาผิง (Fireplace)",
];

const COMMON_PROHIBITIONS = [
  "ห้ามสูบบุหรี่ (No Smoking)",
  "ห้ามนำสัตว์เลี้ยงเข้า (No Pets)",
  "ห้ามเล่นเพลงดัง (No Loud Music)"
];

export default function HomestayPage() {
  const t = useTranslations("dashboardHomestay");
  const tc = useTranslations("common");
  const themeColor = useThemeColor();
  const [homestay, setHomestay] = useState<HomestayData | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [tagline, setTagline] = useState("");
  const [location, setLocation] = useState("");
  const [mapEmbedUrl, setMapEmbedUrl] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [customAmenity, setCustomAmenity] = useState("");
  const [prohibitions, setProhibitions] = useState<string[]>([]);
  const [customProhibition, setCustomProhibition] = useState("");
  const [checkInTime, setCheckInTime] = useState("14:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [showSlugWarning, setShowSlugWarning] = useState(false);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

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

      setHostId(host.id);

      const { data } = await supabase
        .from("homestays")
        .select("*")
        .eq("host_id", host.id)
        .limit(1)
        .single();

      if (data) {
        const h = data as unknown as HomestayData;
        setHomestay(h);
        setName(h.name);
        setSlug(h.slug);
        setDescription(h.description);
        setTagline(h.tagline || "");
        setLocation(h.location);
        setMapEmbedUrl(h.map_embed_url || "");
        setAmenities(h.amenities || []);
        setProhibitions(h.prohibitions || []);
        setCheckInTime(h.check_in_time || "14:00");
        setCheckOutTime(h.check_out_time || "11:00");
        setHeroImageUrl(h.hero_image_url || "");
        setLogoUrl(h.logo_url || "");
        setGallery(h.gallery || []);
      } else {
        setIsNew(true);
      }

      setLoading(false);
    };
    fetch();
  }, [role, contextHostId, isAssistant]);

  const generateSlug = (n: string) => {
    return n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const toggleAmenity = (amenity: string) => {
    setAmenities((prev) =>
      prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]
    );
  };

  const addCustomAmenity = () => {
    const value = customAmenity.trim();
    if (!value) return;
    if (amenities.includes(value)) {
      setCustomAmenity("");
      return;
    }
    setAmenities((prev) => [...prev, value]);
    setCustomAmenity("");
  };

  const removeAmenity = (amenity: string) => {
    setAmenities((prev) => prev.filter((a) => a !== amenity));
  };

  const toggleProhibition = (item: string) => {
    setProhibitions((prev) =>
      prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]
    );
  };

  const addCustomProhibition = () => {
    const value = customProhibition.trim();
    if (!value) return;
    if (prohibitions.includes(value)) {
      setCustomProhibition("");
      return;
    }
    setProhibitions((prev) => [...prev, value]);
    setCustomProhibition("");
  };

  const removeProhibition = (item: string) => {
    setProhibitions((prev) => prev.filter((p) => p !== item));
  };

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${hostId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from("homestay-photos")
      .upload(path, file);

    if (error) {
      console.error("Upload error:", error);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("homestay-photos")
      .getPublicUrl(path);

    return publicUrl;
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !hostId) return;

    setUploadingHero(true);
    try {
      const url = await uploadFile(file, "hero");
      if (url) {
        setHeroImageUrl(url);
        toast.success(t("uploadSuccess"));
      } else {
        toast.error(t("errorUpload"));
      }
    } catch {
      toast.error(t("errorUpload"));
    } finally {
      setUploadingHero(false);
      if (heroInputRef.current) heroInputRef.current.value = "";
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !hostId) return;

    setUploadingGallery(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadFile(file, "gallery");
        if (url) urls.push(url);
      }
      if (urls.length > 0) {
        setGallery((prev) => [...prev, ...urls]);
        toast.success(t("uploadSuccess"));
      }
      if (urls.length < files.length) {
        toast.error(t("errorUpload"));
      }
    } catch {
      toast.error(t("errorUpload"));
    } finally {
      setUploadingGallery(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !hostId) return;

    setUploadingLogo(true);
    try {
      const url = await uploadFile(file, "logo");
      if (url) {
        setLogoUrl(url);
        toast.success(t("uploadSuccess"));
      } else {
        toast.error(t("errorUpload"));
      }
    } catch {
      toast.error(t("errorUpload"));
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const removeHeroImage = () => {
    setHeroImageUrl("");
  };

  const removeLogoImage = () => {
    setLogoUrl("");
  };

  const removeGalleryImage = (index: number) => {
    setGallery((prev) => prev.filter((_, i) => i !== index));
  };

  const slugHasChanged = !isNew && homestay && slug.trim() !== homestay.slug;

  const handleSave = async () => {
    if (!hostId) return;
    if (!name.trim() || !slug.trim() || !location.trim()) {
      toast.error(t("errorRequired"));
      return;
    }

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.trim())) {
      toast.error(t("errorSlugFormat"));
      return;
    }

    // If slug changed on an existing homestay, show confirmation first
    if (slugHasChanged && !showSlugWarning) {
      setShowSlugWarning(true);
      return;
    }

    setShowSlugWarning(false);
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        host_id: hostId,
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        tagline: tagline.trim() || null,
        location: location.trim(),
        map_embed_url: mapEmbedUrl.trim() || null,
        amenities,
        prohibitions,
        check_in_time: checkInTime || "14:00",
        check_out_time: checkOutTime || "11:00",
        hero_image_url: heroImageUrl.trim() || null,
        logo_url: logoUrl.trim() || null,
        gallery,
      };

      if (isNew) {
        const { data, error } = await supabase
          .from("homestays")
          .insert(payload as never)
          .select()
          .single();
        if (error) {
          toast.error(t("errorSave"));
          console.error("Insert homestay error:", error);
          return;
        }
        setHomestay(data as unknown as HomestayData);
        setIsNew(false);
        toast.success(t("created"));
      } else if (homestay) {
        // Save old slug to redirects table before updating
        if (slug.trim() !== homestay.slug) {
          await supabase
            .from("homestay_slug_redirects" as never)
            .upsert({ homestay_id: homestay.id, old_slug: homestay.slug } as never, { onConflict: "old_slug" });
        }

        const { error } = await supabase
          .from("homestays")
          .update(payload as never)
          .eq("id", homestay.id);
        if (error) {
          toast.error(t("errorSave"));
          console.error("Update homestay error:", error);
          return;
        }
        setHomestay({ ...homestay, ...payload } as HomestayData);
        toast.success(t("saved"));
      }
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton className="h-7 w-48 mb-6" />
        <div className="space-y-6">
          {/* Basic Info skeleton */}
          <Card>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </CardContent>
          </Card>
          {/* Location skeleton */}
          <Card>
            <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </CardContent>
          </Card>
          {/* Amenities skeleton */}
          <Card>
            <CardHeader><Skeleton className="h-5 w-28" /></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-7 w-20 rounded-full" />
                ))}
              </div>
            </CardContent>
          </Card>
          {/* Images skeleton */}
          <Card>
            <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-20 w-20 rounded-lg" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </CardContent>
          </Card>
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">
        {isNew ? t("createTitle") : t("editTitle")}
      </h1>

      <div className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Home className="h-4 w-4" />
              {t("basicInfo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("name")}</Label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (isNew) setSlug(generateSlug(e.target.value));
                }}
                placeholder={t("namePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5" />
                {t("slug")}
              </Label>
              <Input
                value={slug}
                onChange={(e) => {
                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                  setSlug(v);
                }}
                placeholder="my-homestay"
              />
              <p className="text-xs text-gray-500">
                {t("slugHint")}: peaksnature.com/{slug || "my-homestay"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("tagline")}</Label>
              <Input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder={t("taglinePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                {t("description")}
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Location & Map */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              {t("locationInfo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("location")}</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("locationPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("mapEmbedUrl")}</Label>
              <Input
                value={mapEmbedUrl}
                onChange={(e) => setMapEmbedUrl(e.target.value)}
                placeholder={t("mapEmbedUrlPlaceholder")}
              />
              <p className="text-xs text-gray-500">
                {t("mapEmbedUrlHint")}
              </p>
            </div>

            {mapEmbedUrl && (
              <div className="overflow-hidden rounded-lg border">
                <iframe
                  src={mapEmbedUrl}
                  className="h-56 w-full"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Map preview"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Amenities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" />
              {t("amenities")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Selected amenities */}
            {amenities.length > 0 && (
              <div>
                <Label className="mb-2 block text-sm text-gray-500">{t("selectedAmenities")}</Label>
                <div className="flex flex-wrap gap-2">
                  {amenities.map((a) => (
                    <Badge
                      key={a}
                      className="cursor-pointer pr-1 hover:brightness-90"
                      style={{ backgroundColor: themeColor }}
                    >
                      {a}
                      <button
                        type="button"
                        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:brightness-75"
                        onClick={() => removeAmenity(a)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Add custom amenity */}
            <div>
              <Label className="mb-2 block text-sm text-gray-500">{t("addCustomAmenity")}</Label>
              <div className="flex gap-2">
                <Input
                  value={customAmenity}
                  onChange={(e) => setCustomAmenity(e.target.value)}
                  placeholder={t("customAmenityPlaceholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomAmenity();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={addCustomAmenity}
                  disabled={!customAmenity.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Common amenities quick-add */}
            <div>
              <Label className="mb-2 block text-sm text-gray-500">{t("commonAmenities")}</Label>
              <div className="flex flex-wrap gap-2">
                {COMMON_AMENITIES.filter((a) => !amenities.includes(a)).map((a) => (
                  <Badge
                    key={a}
                    variant="outline"
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleAmenity(a)}
                  >
                    <Plus className="mr-0.5 h-3 w-3" />
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Check-in / Check-out Times */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              {t("checkInOutTimes")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("checkInTime")}</Label>
                <Input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("checkOutTime")}</Label>
                <Input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prohibitions / House Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4" />
              {t("prohibitions")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Selected prohibitions */}
            {prohibitions.length > 0 && (
              <div>
                <Label className="mb-2 block text-sm text-gray-500">{t("selectedProhibitions")}</Label>
                <div className="flex flex-wrap gap-2">
                  {prohibitions.map((p) => (
                    <Badge
                      key={p}
                      className="cursor-pointer pr-1 hover:brightness-90"
                      style={{ backgroundColor: themeColor }}
                    >
                      {p}
                      <button
                        type="button"
                        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:brightness-75"
                        onClick={() => removeProhibition(p)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Add custom prohibition */}
            <div>
              <Label className="mb-2 block text-sm text-gray-500">{t("addCustomProhibition")}</Label>
              <div className="flex gap-2">
                <Input
                  value={customProhibition}
                  onChange={(e) => setCustomProhibition(e.target.value)}
                  placeholder={t("customProhibitionPlaceholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomProhibition();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={addCustomProhibition}
                  disabled={!customProhibition.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Common prohibitions quick-add */}
            <div>
              <Label className="mb-2 block text-sm text-gray-500">{t("commonProhibitions")}</Label>
              <div className="flex flex-wrap gap-2">
                {COMMON_PROHIBITIONS.filter((p) => !prohibitions.includes(p)).map((p) => (
                  <Badge
                    key={p}
                    variant="outline"
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleProhibition(p)}
                  >
                    <Plus className="mr-0.5 h-3 w-3" />
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Images */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4" />
              {t("images")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Logo upload */}
            <div className="space-y-2">
              <Label>{t("logo")}</Label>
              {logoUrl ? (
                <div className="group relative inline-block overflow-hidden rounded-lg border">
                  <Image
                    src={logoUrl}
                    alt="Logo preview"
                    width={80}
                    height={80}
                    className="h-20 w-20 object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload className="mr-1 h-3 w-3" />
                      {t("replace")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2 text-xs"
                      onClick={removeLogoImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-200 transition-colors"
                  onClick={() => logoInputRef.current?.click()}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = themeColor + '66'; e.currentTarget.style.backgroundColor = themeColor + '0d'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.backgroundColor = ''; }}
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  ) : (
                    <Upload className="h-6 w-6 text-gray-400" />
                  )}
                </div>
              )}
              <p className="text-xs text-gray-500">{t("logoHint")}</p>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>

            {/* Hero image upload */}
            <div className="space-y-2">
              <Label>{t("heroImage")}</Label>
              {heroImageUrl ? (
                <div className="group relative overflow-hidden rounded-lg border">
                  <Image
                    src={heroImageUrl}
                    alt="Hero preview"
                    width={800}
                    height={192}
                    className="h-48 w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => heroInputRef.current?.click()}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      {t("replace")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={removeHeroImage}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      {t("remove")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-10 transition-colors"
                  onClick={() => heroInputRef.current?.click()}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = themeColor + '66'; e.currentTarget.style.backgroundColor = themeColor + '0d'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.backgroundColor = ''; }}
                >
                  {uploadingHero ? (
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-gray-400" />
                      <p className="mt-2 text-sm font-medium text-gray-500">{t("clickUploadHero")}</p>
                      <p className="mt-1 text-xs text-gray-400">{t("imageHint")}</p>
                    </>
                  )}
                </div>
              )}
              <input
                ref={heroInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleHeroUpload}
              />
            </div>

            {/* Gallery upload */}
            <div className="space-y-2">
              <Label>{t("gallery")}</Label>
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-8 transition-colors"
                onClick={() => galleryInputRef.current?.click()}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = themeColor + '66'; e.currentTarget.style.backgroundColor = themeColor + '0d'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.backgroundColor = ''; }}
              >
                {uploadingGallery ? (
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-gray-400" />
                    <p className="mt-2 text-sm font-medium text-gray-500">{t("clickUploadGallery")}</p>
                    <p className="mt-1 text-xs text-gray-400">{t("imageHintMulti")}</p>
                  </>
                )}
              </div>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleGalleryUpload}
              />
              {gallery.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {gallery.map((img, i) => (
                    <div key={i} className="group relative aspect-[4/3] overflow-hidden rounded-lg border">
                      <Image
                        src={img}
                        alt={`Gallery ${i + 1}`}
                        fill
                        sizes="(max-width: 640px) 33vw, 25vw"
                        className="h-full w-full object-cover"
                      />
                      <button
                        onClick={() => removeGalleryImage(i)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full hover:brightness-90"
          style={{ backgroundColor: themeColor }}
          size="lg"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {isNew ? t("create") : t("save")}
        </Button>
      </div>

      {/* Slug Change Confirmation Dialog */}
      <Dialog open={showSlugWarning} onOpenChange={setShowSlugWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("slugChangeTitle")}
            </DialogTitle>
            <DialogDescription>{t("slugChangeWarning")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            <p><strong>{homestay?.slug}</strong> → <strong>{slug.trim()}</strong></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSlugWarning(false)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              className="text-white hover:brightness-90"
              style={{ backgroundColor: themeColor }}
            >
              {t("slugChangeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
