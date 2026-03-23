import { Deferred, Link } from '@inertiajs/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Layout from './Layout'

export default function Home({ message, noteCount }: { message: string; noteCount?: number }) {
  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{message}</h1>
          <p className="mt-2 text-muted-foreground">
            This page is rendered with Inertia.js and Stratal.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
            <CardDescription>Your notes at a glance</CardDescription>
          </CardHeader>
          <CardContent>
            <Deferred data="noteCount" fallback={<Badge variant="secondary">Loading stats...</Badge>}>
              <Badge variant="outline">{typeof noteCount === 'number' ? noteCount : 0} notes</Badge>
            </Deferred>

            <div className="mt-4">
              <Button nativeButton={false} render={<Link href="/notes" />}>
                View All Notes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
