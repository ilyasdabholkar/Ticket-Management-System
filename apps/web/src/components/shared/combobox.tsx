import { Check, ChevronsUpDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  icon?: ReactNode
  /** Extra text that is searchable but not displayed (e.g. email). */
  keywords?: string[]
  disabled?: boolean
}

interface ComboboxProps {
  id?: string
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** When set, an option with this label clears the value. */
  clearLabel?: string
  /** Shown when the current value is not among the options (e.g. an inactive application). */
  fallbackLabel?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  'aria-label'?: string
}

export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results.',
  clearLabel,
  fallbackLabel,
  disabled,
  invalid,
  className,
  ...rest
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? (value ? fallbackLabel : null)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-label={rest['aria-label']}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !label && 'text-muted-foreground', className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.icon}
            <span className="truncate">{label ?? (value === null && clearLabel ? clearLabel : placeholder)}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearLabel && (
                <CommandItem
                  value={`__clear__ ${clearLabel}`}
                  onSelect={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                >
                  <Check className={cn(value === null ? 'opacity-100' : 'opacity-0')} />
                  <span className="text-muted-foreground">{clearLabel}</span>
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  keywords={o.keywords}
                  disabled={o.disabled}
                  onSelect={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <Check className={cn(value === o.value ? 'opacity-100' : 'opacity-0')} />
                  {o.icon}
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
