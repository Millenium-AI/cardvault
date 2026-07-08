import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CardImagePlaceholderProps {
  photoUrl?: string | null;
  alt?: string;
  className?: string;
  /** Controls the placeholder icon + text size. Defaults to "md" */
  size?: "xs" | "sm" | "md" | "lg";
}

const sizeMap = {
  xs: { icon: 12, text: "text-[9px]" },
  sm: { icon: 14, text: "text-[10px]" },
  md: { icon: 18, text: "text-[11px]" },
  lg: { icon: 22, text: "text-xs" },
} as const;

export function CardImagePlaceholder({
  photoUrl,
  alt = "",
  className,
  size = "md",
}: CardImagePlaceholderProps) {
  const { icon, text } = sizeMap[size];

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={alt}
        className={cn("object-contain", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1",
        "bg-muted/40 border border-border/30 rounded",
        "text-muted-foreground/40",
        className,
      )}
    >
      <ImageOff size={icon} />
      <span className={cn("font-medium leading-none", text)}>No Image</span>
    </div>
  );
}
