import { Link, usePage } from '@inertiajs/react'
import { useI18n } from '@stratal/inertia/react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function Layout({ children }: { children: ReactNode }) {
  const page = usePage()
  const { appName, currentNote } = page.props as { appName: string; currentNote?: string }
  const flash = page.flash as { success?: string; error?: string }
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-foreground">
            {appName}
          </Link>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />}>
              {t('common.nav.home')}
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/notes" />}>
              {t('common.nav.notes')}
            </Button>
          </nav>
        </div>
      </header>

      {flash.success && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <Badge variant="secondary">{flash.success}</Badge>
        </div>
      )}

      {flash.error && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <Badge variant="destructive">{flash.error}</Badge>
        </div>
      )}

      {currentNote && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <p className="text-sm text-muted-foreground">
            Viewing: <span className="font-medium text-foreground">{currentNote}</span>
          </p>
        </div>
      )}

      <main className="mx-auto max-w-4xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
