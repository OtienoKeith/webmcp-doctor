# Architecture

WebMCP Doctor is browser-first with one narrowly scoped edge endpoint. Public URL scans require a real browsing context because WebMCP tools are registered by page JavaScript and cannot be inspected across origins from the static dashboard.

```mermaid
flowchart LR
    A[Browser agent] -->|document.modelContext| B[WebMCP bridge]
    C[Developer] -->|Public URL| N[POST /api/scan]
    N --> O[Cloudflare Browser Run]
    O -->|Captured tool contracts| D[One-page report]
    B --> E[Shared UI state]
    D --> F[42-check AX audit engine]
    F --> G[AX Health Score]
    F --> H[Failure X-Ray]
    F --> I[Tool Surgeon]
    F --> J[Digital Twin]
    B --> E
    E --> G
    E --> H
    E --> I
    E --> J
    L[Cloudflare Worker + static assets] --> M[Next.js export]
    M --> B
    M --> D
```

## Data boundaries

- Contract scoring happens in the client after a real-site scan.
- Real-site scans send only the public target URL to `POST /api/scan`.
- The Worker renders the page, captures imperative registrations, reads native tools where supported, and converts declarative WebMCP forms into JSON Schema.
- Tools are never invoked. Private and local network targets are rejected before navigation and at the subrequest boundary.
- Successful real-site responses are cached for five minutes to conserve Browser Run allocation.
- The fallback registry mirrors the same seven tools for browsers without WebMCP.
- Failure traces, repair proposals, and capability parity are derived from the current scan artifact.
- There are no API keys, databases, remote inference calls, cookies, or third-party analytics dependencies.

## Deployment

Next.js emits a static export into `out/`. Wrangler publishes that directory using Cloudflare Workers Static Assets. Static requests bypass Worker execution; `/api/*` is routed through `worker/index.ts`, which uses the `BROWSER` binding. No D1, KV, R2, or external service is required.
