import { AnimatePresence, motion } from 'motion/react'
import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router'
import { PageSkeleton } from '@/components/common/states'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { Topbar } from './topbar'

export function AppShell() {
  const location = useLocation()
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0 lets the content column shrink, so wide children (the board) scroll inside it instead of widening the page. */}
      <SidebarInset className="min-w-0">
        <Topbar />
        <div className="flex-1 overflow-x-hidden p-4 md:p-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              // The Board needs the full width for its six status columns; other pages keep a readable max width.
              className={location.pathname === '/board' ? 'w-full' : 'mx-auto w-full max-w-7xl'}
            >
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
