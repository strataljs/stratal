import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Link, useForm } from '@inertiajs/react'
import type { FormEvent } from 'react'
import Layout from '../Layout'

export default function Create() {
  const form = useForm({ title: '', content: '' })

  function submit(e: FormEvent) {
    e.preventDefault()
    form.post('/notes')
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Create Note</h1>

        <Card>
          <CardHeader>
            <CardTitle>New Note</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">Title</label>
                <Input
                  id="title"
                  value={form.data.title}
                  onChange={(e) => form.setData('title', e.target.value)}
                  placeholder="Enter note title"
                />
                {form.errors.title && (
                  <p className="text-sm text-destructive">{form.errors.title}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="content" className="text-sm font-medium">Content</label>
                <Textarea
                  id="content"
                  value={form.data.content}
                  onChange={(e) => form.setData('content', e.target.value)}
                  placeholder="Write your note..."
                  rows={8}
                />
                {form.errors.content && (
                  <p className="text-sm text-destructive">{form.errors.content}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={form.processing}>
                  {form.processing ? 'Creating...' : 'Create Note'}
                </Button>
                <Button nativeButton={false} variant="ghost" render={<Link href="/notes" />}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
