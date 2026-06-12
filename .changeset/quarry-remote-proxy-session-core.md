---
"stratal": patch
---

Support wrangler remote bindings in the Quarry dev runner

Bindings marked `remote: true` in your `wrangler` config now connect to the deployed Cloudflare resources during local development, instead of resolving against the local dev registry. Plain local runs are unaffected. When a remote binding is in use, Quarry logs which bindings are being proxied and requires valid wrangler credentials (`wrangler login` or `CLOUDFLARE_API_TOKEN`).
