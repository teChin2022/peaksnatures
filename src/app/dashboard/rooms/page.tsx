"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import {
  BedDouble,
  Plus,
  Trash2,
  Upload,
  X,
  Loader2,
  Save,
  Pencil,
  Users,
  ImageIcon,
  CalendarDays,
} from "lucide-react";
import type { RoomSeasonalPrice } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useThemeColor } from "@/components/dashboard/theme-context";

interface RoomData {
  id: string;
  homestay_id: string;
  name: string;
  description: string | null;
  price_per_night: number;
  max_guests: number;
  quantity: number;
  images: string[];
}

interface SeasonFormData {
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
  price_per_night: string;
}

export default function RoomsPage() {
  const t = useTranslations("dashboardRooms");
  const tc = useTranslations("common");
  const themeColor = useThemeColor();
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [homestayId, setHomestayId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [roomName, setRoomName] = useState("");
  const [roomDesc, setRoomDesc] = useState("");
  const [roomPrice, setRoomPrice] = useState("");
  const [roomMaxGuests, setRoomMaxGuests] = useState("2");
  const [roomQuantity, setRoomQuantity] = useState("1");
  const [roomImages, setRoomImages] = useState<string[]>([]);

  // Seasonal pricing state
  const [seasonalPrices, setSeasonalPrices] = useState<Record<string, RoomSeasonalPrice[]>>({});
  const [seasonForm, setSeasonForm] = useState<SeasonFormData>({ name: "", start_date: "", end_date: "", price_per_night: "" });
  const [editingSeason, setEditingSeason] = useState<RoomSeasonalPrice | null>(null);
  const [savingSeason, setSavingSeason] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
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

    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("id")
      .eq("host_id", host.id)
      .limit(1)
      .single();

    const homestay = homestayRow as { id: string } | null;
    if (!homestay) {
      setLoading(false);
      return;
    }

    setHomestayId(homestay.id);

    const { data: roomRows } = await supabase
      .from("rooms")
      .select("*")
      .eq("homestay_id", homestay.id)
      .order("name" as never);

    if (roomRows) {
      setRooms(roomRows as unknown as RoomData[]);

      // Fetch seasonal prices for all rooms
      const roomIds = (roomRows as unknown as RoomData[]).map((r) => r.id);
      if (roomIds.length > 0) {
        const { data: seasonRows } = await supabase
          .from("room_seasonal_prices")
          .select("*")
          .in("room_id", roomIds)
          .order("start_date" as never);

        if (seasonRows) {
          const grouped: Record<string, RoomSeasonalPrice[]> = {};
          for (const s of seasonRows as unknown as RoomSeasonalPrice[]) {
            if (!grouped[s.room_id]) grouped[s.room_id] = [];
            grouped[s.room_id].push(s);
          }
          setSeasonalPrices(grouped);
        }
      }
    }
    setLoading(false);
  };

  const resetForm = () => {
    setRoomName("");
    setRoomDesc("");
    setRoomPrice("");
    setRoomMaxGuests("2");
    setRoomQuantity("1");
    setRoomImages([]);
    setEditingRoom(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (room: RoomData) => {
    setEditingRoom(room);
    setRoomName(room.name);
    setRoomDesc(room.description || "");
    setRoomPrice(room.price_per_night.toString());
    setRoomMaxGuests(room.max_guests.toString());
    setRoomQuantity(room.quantity.toString());
    setRoomImages(room.images || []);
    setDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !homestayId) return;

    setUploading(true);
    const supabase = createClient();

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const path = `${homestayId}/rooms/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error } = await supabase.storage
          .from("homestay-photos")
          .upload(path, file);

        if (error) {
          console.error("Upload error:", error);
          toast.error(t("errorUpload"));
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("homestay-photos").getPublicUrl(path);

        setRoomImages((prev) => [...prev, publicUrl]);
      }
      toast.success(t("uploadSuccess"));
    } catch {
      toast.error(t("errorUpload"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setRoomImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveRoom = async () => {
    if (!homestayId) return;
    if (!roomName.trim()) {
      toast.error(t("errorName"));
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        homestay_id: homestayId,
        name: roomName.trim(),
        description: roomDesc.trim() || null,
        price_per_night: parseInt(roomPrice) || 0,
        max_guests: parseInt(roomMaxGuests) || 2,
        quantity: parseInt(roomQuantity) || 1,
        images: roomImages,
      };

      if (editingRoom) {
        const { error } = await supabase
          .from("rooms")
          .update(payload as never)
          .eq("id", editingRoom.id);
        if (error) {
          toast.error(t("errorSave"));
          console.error("Update room error:", error);
          return;
        }
        toast.success(t("updated"));
      } else {
        const { error } = await supabase
          .from("rooms")
          .insert(payload as never);
        if (error) {
          toast.error(t("errorSave"));
          console.error("Insert room error:", error);
          return;
        }
        toast.success(t("created"));
      }

      setDialogOpen(false);
      resetForm();
      await fetchData();
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm(t("confirmDelete"))) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.from("rooms").delete().eq("id", roomId);
      if (error) {
        toast.error(t("errorDelete"));
        console.error("Delete room error:", error);
        return;
      }
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
      toast.success(t("deleted"));
    } catch {
      toast.error(t("errorDelete"));
    }
  };

  // --- Seasonal pricing handlers ---
  const resetSeasonForm = () => {
    setSeasonForm({ name: "", start_date: "", end_date: "", price_per_night: "" });
    setEditingSeason(null);
  };

  const startEditSeason = (season: RoomSeasonalPrice) => {
    setEditingSeason(season);
    setSeasonForm({
      id: season.id,
      name: season.name,
      start_date: season.start_date,
      end_date: season.end_date,
      price_per_night: season.price_per_night.toString(),
    });
  };

  const handleSaveSeason = async () => {
    if (!editingRoom) return;

    if (!seasonForm.name.trim()) { toast.error(t("errorSeasonName")); return; }
    if (!seasonForm.start_date || !seasonForm.end_date || seasonForm.end_date < seasonForm.start_date) {
      toast.error(t("errorSeasonDates")); return;
    }
    const price = parseInt(seasonForm.price_per_night);
    if (!price || price <= 0) { toast.error(t("errorSeasonPrice")); return; }

    // Check overlap with existing seasons (excluding current if editing)
    const existing = seasonalPrices[editingRoom.id] || [];
    const hasOverlap = existing.some((s) => {
      if (editingSeason && s.id === editingSeason.id) return false;
      return seasonForm.start_date <= s.end_date && seasonForm.end_date >= s.start_date;
    });
    if (hasOverlap) { toast.error(t("errorOverlap")); return; }

    setSavingSeason(true);
    try {
      const supabase = createClient();
      const payload = {
        room_id: editingRoom.id,
        name: seasonForm.name.trim(),
        start_date: seasonForm.start_date,
        end_date: seasonForm.end_date,
        price_per_night: price,
      };

      if (editingSeason) {
        const { error } = await supabase
          .from("room_seasonal_prices")
          .update(payload as never)
          .eq("id", editingSeason.id);
        if (error) { toast.error(t("errorSeasonSave")); console.error(error); return; }
        toast.success(t("seasonUpdated"));
      } else {
        const { error } = await supabase
          .from("room_seasonal_prices")
          .insert(payload as never);
        if (error) { toast.error(t("errorSeasonSave")); console.error(error); return; }
        toast.success(t("seasonCreated"));
      }

      resetSeasonForm();
      await fetchData();
    } catch {
      toast.error(t("errorSeasonSave"));
    } finally {
      setSavingSeason(false);
    }
  };

  const handleDeleteSeason = async (seasonId: string) => {
    if (!confirm(t("confirmDeleteSeason"))) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("room_seasonal_prices").delete().eq("id", seasonId);
      if (error) { toast.error(t("errorSeasonDelete")); console.error(error); return; }
      toast.success(t("seasonDeleted"));
      await fetchData();
    } catch {
      toast.error(t("errorSeasonDelete"));
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <Skeleton className="h-24 w-32 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-full" />
                    <div className="flex gap-4">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!homestayId) {
    return (
      <div className="py-20 text-center text-sm text-gray-500">
        {t("noHomestay")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
        <Button
          onClick={openCreateDialog}
          className="hover:brightness-90"
          style={{ backgroundColor: themeColor }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("addRoom")}
        </Button>
      </div>

      {rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <BedDouble className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-500">{t("noRooms")}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={openCreateDialog}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("addFirst")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room) => (
            <Card key={room.id}>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {room.images[0] ? (
                    <Image
                      src={room.images[0]}
                      alt={room.name}
                      width={128}
                      height={96}
                      className="h-24 w-32 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                      <ImageIcon className="h-8 w-8 text-gray-300" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{room.name}</h3>
                        {room.description && (
                          <p className="mt-0.5 text-sm text-gray-500 line-clamp-1">
                            {room.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(room)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => handleDeleteRoom(room.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span className="font-medium" style={{ color: themeColor }}>
                        ฿{room.price_per_night.toLocaleString()}{tc("perNight")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {room.max_guests}
                      </span>
                      <span>
                        {room.quantity} {t("available")}
                      </span>
                      <span className="flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {room.images.length}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRoom ? t("editRoom") : t("addRoom")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("roomName")}</Label>
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder={t("roomNamePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("roomDescription")}</Label>
              <Textarea
                value={roomDesc}
                onChange={(e) => setRoomDesc(e.target.value)}
                placeholder={t("roomDescPlaceholder")}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>{t("price")}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                    ฿
                  </span>
                  <Input
                    type="number"
                    className="pl-7"
                    value={roomPrice}
                    onChange={(e) => setRoomPrice(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("maxGuests")}</Label>
                <Input
                  type="number"
                  min="1"
                  value={roomMaxGuests}
                  onChange={(e) => setRoomMaxGuests(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("quantity")}</Label>
                <Input
                  type="number"
                  min="1"
                  value={roomQuantity}
                  onChange={(e) => setRoomQuantity(e.target.value)}
                />
              </div>
            </div>

            {/* Image upload */}
            <div className="space-y-2">
              <Label>{t("roomImages")}</Label>
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 p-6 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = themeColor + '66'; e.currentTarget.style.backgroundColor = themeColor + '0d'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.backgroundColor = ''; }}
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">{t("clickUpload")}</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />

              {roomImages.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {roomImages.map((img, i) => (
                    <div
                      key={i}
                      className="group relative overflow-hidden rounded-lg border"
                    >
                      <Image
                        src={img}
                        alt={`Room image ${i + 1}`}
                        width={200}
                        height={80}
                        className="h-20 w-full object-cover"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Seasonal Pricing Section — only for existing rooms */}
            {editingRoom && (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" style={{ color: themeColor }} />
                  <h3 className="text-sm font-semibold text-gray-900">{t("seasonalPricing")}</h3>
                </div>
                <p className="text-xs text-gray-500">{t("seasonalPricingDesc")}</p>

                {/* Existing seasons list */}
                {(seasonalPrices[editingRoom.id] || []).length > 0 ? (
                  <div className="space-y-2">
                    {(seasonalPrices[editingRoom.id] || []).map((season) => (
                      <div
                        key={season.id}
                        className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">{season.name}</p>
                          <p className="text-xs text-gray-500">
                            {season.start_date} → {season.end_date} · <span className="font-medium" style={{ color: themeColor }}>฿{season.price_per_night.toLocaleString()}</span>{tc("perNight")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => startEditSeason(season)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700"
                            onClick={() => handleDeleteSeason(season.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-gray-400">{t("noSeasons")}</p>
                )}

                {/* Season add/edit form */}
                <div className="space-y-2 rounded-md border bg-white p-3">
                  <p className="text-xs font-medium text-gray-700">
                    {editingSeason ? t("editSeason") : t("addSeason")}
                  </p>
                  <Input
                    placeholder={t("seasonNamePlaceholder")}
                    value={seasonForm.name}
                    onChange={(e) => setSeasonForm((f) => ({ ...f, name: e.target.value }))}
                    className="text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">{t("startDate")}</Label>
                      <Input
                        type="date"
                        value={seasonForm.start_date}
                        onChange={(e) => setSeasonForm((f) => ({ ...f, start_date: e.target.value }))}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("endDate")}</Label>
                      <Input
                        type="date"
                        value={seasonForm.end_date}
                        onChange={(e) => setSeasonForm((f) => ({ ...f, end_date: e.target.value }))}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">{t("seasonPrice")}</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">฿</span>
                      <Input
                        type="number"
                        className="pl-7 text-sm"
                        value={seasonForm.price_per_night}
                        onChange={(e) => setSeasonForm((f) => ({ ...f, price_per_night: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveSeason}
                      disabled={savingSeason}
                      className="hover:brightness-90"
                      style={{ backgroundColor: themeColor }}
                    >
                      {savingSeason ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
                      {editingSeason ? t("saveSeason") : t("addSeason")}
                    </Button>
                    {editingSeason && (
                      <Button size="sm" variant="outline" onClick={resetSeasonForm}>
                        <X className="mr-1 h-3 w-3" />
                        {t("deleteSeason").split(" ")[0]}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleSaveRoom}
              disabled={saving}
              className="w-full hover:brightness-90"
              style={{ backgroundColor: themeColor }}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {editingRoom ? t("saveRoom") : t("createRoom")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
