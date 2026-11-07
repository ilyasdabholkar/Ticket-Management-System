import logoMark from '@/assets/logo-mark.png'
import logo from '@/assets/logo.png'
import { cn } from '@/lib/utils'

interface BrandLogoProps {
  /** `full` = wordmark, `mark` = square "{C" icon. */
  variant?: 'full' | 'mark'
  className?: string
}

/**
 * Company logo. The wordmark is navy on transparent, so in dark mode it sits on a
 * light plate to stay legible.
 */
export function BrandLogo({ variant = 'full', className }: BrandLogoProps) {
  if (variant === 'mark') {
    return (
      <img
        src={logoMark}
        alt="CodeWithZ"
        className={cn('size-8 shrink-0 object-contain dark:rounded-md dark:bg-white dark:p-0.5', className)}
      />
    )
  }
  return (
    <img
      src={logo}
      alt="CodeWithZ"
      className={cn('h-8 w-auto object-contain dark:rounded-md dark:bg-white dark:px-1.5 dark:py-0.5', className)}
    />
  )
}
