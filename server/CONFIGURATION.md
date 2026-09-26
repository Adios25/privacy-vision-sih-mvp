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

The extension's current **Plan with server** button connects to `vlm_bridge.py`
over WebSocket. Configure that bridge separately with `VLM_BASE_URL`,
`VLM_MODEL`, `VLM_PROVIDER`, and `VLM_API_KEY`. Defaults target local Ollama at
`http://127.0.0.1:11434/v1` with `qwen2.5vl:3b`; OpenAI-compatible endpoints can
be selected by changing the base URL, model, provider label, and server-only
key. The bridge returns its configured provider/model plus measured model and
server milliseconds. `server.py` is a separate HTTP planner and is not the
endpoint used by the extension's current button.

The WebSocket bridge accepts protocol version `1.0` only. It requires a passing
client leak check, a timestamped per-scan server-context consent flag, a
valid base64 redacted image no larger than 4 MiB, a redaction manifest, and a
sanitized page graph before invoking the model.
Requests that fail these gates receive an error and are not forwarded.
Model responses are reduced to the bounded `TYPE`, `CLICK`, and terminal
`COMPLETE` protocol. Type actions must use an allowed placeholder and all
targeted actions must provide a bounded target ID; invalid model output is
rejected before it reaches the extension. The extension then revalidates the
target against the current sanitized graph and live page before execution.
