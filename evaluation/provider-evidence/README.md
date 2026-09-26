# Server planner evidence procedure

This directory must contain only sanitized synthetic evidence and derived audit reports. Never place API keys, raw captures, raw OCR, real user data, browser profiles, or unredacted request bodies here.

## Capture

1. Configure and start `server/vlm_bridge.py` using server-only environment variables documented in `server/CONFIGURATION.md`.
2. Use the local synthetic portal.
3. Scan, review masks, approve redactions, enable per-scan server consent, request a server plan, and execute only the controlled workflow.
4. In the popup, choose **Export sanitized demo evidence**.
5. Open the JSON locally and confirm it contains the exact `outboundRequest`, `sanitizedPayload`, provider/model/timing, consent time, plans, and receipt. Confirm `privacy.rawCaptureExcluded`, `rawOcrTermsExcluded`, and `localProfileExcluded` are true.
6. Copy that reviewed file here with a dated name such as `sanitized-server-run-2026-09-26.json`.

## Audit

```powershell
python scripts/audit_planner_evidence.py --evidence evaluation\provider-evidence\sanitized-server-run-YYYY-MM-DD.json --require-server --output evaluation\provider-evidence\audit-report.json
```

The audit prefers the exact exported `outboundRequest`, checks it for the known synthetic raw terms in `evaluation/synthetic-known-raw-terms.json`, requires protocol `1.0`, a passing client leak check, and a consent timestamp matching the exported approval record. It also verifies that a redacted image and manifest are present, that exported server actions are allowlisted and reference known targets, and rejects fallback provider evidence when `--require-server` is used. It writes only the evidence filename, hash, checks, provider, and model to the audit report.

The audit cannot inspect whether pixels inside the exported image are correctly masked. Review the synthetic before/after preview and evaluation fixtures separately. The evidence hash is an integrity fingerprint, not proof of anonymization.

## Final gate

After all manual runs and result files exist:

```powershell
python scripts/check_sih_readiness.py
```

Exit code `0` means the required evidence files and completed records are present. It does not replace human review of screenshots, browser behavior, or result quality.
