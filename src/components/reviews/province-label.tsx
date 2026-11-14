import { MapPin } from "lucide-react";
import { getProvinceLabel } from "@/lib/provinces";

export function ProvinceLabel({ province, locale }: { province: string | null | undefined; locale: string }) {
  if (!province) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-earth-600">
      <MapPin className="h-3 w-3" />
      {getProvinceLabel(province, locale)}
    </span>
  );
}
