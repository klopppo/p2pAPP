import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  label?: string
  title: string
  description?: string
  size?: "small" | "medium" | "large" | "xl"
  align?: "left" | "center" | "right"
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl"
  className?: string
}

const sizeClasses = {
  small: "text-3xl md:text-4xl",
  medium: "text-4xl md:text-5xl",
  large: "text-[42px] md:text-6xl",
  xl: "text-5xl md:text-7xl lg:text-8xl",
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
}

const alignClasses = {
  left: "text-left mx-auto",
  center: "text-center mx-auto",
  right: "text-right ml-auto",
}

export function SectionHeader({
  label,
  title,
  description,
  size = "medium",
  align = "center",
  maxWidth = "4xl",
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        maxWidthClasses[maxWidth],
        alignClasses[align],
        "space-y-4 md:space-y-6 mb-12 md:mb-16",
        className
      )}
    >
      {label && (
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
      )}
      <h2 className={cn("font-bold tracking-tight text-foreground", sizeClasses[size])}>
        {title}
      </h2>
      {description && (
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  )
}
