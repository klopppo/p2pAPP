import * as React from "react"
import { cn } from "@/lib/utils"

const Text = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement | HTMLParagraphElement> & {
    variant?: "h1" | "h2" | "h3" | "h4" | "subtitle" | "body" | "muted" | "small"
    as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div"
  }
>(({ className, variant = "body", as, ...props }, ref) => {
  const Component = as || (
    variant === "h1" ? "h1" :
    variant === "h2" ? "h2" :
    variant === "h3" ? "h3" :
    variant === "h4" ? "h4" :
    "p"
  )

  const variantClasses = {
    h1: "scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl",
    h2: "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
    h3: "scroll-m-20 text-2xl font-semibold tracking-tight",
    h4: "scroll-m-20 text-xl font-semibold tracking-tight",
    subtitle: "text-lg text-muted-foreground",
    body: "leading-7",
    muted: "text-sm text-muted-foreground",
    small: "text-sm font-medium leading-none",
  }

  return (
    <Component
      className={cn(variantClasses[variant], className)}
      ref={ref as any}
      {...props}
    />
  )
})
Text.displayName = "Text"

export { Text }
