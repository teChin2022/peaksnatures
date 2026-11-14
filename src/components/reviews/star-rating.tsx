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
            // Mist Ridge star: 4.6:1 on Pine Mist; the empty outline is Line Strong.
            fill: star <= rating ? "#8A6A2F" : "transparent",
            color: star <= rating ? "#8A6A2F" : "#8A948F",
          }}
        />
      ))}
    </div>
  );
}
