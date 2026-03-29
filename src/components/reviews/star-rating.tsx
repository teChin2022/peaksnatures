import { Star } from "lucide-react";

export function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className="shrink-0"
          style={{
            width: size,
            height: size,
            fill: star <= rating ? "#2F5D50" : "transparent",
            color: star <= rating ? "#2F5D50" : "#d1d5db",
          }}
        />
      ))}
    </div>
  );
}
