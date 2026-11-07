import { Moon, Sun } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSupabaseHealth } from '@/services/health'
import { useTheme } from '@/stores/theme'
import { UserMenu } from './user-menu'

function ConnectionIndicator() {
  const { data: ok, isPending } = useSupabaseHealth()
  const state = isPending ? 'checking' : ok ? 'connected' : 'offline'
  const dot = { checking: 'bg-amber-500', connected: 'bg-emerald-500', offline: 'bg-red-500' }[state]
  const label = { checking: 'Checking…', connected: 'Connected', offline: 'Offline' }[state]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1.5 font-normal" role="status" aria-label={`Supabase ${label}`}>
          <span className={`size-2 rounded-full ${dot}`} aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Supabase connection: {label}</TooltipContent>
    </Tooltip>
  )
}

export function Topbar() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <div className="flex-1" />
      <ConnectionIndicator />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
      </Button>
      <UserMenu />
    </header>
  )
}
