# Server configuration

The planner server uses only the Python standard library. Development mode is
the default and is intended for a loopback browser extension and the synthetic
test portal. Set `PV_ENV=production` for a deployed or shared process.

| Variable | Default | Purpose |
|---|---:|---|
| `PV_HOST` / `PV_PORT` | `127.0.0.1` / `8787` | Bind address and HTTP port |
| `PV_ENV` | `development` | Enables development localhost and extension origins |
| `PV_ALLOWED_ORIGINS` | development defaults | Comma-separated exact browser origins in production |
| `PV_AUTH_TOKEN` | empty | Optional bearer token; required in production |
| `PV_PROVIDER` | `heuristic` | `heuristic`, `ollama`, or `openai-compatible` |
| `PV_MODEL` | provider-specific | Provider model name |
| `PV_OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama base URL |
| `PV_OPENAI_BASE_URL` | OpenAI API URL | OpenAI-compatible API base URL |
| `PV_API_KEY` | empty | Server-only provider secret; never sent to the extension |
| `PV_MAX_BODY_BYTES` | 8 MiB | Maximum request body |
| `PV_MAX_IMAGE_BYTES` | 4 MiB | Maximum decoded screenshot |
| `PV_MAX_IMAGE_WIDTH` / `HEIGHT` | 4096 | Maximum screenshot dimensions |
| `PV_MAX_IMAGE_PIXELS` | 12,000,000 | Maximum screenshot pixel count |
| `PV_MAX_MODEL_RESPONSE_BYTES` | 512 KiB | Maximum provider response |
| `PV_MAX_CONCURRENT_REQUESTS` | 4 | In-flight planner request limit |
| `PV_RATE_LIMIT_COUNT` / `WINDOW` | 30 / 60s | Per-client request limit |
| `PV_REQUEST_TIMEOUT` | 60s | Provider request timeout |

`GET /api/health` reports process liveness. `GET /api/ready` reports provider
configuration readiness without invoking model generation. `POST /api/plan`
accepts only leak-checked sanitized context and returns a versioned validated
plan. `GET /api/metrics` exposes aggregate timings and counts only.

Provider API keys, request bodies, raw page values, profile values, placeholder
mappings, and unredacted screenshots must not be placed in logs, CI variables,
metrics, or client payloads.
