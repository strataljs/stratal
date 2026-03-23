import { Deferred, Link, router } from '@inertiajs/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Layout from '../Layout'

interface Note {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

interface Comment {
  id: string
  author: string
  body: string
}

export default function Show({ note, comments }: { note: Note; comments?: Comment[] }) {
  function deleteNote() {
    router.delete(`/notes/${note.id}`)
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{note.title}</h1>
            <div className="mt-2 flex gap-2">
              <Badge variant="outline">{new Date(note.createdAt).toLocaleDateString()}</Badge>
              <Badge variant="secondary">Updated: {new Date(note.updatedAt).toLocaleDateString()}</Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" render={<Link href={`/notes/${note.id}/edit`} />}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={deleteNote}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/notes/export" />}>
              Export
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="prose pt-6">
            <p className="whitespace-pre-wrap">{note.content}</p>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-4 text-xl font-semibold">Comments</h2>
          <Deferred data="comments" fallback={
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground">
                Loading comments...
              </CardContent>
            </Card>
          }>
            <div className="space-y-3">
              {comments?.map((comment) => (
                <Card key={comment.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{comment.author}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{comment.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Deferred>
        </div>

        <Button variant="ghost" size="sm" render={<Link href="/notes" />}>
          &larr; Back to Notes
        </Button>
      </div>
    </Layout>
  )
}
