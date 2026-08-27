# WebMCP Doctor

[![Quality gate](https://github.com/OtienoKeith/webmcp-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/OtienoKeith/webmcp-doctor/actions/workflows/ci.yml)
[![Live deployment](https://img.shields.io/badge/Cloudflare-live-F38020?logo=cloudflare&logoColor=white)](https://webmcp-doctor.otienomkeith.workers.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

WebMCP Doctor is a real-site diagnostic application for auditing the agent-facing interface of WebMCP-enabled websites. It renders a submitted public URL in an isolated Cloudflare browser, captures the tools registered after JavaScript executes, analyzes their metadata and JSON Schema contracts, and produces an explainable Agent Experience (AX) score. Local manifest and current-page scans remain available as secondary inputs.

- Live deployment: <https://webmcp-doctor.otienomkeith.workers.dev>
- Architecture details: [docs/architecture.md](docs/architecture.md)

![WebMCP Doctor dashboard](docs/webmcp-doctor-dashboard.png)

## Technical capabilities

| Component | Implementation |
| --- | --- |
| Real-site Scanner | Loads a public URL through Cloudflare Browser Run, captures imperative registrations, reads native `getTools()` when available, and synthesizes declarative form schemas |
| Local Scanner | Reads the current page’s `document.modelContext.getTools()` or parses an imported JSON manifest entirely in the browser |
| AX audit engine | Executes a deterministic 42-check rubric and returns evidence, remediation, category scores, and a weighted total |
| Failure X-Ray | Uses React Flow to display goal, discovery, selection, input, execution, and root-cause stages |
| Trace inspector | Exposes per-stage state, timing, reasoning, payload, error, and recovery information |
| Tool Surgeon | Compares current and proposed JSON contracts, exports repaired definitions, and replays 12 fixed test cases |
| Digital Twin | Compares human and WebMCP workflows at the capability level |
| WebMCP Lab | Registers seven imperative tools and verifies native registry readback and visible UI synchronization |

## Runtime architecture

```text
Public URL ─> POST /api/scan ─> Cloudflare Browser Run ─> registered tools ─┐
Imported manifest ──────────────────────────────────────────────────────────┤
Native getTools() ──────────────────────────────────────────────────────────┴─> auditTools()
                                                                                │
                                                                                ├─ 42 AuditCheck records
                                                                                ├─ 4 category scores
                                                                                └─ weighted AX score

Browser agent ─> document.modelContext.registerTool() ─> shared React state
                                                        ├─ scanner
                                                        ├─ health dashboard
                                                        ├─ failure trace
                                                        ├─ surgeon
                                                        └─ digital twin
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
│   ├── audit-checklist.tsx     # Filterable 42-check evidence interface
│   ├── doctor-dashboard.tsx    # Shared application state and WebMCP registration
│   ├── scanner-view.tsx        # Native self-scan and JSON manifest import
│   └── trace-flow.tsx          # React Flow failure visualization
└── lib/
    ├── audit.ts                # Pure parsing and scoring engine
    └── scenarios.ts            # Deterministic fixtures and repair definitions

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

## Supported manifest shape

The scanner accepts a tool array or an object containing a `tools` array:

```json
{
  "tools": [
    {
      "name": "deploy_release",
      "title": "Deploy release",
      "description": "Creates a deployment preview and only shifts production traffic after explicit confirmation. Returns deployment and rollback IDs.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "version": {
            "type": "string",
            "description": "Exact immutable release version"
          },
          "environment": {
            "type": "string",
            "enum": ["staging", "production"]
          },
          "mode": {
            "type": "string",
            "enum": ["preview", "execute"]
          },
          "confirmationToken": {
            "type": "string"
          },
          "idempotencyKey": {
            "type": "string"
          }
        },
        "required": ["version", "environment", "mode", "idempotencyKey"]
      }
    }
  ]
}
```

## WebMCP integration

When `document.modelContext` is available, the dashboard registers the following tools with `registerTool()`:

| Tool | Visible UI effect |
| --- | --- |
| `scan_agent_experience` | Opens and refreshes the AX health audit |
| `inspect_tool` | Opens the Tool Surgeon contract comparison |
| `trace_agent_failure` | Opens the selected scenario’s failure trace |
| `compare_human_agent_paths` | Opens the capability-level Digital Twin |
| `simulate_tool_change` | Applies the repaired definition and updates replay results |
| `run_ax_test` | Runs the deterministic AX test set |
| `explain_ax_score` | Expands the score calculation evidence |

Registration is progressively enhanced. Unsupported browsers use an in-memory registry mirror so the same interactions remain testable without changing application behavior.

## Deterministic fixtures

Four controlled fixtures live in `src/lib/scenarios.ts`:

| Fixture | Contract defect |
| --- | --- |
| Northstar Deploy | Ambiguous production deployment without preview, confirmation, or rollback |
| Nimbus Cloud | Credential rotation omits dependent consumers and an overlap window |
| Mercury Market | `finalizeCart` misrepresents an immediate purchase and charge |
| Orbit Workspace | Bulk invitation collapses partial failure and makes retries non-idempotent |

All trace stages, findings, repairs, and before/after results are static data. This prevents network or model nondeterminism during demonstrations and automated tests.

The controlled fixtures power the execution replay, repair comparison, and Digital Twin. The primary scanner does not substitute fixtures for a submitted URL: it audits the tool contracts discovered from that deployed page.

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

- the guided diagnostic flow and six-stage X-Ray;
- imported manifest auditing and all 42 evidence rows;
- registration of all seven native WebMCP tools;
- agent-triggered UI navigation and structured tool results.
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

- Imported manifests are never uploaded.
- Audit execution is synchronous and local to the browser.
- A submitted public URL is sent to the same-origin Worker and loaded in an isolated headless browser.
- The Worker blocks local, private, link-local, internal, credential-bearing, and non-HTTP targets, including matching subresource requests.
- Images, media, and fonts are skipped to reduce scan time and resource use.
- Discovered tools are inspected but never executed.
- No credentials are requested or persisted.
- No user content is sent to an external model.
- Tool execution in the included fixtures mutates only local React state.
- Wildcard origin exposure, sensitive parameters, consent boundaries, untrusted content, side-effect disclosure, idempotency, and recovery are explicit rubric checks.

## Known constraints

- Public sites that require authentication, CAPTCHA, client certificates, or private network access cannot be scanned remotely; open their exported tool manifest locally instead.
- A scan inspects tools registered during the initial page load. Tools exposed only after an authenticated action or later SPA state transition require a manifest scan or an in-page self-scan.
- Cloudflare’s free Browser Run allocation is finite, so repeated public scans can receive a temporary quota error; successful scans are cached for five minutes.
- Metadata analysis cannot prove the behavior of an opaque `execute` implementation; runtime conformance testing is represented by deterministic fixtures.
- The current release does not persist audit history or provide CI annotations for external projects.

## License

MIT
