#!/usr/bin/env python3
"""Audit an extension-exported sanitized evidence file without copying its payload."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TERMS = ROOT / "evaluation" / "synthetic-known-raw-terms.json"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--known-terms", type=Path, default=DEFAULT_TERMS)
    parser.add_argument("--output", type=Path, default=ROOT / "evaluation" / "provider-evidence" / "audit-report.json")
    parser.add_argument("--require-server", action="store_true", help="Require a non-fallback server plan and per-scan consent timestamp")
    args = parser.parse_args()

    raw_bytes = args.evidence.read_bytes()
    evidence = json.loads(raw_bytes.decode("utf-8"))
    terms_document = read_json(args.known_terms)
    if terms_document.get("syntheticOnly") is not True:
        raise ValueError("Known-term file must declare syntheticOnly=true")
    terms = [str(term) for term in terms_document.get("terms", []) if str(term)]
    payload = evidence.get("sanitizedPayload")
    if not isinstance(payload, dict):
        raise ValueError("Evidence does not contain sanitizedPayload")
    outbound = evidence.get("outboundRequest")
    audited_request = outbound if isinstance(outbound, dict) else payload
    request_text = json.dumps(audited_request, ensure_ascii=False)
    leaked_terms = [term for term in terms if term.casefold() in request_text.casefold()]
    server_plan = evidence.get("plans", {}).get("server")
    provider = str(server_plan.get("provider", "")) if isinstance(server_plan, dict) else ""
    model = str(server_plan.get("model", "")) if isinstance(server_plan, dict) else ""
    fallback = False
    if isinstance(server_plan, dict):
        fallback = "fallback" in provider.casefold() or bool(server_plan.get("fallback", {}).get("used"))
    consent_at = evidence.get("approval", {}).get("serverConsentAt")
    outbound_consent = audited_request.get("consent", {}) if isinstance(outbound, dict) else {}
    server_actions = server_plan.get("actions", []) if isinstance(server_plan, dict) else []
    page_elements = audited_request.get("sanitizedContext", {}).get("page", {}).get("elements", []) if isinstance(outbound, dict) else []
    known_targets = {str(item.get("id")) for item in page_elements if isinstance(item, dict) and item.get("id")}
    server_action_types = {"TYPE_PLACEHOLDER", "CLICK", "FINISH"}
    checks = {
        "schemaVersionIs1": evidence.get("schemaVersion") == 1,
        "syntheticDataDeclared": evidence.get("privacy", {}).get("syntheticDataRequired") is True,
        "rawCaptureDeclaredExcluded": evidence.get("privacy", {}).get("rawCaptureExcluded") is True,
        "rawOcrTermsDeclaredExcluded": evidence.get("privacy", {}).get("rawOcrTermsExcluded") is True,
        "localProfileDeclaredExcluded": evidence.get("privacy", {}).get("localProfileExcluded") is True,
        "exactOutboundRequestCaptured": isinstance(outbound, dict),
        "protocolVersionIs1": audited_request.get("protocolVersion") == "1.0",
        "leakCheckPassed": audited_request.get("leakCheck", {}).get("status") == "passed",
        "outboundConsentGranted": outbound_consent.get("serverContext") is True,
        "outboundConsentTimestampMatches": bool(consent_at) and outbound_consent.get("grantedAt") == consent_at,
        "knownRawTermsAbsentFromSerializedPayload": not leaked_terms,
        "redactedImagePresent": isinstance(audited_request.get("imageDataUrl"), str) and audited_request["imageDataUrl"].startswith("data:image/"),
        "redactionManifestPresent": isinstance(audited_request.get("sanitizedContext", {}).get("redactionManifest"), list) if isinstance(outbound, dict) else isinstance(payload.get("redactionManifest"), list),
        "serverPlanPresent": isinstance(server_plan, dict),
        "serverPlanActionsAllowlisted": bool(server_actions) and all(
            isinstance(action, dict) and action.get("type") in server_action_types for action in server_actions
        ),
        "serverPlanTargetsKnown": bool(server_actions) and all(
            not action.get("targetId") or str(action.get("targetId")) in known_targets
            for action in server_actions if isinstance(action, dict)
        ),
        "serverConsentRecorded": bool(consent_at),
        "providerIsNotFallback": bool(provider) and not fallback,
        "providerAndModelVisible": bool(provider and model),
    }
    required = [
        "schemaVersionIs1", "syntheticDataDeclared", "rawCaptureDeclaredExcluded",
        "rawOcrTermsDeclaredExcluded", "localProfileDeclaredExcluded", "leakCheckPassed",
        "knownRawTermsAbsentFromSerializedPayload", "redactedImagePresent", "redactionManifestPresent"
    ]
    if args.require_server:
        required.extend((
            "exactOutboundRequestCaptured", "protocolVersionIs1", "outboundConsentGranted",
            "outboundConsentTimestampMatches", "serverPlanPresent", "serverConsentRecorded",
            "serverPlanActionsAllowlisted", "serverPlanTargetsKnown",
            "providerIsNotFallback", "providerAndModelVisible"
        ))
    report = {
        "schemaVersion": 1,
        "evidenceSha256": hashlib.sha256(raw_bytes).hexdigest(),
        "sourceFilename": args.evidence.name,
        "checks": checks,
        "requiredChecks": required,
        "passed": all(checks[name] for name in required),
        "knownRawTermMatchCount": len(leaked_terms),
        "provider": provider or None,
        "model": model or None,
        "note": "The SHA-256 value is an integrity fingerprint. This audit cannot prove complete anonymization or inspect decoded image pixels."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Evidence audit {'PASSED' if report['passed'] else 'FAILED'}: {args.output}")
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
