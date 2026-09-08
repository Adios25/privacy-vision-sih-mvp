# Privvy Improvement Implementation Plan

## Purpose

This document is a practical roadmap for improving the Privvy SIH MVP without
changing its core privacy contract:

- Raw page values, raw DOM text, unredacted screenshots, and profile values must
  remain local.
- The server may receive only sanitized UI context and an opaque redacted image.
- Empty fields must be fillable, but existing user-entered values must never be
  overwritten.
- High-risk actions must always require explicit user approval.
- The local deterministic plan must remain usable when the server or model is
  unavailable.

The plan is ordered by risk and dependency. Codex should complete one phase,
run its acceptance checks, and only then continue to the next phase.

## Current project assessment

### Existing strengths

1. Local-first scanning, redaction, OCR, and visual detection.
2. Typed placeholders instead of sending profile values to the server.
3. Leak-check gating before network planning.
4. Separate local and server plans.
5. Execution-time target validation and stale-page protection.
6. Explicit confirmation for synthetic high-risk submission.
7. Heuristic fallback when a model provider fails.
8. A useful privacy/UX contract and a baseline regression test suite.

### Issues to address

1. Version numbers are inconsistent between `package.json`, manifests, source
   constants, and documentation.
2. The HTTP server is a development server with wildcard CORS, no authentication,
   no rate limiting, no request correlation ID, and no graceful shutdown path.
3. Model-provider errors are collapsed into a broad fallback path, making
   operational diagnosis difficult.
4. The request validator does not enforce a complete schema, field limits,
   image dimensions, URL/origin policy, or duplicate action constraints.
5. The OpenAI-compatible request path needs provider-response validation and
   explicit support for providers that do not implement JSON mode.
6. Metrics are process-local and expose no health/readiness distinction.
7. Browser API compatibility is handled with repeated ad-hoc promise wrappers
   and empty catches.
8. The extension has no formal unit tests for sanitization, OCR merging,
   execution races, session restoration, or browser API failures.
9. There is no reproducible integration test that starts the server and tests
   the real `/api/health`, `/api/plan`, and `/api/metrics` endpoints.
10. The build output and large model/runtime assets need clearer validation and
    packaging checks.

## Phase 0: Establish a safe baseline

### 0.1 Freeze the privacy contract

- Treat `UX-CONTRACT.md` as the normative behavior document.
- Add a short "security invariants" section to the main README linking to the
  contract.
- Record which data is allowed in each boundary: content script, popup,
  extension storage, server request, model request, and metrics.

**Acceptance criteria**

- A reviewer can trace every outbound field to an approved contract entry.
- No new feature is allowed to send raw values, raw OCR text, profile data, or
  placeholder mappings.

### 0.2 Normalize versioning

- Define one source of truth for the extension version.
- Generate or validate Chrome and Firefox manifests from that value.
- Update `CONTENT_VERSION`, README references, package metadata, and tests
  together.
- Fail the build when version values disagree.

**Acceptance criteria**

- One version check passes for package metadata, both manifests, source
  constants, and documentation.
- Release artifacts contain the same version as the source.

## Phase 1: Harden the server boundary

### 1.1 Add strict request and response schemas

Create typed validation for:

- Request envelope and required fields.
- `page.elements`, `textBlocks`, category counts, viewport, task, and metrics.
- Element IDs, roles, purposes, labels, values, and risk values.
- Allowed image MIME types and maximum encoded image size.
- Action count, action field types, action ordering, and maximum message lengths.

Reject malformed input with a stable error code and a correlation ID. Do not
silently coerce malformed values.

**Acceptance criteria**

- Invalid JSON, missing fields, wrong types, oversized arrays, invalid IDs,
  invalid image data, and unsupported actions receive `400` responses.
- A model response can never bypass `validate_plan`.
- The server never logs request bodies or sensitive field values.

### 1.2 Improve image validation

- Enforce a smaller configurable request limit for screenshots.
- Validate base64 length before decoding.
- Validate supported image MIME types.
- Decode enough metadata to enforce maximum width, height, and pixel count.
- Reject decompression-bomb-like inputs.

**Acceptance criteria**

- Oversized, malformed, unsupported, and dimension-abusing images are rejected.
- Valid PNG/JPEG/WebP fixtures continue to work.

### 1.3 Lock down HTTP behavior

Add configuration for:

- Allowed origins instead of `Access-Control-Allow-Origin: *`.
- Optional shared bearer token for local trusted clients.
- Per-client rate limiting and a concurrent-request limit.
- Request timeout and maximum model response size.
- `GET /api/ready` for provider readiness, separate from process liveness.
- `X-Request-ID` response/request correlation.
- Security headers and an explicit `OPTIONS` policy.

Keep the current permissive settings only as an explicit development mode.

**Acceptance criteria**

- Requests from disallowed origins are rejected.
- Rate-limit responses are deterministic and do not expose payload data.
- Health reports process health; readiness reports provider configuration and
  reachability without calling the model on every probe.

### 1.4 Make provider failures observable and safe

- Replace broad provider handling with typed errors for timeout, network,
  authentication, HTTP status, invalid JSON, and schema failures.
- Preserve the deterministic fallback, but return a machine-readable fallback
  reason and a user-safe message.
- Validate the OpenAI-compatible response shape before parsing content.
- Confirm the authorization header uses the configured API key and never expose
  it in logs or response messages.
- Add retry only for safe transient failures, with a short bounded backoff.

**Acceptance criteria**

- Authentication failures do not trigger repeated retries.
- Timeout and provider-unavailable cases still return a valid local fallback.
- Provider secrets never appear in metrics, exceptions, or console output.

## Phase 2: Strengthen the extension runtime

### 2.1 Centralize browser API compatibility

- Create one small API adapter for Chrome promise APIs and Firefox callback
  APIs.
- Remove duplicated promise conversion logic.
- Replace empty catches with intentional error handling and user-visible status
  where recovery matters.
- Add a compatibility matrix for Chrome side panel and Firefox popup behavior.

**Acceptance criteria**

- Every rejected browser API operation has either a visible recovery message,
  an intentional best-effort comment, or is propagated to the caller.
- Scan, capture, storage, and execution work in both supported browsers.

### 2.2 Make scan state and execution state explicit

Introduce a small state machine for:

`idle -> scanning -> scanned -> planning -> ready -> executing -> completed`

with explicit `blocked` and `failed` states.

- Prevent concurrent scans and executions.
- Cancel or invalidate stale requests when the tab changes.
- Keep the local plan available while server planning is pending.
- Ensure only one high-risk approval can be consumed.

**Acceptance criteria**

- Double-clicking scan or execute does not duplicate actions.
- Changing tabs or page state invalidates old execution safely.
- A failed server request never removes a valid local plan.

### 2.3 Improve redaction and detection quality

- Separate detection identity from display token numbering so token order is
  stable across DOM/OCR/visual detector timing.
- Add confidence and source metadata consistently.
- Improve overlap/deduplication using normalized coordinates and category rules.
- Add configurable patterns for common regional identifiers while keeping
  false-positive controls.
- Make text and control redaction cover the full visible sensitive region.

**Acceptance criteria**

- Repeated scans of an unchanged page produce stable sanitized graphs and
  state hashes.
- Overlapping DOM/OCR/YOLO detections do not create excessive duplicate masks.
- A value in a generic field is still protected when a supported pattern matches.

### 2.4 Improve local profile handling

- Move demo profile values to clearly marked test-only defaults.
- Add an extension settings screen for user-managed profile fields.
- Encrypt or otherwise minimize persisted profile data where supported.
- Never include profile data in session snapshots, server payloads, logs, or
  error messages.
- Add an explicit "clear profile" action.

**Acceptance criteria**

- Profile values are used only at execution time.
- Session restoration contains no profile values.
- Clearing the profile removes all stored profile fields.

## Phase 3: Improve planner correctness and safety

### 3.1 Formalize the action protocol

Define a versioned action schema with:

- `planVersion`, action IDs, source, target ID, risk, reason, and preconditions.
- A clear terminal action rule for `FINISH` and `ABORT`.
- A maximum number of actions and no duplicate target operations.
- A distinction between navigation, field entry, ordinary click, and submission.

Validate the same protocol in the extension and server. Prefer generating
schemas from one source or keeping a contract fixture shared by both sides.

**Acceptance criteria**

- Local and server plans render the same protocol fields.
- Unknown fields are ignored or rejected according to the documented policy.
- Invalid plans are blocked before rendering as executable.

### 3.2 Add precondition snapshots

For each executable action, record safe, non-sensitive preconditions such as:

- target ID and role;
- enabled/visible state;
- input type and purpose;
- empty/non-empty status;
- page state hash.

Re-check every precondition immediately before execution.

**Acceptance criteria**

- DOM replacement, field mutation, role changes, disabled controls, and stale
  hashes block the affected action.
- A blocked action produces a clear receipt reason and never partially submits.

### 3.3 Treat page instructions as untrusted

- Keep page text out of system instructions and label it as untrusted data.
- Add explicit prompt-injection fixtures to tests.
- Limit the model to the structured action protocol; never execute returned
  JavaScript, selectors, URLs, or arbitrary code.
- Add a server-side allowlist for action fields and target references.

**Acceptance criteria**

- Injection-like page text cannot change the allowed action set.
- No model output can cause arbitrary navigation, script execution, or raw
  value retrieval.

## Phase 4: Testing and quality engineering

### 4.1 Expand Python server tests

Add tests for:

- Request schema and every validation failure category.
- Image validation and size limits.
- Provider response parsing and typed provider failures.
- Fallback labeling and metrics privacy.
- CORS/auth/rate limiting.
- Concurrent requests and bounded model timeouts.
- Health/readiness behavior.

Use deterministic fake provider responses; never require a live API key.

### 4.2 Add JavaScript unit tests

Extract pure functions where practical and test:

- Pattern matching and payment-card validation.
- Purpose inference and token stability.
- DOM/OCR/visual detection merging.
- Leak-check behavior.
- Action state machine transitions.
- Target precondition validation.
- Session serialization and profile exclusion.

### 4.3 Add end-to-end smoke tests

Create a script that:

1. Starts the heuristic server on an ephemeral port.
2. Calls health, readiness, plan, and metrics endpoints.
3. Exercises valid, blocked, malformed, and oversized payloads.
4. Verifies no raw fixture terms occur in response logs or metrics.
5. Stops the server cleanly.

If browser automation is available, add one Chrome and one Firefox smoke path
for scan, local execute, high-risk decline, and stale-page blocking.

### 4.4 Add static and packaging checks

- JavaScript syntax check all source files.
- JSON parse all manifests and package metadata.
- Verify required model/WASM/OCR assets exist before packaging.
- Verify no debug secrets, API keys, raw demo identities, or broad host
  permissions are present in release output.
- Run the existing test command and build command in CI.

## Phase 5: Product and UX improvements

### 5.1 Make privacy evidence easier to understand

- Add a clear boundary diagram inside the extension.
- Show exactly what is local, what is sanitized, and what was sent.
- Show provider mode, model name, request size, latency, and fallback status.
- Explain why an action was blocked in plain language.
- Add an exportable, sanitized diagnostic report with no raw values.

### 5.2 Add user controls

- Provider selection and endpoint settings with validation.
- "Local only" mode that disables all server requests.
- Per-scan approval for sending sanitized context.
- Configurable high-risk categories.
- Clear session and profile controls.

### 5.3 Improve accessibility and resilience

- Keyboard-complete scan, plan, approval, and receipt flows.
- Focus management for errors and approval prompts.
- Reduced-motion support and stable loading geometry.
- Better empty, timeout, model-unavailable, and permission-denied states.
- Narrow viewport and high-contrast verification.

## Phase 6: Deployment and maintainability

### 6.1 Refactor server modules

Split `server.py` into focused modules:

- configuration;
- schemas and validation;
- providers;
- planner and fallback;
- metrics;
- HTTP handlers;
- application entry point.

Keep the current public behavior during the refactor and add import-level tests.

### 6.2 Add configuration documentation

Document all environment variables, defaults, security implications, limits,
provider compatibility, and development versus production settings.

### 6.3 Add CI

Recommended checks:

- Python syntax and tests.
- JavaScript syntax and existing tests.
- Extension packaging.
- Manifest/version consistency.
- Secret and permission checks.
- A minimal heuristic server smoke test.

Do not place real API keys in CI. Use fake providers and local fixtures.

## Suggested Codex execution order

Use these prompts as separate Codex tasks rather than one large change:

1. "Normalize project versioning and add a build-time consistency check."
2. "Add strict server request/action schemas and focused Python tests."
3. "Harden server HTTP configuration with origin allowlisting, auth, limits,
   correlation IDs, and readiness."
4. "Refactor provider errors into typed safe fallback behavior and test it with
   fake providers."
5. "Centralize Chrome/Firefox browser API compatibility and remove silent
   error handling."
6. "Implement the extension scan/planning/execution state machine with race
   protection."
7. "Stabilize detection tokens and improve DOM/OCR/visual deduplication."
8. "Add action preconditions and execution-time safety tests."
9. "Add JavaScript unit tests and a real server integration smoke test."
10. "Improve privacy evidence, settings, accessibility, and local-only mode."
11. "Split the server into modules without changing its API."
12. "Add CI and release artifact security checks."

## Definition of done

The improvement program is complete when:

- Existing privacy and UX contract tests still pass.
- All outbound payload fields are schema-validated and leak-checked.
- Server endpoints are protected by explicit development/production settings.
- Local planning and execution remain functional without a server.
- High-risk actions remain approval-gated under race, stale-page, and provider
  failure conditions.
- Chrome and Firefox packages build with consistent versions.
- Unit, integration, packaging, and smoke tests run reproducibly without
  external secrets.
