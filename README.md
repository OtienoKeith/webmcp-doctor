# WebMCP Doctor

[![Quality gate](https://github.com/OtienoKeith/webmcp-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/OtienoKeith/webmcp-doctor/actions/workflows/ci.yml)
[![Live deployment](https://img.shields.io/badge/Cloudflare-live-F38020?logo=cloudflare&logoColor=white)](https://webmcp-doctor.otienomkeith.workers.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

WebMCP Doctor is a real-site diagnostic application for auditing the agent-facing interface of WebMCP-enabled websites. It renders a submitted public URL in an isolated Cloudflare browser, captures the tools registered after JavaScript executes, analyzes their metadata and JSON Schema contracts, and produces one explainable Agent Experience (AX) report. Every result is derived from the submitted site.

- Live deployment: <https://webmcp-doctor.otienomkeith.workers.dev>
- Architecture details: [docs/architecture.md](docs/architecture.md)

![WebMCP Doctor dashboard](docs/webmcp-doctor-dashboard.png)

## Technical capabilities

| Component | Implementation |
| --- | --- |
| Real-site Scanner | Loads a public URL through Cloudflare Browser Run, captures imperative registrations, reads native `getTools()` when available, and synthesizes declarative form schemas |
| AX audit engine | Executes a deterministic 42-check rubric and returns evidence, remediation, category scores, and a weighted total |
| Failure X-Ray | Uses React Flow to display goal, discovery, selection, input, execution, and root-cause stages |
| Trace inspector | Exposes per-stage state, observed evidence, and recommended remediation |
| Tool Surgeon | Compares live and proposed JSON contracts, exports repaired definitions, and reruns the same 42-check rubric |
| Digital Twin | Compares human and WebMCP workflows at the capability level |
| Native WebMCP interface | Registers seven imperative tools that scroll to and update the corresponding section of the one-page report |

## Runtime architecture

```text
Public URL ─> POST /api/scan ─> Cloudflare Browser Run ─> registered tools ─> auditTools()
                                                                                │
                                                                                ├─ 42 AuditCheck records
                                                                                ├─ 4 category scores
                                                                                └─ weighted AX score

Browser agent ─> document.modelContext.registerTool() ─> shared React state
                                                        └─ one-page report sections
```

The Next.js interface is exported as static HTML, CSS, and JavaScript. A single Cloudflare Worker route, `POST /api/scan`, performs read-only browser rendering for public URLs; static assets bypass Worker execution. There is no database, authentication layer, remote model call, or third-party analytics dependency.

## Source layout

```text
src/
├── app/
│   ├── globals.css             # Application design system and responsive layout
│   ├── icon.svg                # Application icon
│   ├── layout.tsx              # Root metadata and document shell
│   └── page.tsx                # Server entry point
├── components/
│   ├── audit-checklist.tsx     # Reusable 42-check evidence interface
│   ├── doctor-dashboard.tsx    # One-page report state and WebMCP registration
│   ├── scanner-view.tsx        # Public real-site URL input
│   └── trace-flow.tsx          # React Flow failure visualization
└── lib/
    ├── audit.ts                # Pure parsing and scoring engine
    └── scan-analysis.ts        # Real trace, repair, and capability comparison derivation

tests/
├── audit.test.ts               # Vitest scoring and security tests
├── url-safety.test.ts          # Public URL and SSRF boundary tests
└── e2e/doctor.spec.ts          # Playwright app, URL scan, and WebMCP tests

worker/
├── index.ts                    # Browser Run scan endpoint and tool extraction
└── url-safety.ts               # Public-target validation
```

## AX scoring model

The rubric contains exactly 42 checks:

| Category | Checks | Weight |
| --- | ---: | ---: |
| Discoverability | 11 | 25% |
| Tool clarity | 11 | 30% |
| Reliability and recovery | 12 | 25% |
| Safety | 8 | 20% |

Each check returns one of three statuses:

- `passed` = 1 point
- `warning` = 0.5 points
- `failed` = 0 points

Category scores are calculated from earned points and combined using the weights above. Critical guardrail failures cap the affected category:

- clarity is capped at 45 when action naming or side-effect disclosure fails;
- reliability is capped at 50 when idempotency, preview, or recovery fails;
- safety is capped at 35 when approval, intent alignment, or prompt-injection boundaries fail.

The output is an `AuditResult` containing the total score, category scores, all check results, source type, tool count, and audit timestamp.

## WebMCP integration

When `document.modelContext` is available, the dashboard registers the following tools with `registerTool()`:

| Tool | Visible UI effect |
| --- | --- |
| `scan_agent_experience` | Scrolls to the public URL scanner |
| `inspect_tool` | Scrolls to the Tool Surgeon contract comparison |
| `trace_agent_failure` | Scrolls to the latest real scan’s contract-readiness trace |
| `compare_human_agent_paths` | Scrolls to the capability comparison |
| `simulate_tool_change` | Applies the repaired definition and updates replay results |
| `run_ax_test` | Scrolls to the deterministic AX score |
| `explain_ax_score` | Opens the AX score section and its weighting evidence |

Registration is progressively enhanced. Unsupported browsers use an in-memory registry mirror so the same interactions remain testable without changing application behavior.

## Real-data diagnostic derivation

The AX Health section uses the `AuditResult` produced from the discovered registry. Failure X-Ray derives its six stages from those category scores and the first observed contract risk. Tool Surgeon transforms a selected discovered contract and reruns the same rubric against the proposal. The Human × Agent section compares controls extracted from the rendered page with the discovered WebMCP tool names, titles, and descriptions.

## Local development

Requirements:

- Node.js 22+
- npm 10+

```bash
git clone https://github.com/OtienoKeith/webmcp-doctor.git
cd webmcp-doctor
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run the Vitest unit suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build` | Generate the static Next.js export in `out/` |
| `npm run test:e2e` | Build, serve, and test the export with Playwright Chromium |
| `npm run check` | Run lint, TypeScript, generated Worker type verification, unit tests, and production build |
| `npm run serve:static` | Serve `out/` locally on port 3100 |
| `npm run preview:cloudflare` | Build and preview through Wrangler with the remote Browser Run binding |
| `npm run deploy` | Build and deploy Cloudflare static assets |

## Automated verification

Vitest verifies:

- the 11/11/12/8 rubric distribution;
- accepted manifest container shapes;
- unsafe checkout consent and idempotency failures;
- improved scoring for repaired contracts;
- required `untrustedContentHint` behavior for content-returning tools.
- rejection of local, private, link-local, credential-bearing, and non-HTTP scan targets.

Playwright verifies:

- the single-page real-site report and six-stage X-Ray;
- the one-input landing state with no preset or fixture controls;
- registration of all seven native WebMCP tools;
- agent-triggered section navigation and structured tool results;
- the public-URL scan contract and live-site result presentation.

GitHub Actions runs `npm ci`, the full `check` command, Chromium installation, end-to-end tests, and a Wrangler deployment dry run on every push and pull request.

## Cloudflare deployment

`next.config.ts` enables `output: "export"`. `wrangler.jsonc` publishes `./out` through Cloudflare Workers Static Assets and routes only `/api/*` through `worker/index.ts`. The `BROWSER` binding uses Cloudflare Browser Run:

```bash
npm run deploy
```

For the manual GitHub deployment workflow, configure these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Security and privacy properties

- Audit scoring is synchronous and local to the browser.
- A submitted public URL is sent to the same-origin Worker and loaded in an isolated headless browser.
- The Worker blocks local, private, link-local, internal, credential-bearing, and non-HTTP targets, including matching subresource requests.
- Images, media, and fonts are skipped to reduce scan time and resource use.
- Discovered tools are inspected but never executed.
- No credentials are requested or persisted.
- No user content is sent to an external model.
- Generated repair proposals mutate only local React state and never alter the scanned website.
- Wildcard origin exposure, sensitive parameters, consent boundaries, untrusted content, side-effect disclosure, idempotency, and recovery are explicit rubric checks.

## Known constraints

- Public sites that require authentication, CAPTCHA, client certificates, or private network access cannot be scanned.
- A scan inspects tools registered during the initial page load. Tools exposed only after an authenticated action or later SPA state transition are not currently captured.
- Cloudflare’s free Browser Run allocation is finite, so repeated public scans can receive a temporary quota error; successful scans are cached for five minutes.
- Metadata analysis cannot prove the behavior of an opaque `execute` implementation; the interface labels metadata-derived traces and never presents them as executed transactions.
- The current release does not persist audit history or provide CI annotations for external projects.

## License

MIT
