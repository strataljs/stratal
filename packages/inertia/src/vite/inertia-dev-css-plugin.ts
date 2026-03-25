import type { ModuleNode, Plugin, ViteDevServer } from 'vite'

const CSS_LANGS_RE = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)(?:$|\?)/
const VIRTUAL_MODULE_ID = 'virtual:inertia-ssr.css'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID

export interface InertiaDevCssOptions {
  entries: string[]
}

function collectStyleUrls(server: ViteDevServer, entries: string[]): string[] {
  const urls: string[] = []
  const visited = new Set<string>()

  function traverse(mod: ModuleNode) {
    if (visited.has(mod.url)) return
    visited.add(mod.url)

    if (CSS_LANGS_RE.test(mod.url)) {
      urls.push(mod.url)
    }

    for (const imported of mod.importedModules) {
      traverse(imported)
    }
  }

  for (const entry of entries) {
    const mod = server.moduleGraph.getModulesByFile(
      entry.startsWith('/') ? entry.slice(1) : entry,
    )

    if (mod) {
      for (const m of mod) {
        traverse(m)
      }
    }

    const urlMod = server.moduleGraph.urlToModuleMap.get(entry)
    if (urlMod) {
      traverse(urlMod)
    }
  }

  return urls
}

async function collectStyle(server: ViteDevServer, entries: string[]): Promise<string> {
  for (const entry of entries) {
    try {
      await server.transformRequest(entry)
    }
    catch {
      //
    }
  }

  const urls = collectStyleUrls(server, entries)
  const styles: string[] = []

  for (const url of urls) {
    try {
      const separator = url.includes('?') ? '&' : '?'
      const result = await server.transformRequest(url + separator + 'direct')
      if (result?.code) {
        styles.push(result.code)
      }
    }
    catch {
      //
    }
  }

  return styles.join('\n')
}

export function stratalInertiaDevCss(options: InertiaDevCssOptions): Plugin {
  let server: ViteDevServer

  return {
    name: 'stratal:inertia-dev-css',
    apply: 'serve',

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return await collectStyle(server, options.entries)
      }
    },

    configureServer(devServer) {
      server = devServer

      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? '', 'http://localhost').pathname
        if (pathname !== '/__inertia/ssr-css') { next(); return; }

        collectStyle(server, options.entries).then((css) => {
          res.setHeader('Content-Type', 'text/css')
          res.setHeader('Cache-Control', 'no-store')
          res.end(css)
        }).catch(() => {
          res.statusCode = 500
          res.end('')
        })
      })
    },
  }
}
