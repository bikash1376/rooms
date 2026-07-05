import { forwardRef } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const staticButton = cva(
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium leading-none tracking-[-0.01em] outline-none transition-[background-color,color,transform,box-shadow,filter] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#0072ff]/50 focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        // Apple's signature blue "Buy" pill.
        primary:
          "bg-[#0072ff] text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:brightness-110",
        // The quiet "Learn more" link-pill.
        secondary:
          "bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed] dark:bg-white/10 dark:text-white dark:hover:bg-white/15",
        // Outlined variant for use over imagery.
        outline:
          "border border-[#0072ff] bg-transparent text-[#0072ff] hover:bg-[#0072ff] hover:text-white",
        ghost:
          "bg-transparent text-[#0072ff] hover:bg-[#0072ff]/10 dark:text-[#0072ff] dark:hover:bg-[#0072ff]/10",
        // Gradient fill; brightens slightly on hover.
        gradient:
          "bg-[linear-gradient(120deg,#6366f1,#8b5cf6,#ec4899)] text-white shadow-[0_4px_16px_-4px_rgba(139,92,246,0.6)] hover:brightness-110",
      },
      size: {
        sm: "px-4 py-2 text-[13px]",
        md: "px-[17px] py-2.5 text-[15px]",
        lg: "px-6 py-3 text-[17px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface StaticButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof staticButton> {
  /** Override the pill radius, in px (e.g. 8 for a soft rectangle, 0 for square). */
  radius?: number
}

/**
 * StaticButton — a clean, Apple-style pill button. No motion library, just CSS
 * transitions: a subtle color shift on hover and a press-in on tap. Variants
 * cover solid, quiet, outline, ghost, and a gradient fill; `radius` overrides
 * the pill shape.
 * Category: UI. Part of the Better Component library.
 */
export const StaticButton = forwardRef<HTMLButtonElement, StaticButtonProps>(
  function StaticButton(
    { className, variant, size, radius, type, style, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        style={radius != null ? { borderRadius: radius, ...style } : style}
        className={cn(staticButton({ variant, size }), className)}
        {...props}
      />
    )
  }
)
