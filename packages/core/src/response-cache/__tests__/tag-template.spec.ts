import { describe, expect, it } from 'vitest'
import { InvalidCacheTagError } from '../errors'
import { renderTags, type TagScopes } from '../tag-template'

const scopes = (over: Partial<TagScopes> = {}): TagScopes => ({
  param: {},
  query: {},
  body: undefined,
  data: undefined,
  ...over,
})

describe('renderTags', () => {
  it('passes literal tags through untouched', () => {
    expect(renderTags(['post-list'], scopes())).toEqual(['post-list'])
  })

  it('interpolates each of the four scopes', () => {
    const s = scopes({
      param: { slug: 'hello' },
      query: { tenant: 'acme' },
      body: { id: 7 },
      data: { post: { categoryId: 42 } },
    })
    expect(
      renderTags(
        ['post:{param.slug}', 'tenant:{query.tenant}', 'b:{body.id}', 'cat:{data.post.categoryId}'],
        s,
      ),
    ).toEqual(['post:hello', 'tenant:acme', 'b:7', 'cat:42'])
  })

  it('interpolates multiple placeholders in one template', () => {
    const s = scopes({ param: { a: '1', b: '2' } })
    expect(renderTags(['x:{param.a}:{param.b}'], s)).toEqual(['x:1:2'])
  })

  it('interpolates the same placeholder repeated in one template', () => {
    const s = scopes({ param: { a: '1' } })
    expect(renderTags(['x:{param.a}:{param.a}'], s)).toEqual(['x:1:1'])
  })

  it('does not reinterpret $-sequences in interpolated values as replacement patterns', () => {
    const cases = ['a$&b', 'a$$b', 'a$1b', 'a$`b', "a$'b"]
    for (const slug of cases) {
      expect(renderTags(['post:{param.slug}'], scopes({ param: { slug } }))).toEqual([
        `post:${slug}`,
      ])
    }
  })

  it('fans an array out to one tag per element', () => {
    const s = scopes({ body: { ids: [1, 2, 3] } })
    expect(renderTags(['post:{body.ids.*}'], s)).toEqual(['post:1', 'post:2', 'post:3'])
  })

  it('fans out an empty array to no tags', () => {
    expect(renderTags(['post:{body.ids.*}'], scopes({ body: { ids: [] } }))).toEqual([])
  })

  it('deduplicates identical rendered tags', () => {
    const s = scopes({ body: { ids: [1, 1] } })
    expect(renderTags(['post:{body.ids.*}'], s)).toEqual(['post:1'])
  })

  it('throws when a referenced value is missing', () => {
    expect(() => renderTags(['post:{param.slug}'], scopes())).toThrow(InvalidCacheTagError)
  })

  it('throws when a fan-out target is not an array', () => {
    expect(() => renderTags(['post:{body.ids.*}'], scopes({ body: { ids: 5 } }))).toThrow(
      InvalidCacheTagError,
    )
  })

  it('throws on two fan-out placeholders in one template', () => {
    const s = scopes({ body: { a: [1], b: [2] } })
    expect(() => renderTags(['{body.a.*}:{body.b.*}'], s)).toThrow(InvalidCacheTagError)
  })

  it('throws on an unknown scope', () => {
    expect(() => renderTags(['x:{nope.y}'], scopes())).toThrow(InvalidCacheTagError)
  })

  it('rejects a rendered tag containing a space', () => {
    expect(() => renderTags(['post:{param.slug}'], scopes({ param: { slug: 'a b' } }))).toThrow(
      InvalidCacheTagError,
    )
  })

  it('rejects a rendered tag containing a comma', () => {
    // `Cache-Tag` is a comma-delimited list and `CacheabilityService.apply`
    // joins with `,`, so `post:a,b` is two tags — neither of them `post:a,b`.
    // On the purge path the same comma, arriving from `?t=a,b`, would purge
    // tags the author never declared.
    expect(() => renderTags(['post:{query.t}'], scopes({ query: { t: 'a,b' } }))).toThrow(
      InvalidCacheTagError,
    )
  })

  it('rejects a rendered tag containing a double quote', () => {
    // The other character with structural meaning in an RFC 9110 §5.6.1
    // comma-delimited list: an unbalanced quote opens a quoted-string and
    // stops the following commas from delimiting.
    expect(() => renderTags(['post:{query.t}'], scopes({ query: { t: 'a"b' } }))).toThrow(
      InvalidCacheTagError,
    )
  })

  it('still accepts the printable ASCII that carries no list meaning', () => {
    // Guards against over-tightening the character class while excluding
    // `,` and `"` — `!`, `#`, `+`, `-`, `\` and the rest must still render.
    const slug = '!#$%&\'()*+-./:;<=>?@[\\]^_`{|}~'
    expect(renderTags(['{query.t}'], scopes({ query: { t: slug } }))).toEqual([slug])
  })

  it('rejects a rendered tag containing non-ASCII', () => {
    expect(() => renderTags(['post:{param.slug}'], scopes({ param: { slug: 'café' } }))).toThrow(
      InvalidCacheTagError,
    )
  })

  it('accepts a rendered tag of exactly 1024 bytes', () => {
    const slug = 'a'.repeat(1019) // 'post:' (5 bytes) + 1019 = 1024 bytes
    expect(renderTags(['post:{param.slug}'], scopes({ param: { slug } }))).toEqual([
      `post:${slug}`,
    ])
  })

  it('rejects a rendered tag over 1024 bytes', () => {
    expect(() =>
      renderTags(['post:{param.slug}'], scopes({ param: { slug: 'a'.repeat(1025) } })),
    ).toThrow(InvalidCacheTagError)
  })

  it('rejects an empty rendered tag', () => {
    expect(() => renderTags(['{param.slug}'], scopes({ param: { slug: '' } }))).toThrow(
      InvalidCacheTagError,
    )
  })
})
