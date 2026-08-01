import { useState } from "react";
import { cn } from "@/lib/utils";

interface CardImagePlaceholderProps {
  photoUrl?: string | null;
  alt?: string;
  className?: string;
  /** Controls the placeholder icon + text size. Defaults to "md" */
  size?: "xs" | "sm" | "md" | "lg";
}

export function CardImagePlaceholder({
  photoUrl,
  alt = "",
  className,
  size = "md",
}: CardImagePlaceholderProps) {
  const [imageError, setImageError] = useState(false);

  if (photoUrl && !imageError) {
    return (
      <img
        src={photoUrl}
        alt={alt}
        className={cn("object-contain", className)}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <img
      src="/imageplaceholder.jpg"
      alt={alt || "No Image Available"}
      className={cn("object-contain", className)}
      onError={(e) => {
        // Fallback if placeholder also fails to load
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
