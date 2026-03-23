import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link, router } from '@inertiajs/react'
import { useState } from 'react'
import Layout from '../Layout'

interface Note {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

interface Stats {
  total: number
  recent: number
}

export default function Index({ notes, stats, page }: { notes: Note[]; stats?: Stats; page: number }) {
  const [showStats, setShowStats] = useState(false)

  function loadMore() {
    router.reload({
      only: ['notes'],
      data: { page: page + 1 },
    })
  }

  function toggleStats() {
    if (!showStats) {
      router.reload({ only: ['stats'] })
    }
    setShowStats(!showStats)
  }

  function deleteNote(id: string) {
    router.delete(`/notes/${id}`)
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Notes</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={toggleStats}>
              {showStats ? 'Hide Stats' : 'Show Stats'}
            </Button>
            <Button nativeButton={false} render={<Link href="/notes/create" />}>
              Create Note
            </Button>
          </div>
        </div>

        {showStats && stats && (
          <Card>
            <CardContent className="flex gap-4 pt-6">
              <Badge variant="outline">Total: {stats.total}</Badge>
              <Badge variant="secondary">Recent (7d): {stats.recent}</Badge>
            </CardContent>
          </Card>
        )}

        {notes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No notes yet. Create your first note!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <Card key={note.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg">
                    <Link href={`/notes/${note.id}`} className="hover:underline">
                      {note.title}
                    </Link>
                  </CardTitle>
                  <Button variant="destructive" size="xs" onClick={() => deleteNote(note.id)}>
                    Delete
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{note.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={loadMore}>
              Load More
            </Button>
          </div>
        )}
      </div>
    </Layout>
  )
}
