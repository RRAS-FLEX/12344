import { Star } from "lucide-react";

interface RatingComparisonPillProps {
  rating: number;
  reviewCount?: number;
  benchmarkRating?: number;
  label?: string;
}

const clampRating = (value: number) => Math.max(0, Math.min(5, Number(value || 0)));

const RatingComparisonPill = ({
  rating,
  reviewCount = 0,
  benchmarkRating: _benchmarkRating = 4.6,
  label: _label = "Fleet avg",
}: RatingComparisonPillProps) => {
  const safeRating = clampRating(rating);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-2.5 py-1 text-xs">
      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        {safeRating.toFixed(1)}
      </span>
      {reviewCount > 0 ? (
        <span className="text-muted-foreground">({reviewCount})</span>
      ) : null}
    </div>
  );
};

export default RatingComparisonPill;
