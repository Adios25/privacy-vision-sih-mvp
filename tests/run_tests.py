#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_server():
    spec = importlib.util.spec_from_file_location("pv_server", ROOT / "server" / "server.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def fixture_payload():
    return {
        "task": "Fill empty fields and prepare submission",
        "imageDataUrl": "data:image/png;base64,iVBORw0KGgo=",
        "leakCheck": {"status": "passed", "knownRawTermsInStructuredPayload": 0},
        "page": {
            "title": "Test",
            "urlClass": "127.0.0.1",
            "elements": [
                {"id": "e1", "role": "textbox", "enabled": True, "value": "", "purpose": "email", "inputType": "email", "label": "Email", "risk": "EMAIL"},
                {"id": "e2", "role": "textbox", "enabled": True, "value": "<USER_INPUT_1>", "purpose": "name", "inputType": "text", "label": "Full name", "risk": "PERSON"},
                {"id": "e13", "role": "button", "enabled": True, "value": "Complete application", "purpose": None, "inputType": "submit", "label": "Complete application", "risk": "HIGH_RISK"},
            ],
            "textBlocks": [],
            "categoryCounts": {"USER_INPUT": 1},
        },
    }


def main():
    server = load_server()
    payload = fixture_payload()
    candidate = server.heuristic_plan(payload)
    validated = server.validate_plan(candidate, payload)
    assert any(action["type"] == "TYPE_PLACEHOLDER" and action["targetId"] == "e1" for action in validated["actions"])
    assert not any(action.get("targetId") == "e2" for action in validated["actions"]), "Prefilled/user-typed values must be preserved"
    submit = next(action for action in validated["actions"] if action["type"] == "CLICK")
    assert submit["highRisk"] is True

    invalid = server.validate_plan({"actions": [{"type": "TYPE_PLACEHOLDER", "targetId": "e1", "placeholder": "<USER_PHONE>"}]}, payload)
    assert invalid["actions"][0]["type"] == "ABORT"

    blocked = dict(payload)
    blocked["leakCheck"] = {"status": "blocked"}
    try:
        server.make_plan(blocked)
        raise AssertionError("Server accepted a blocked leak check")
    except ValueError:
        pass

    website_js = (ROOT / "test-website" / "app.js").read_text(encoding="utf-8")
    popup_js = (ROOT / "extension" / "popup.js").read_text(encoding="utf-8")
    background_js = (ROOT / "extension" / "background.js").read_text(encoding="utf-8")
    assert "chrome." not in website_js and "browser." not in website_js
    extension_js = (ROOT / "extension" / "content.js").read_text(encoding="utf-8")
    for scenario_id in ("internship", "kyc", "telehealth", "visa"):
        assert scenario_id not in extension_js, f"Extension contains scenario-specific identifier: {scenario_id}"
    assert "rawTerms.add(value)" in extension_js and "USER_INPUT" in extension_js
    assert "Soumil Bhosle" in website_js and "Soumil Bhosle" in popup_js
    assert "soumil.bhosle@example.test" in website_js and "soumil.bhosle@example.test" in popup_js
    assert "createLocalPlan" in popup_js and "deterministic-schema-v1" in popup_js
    assert "localPlan" in popup_js and "serverPlan" in popup_js and "executionSource" in popup_js
    assert "renderPlan(data, 'server')" in popup_js and "renderPlan(createLocalPlan(state.payload.page), 'local')" in popup_js
    assert "execute-local" in popup_js and "execute-server" in popup_js
    assert "if (submit) actions.push({ type: 'CLICK'" in popup_js
    assert "await execute(plan.actions, false)" in popup_js and "requestSubmissionApproval" in popup_js
    assert "Decline submission" in (ROOT / "extension" / "popup.html").read_text(encoding="utf-8")
    assert "pvActiveSession" in popup_js and "storage.session" in popup_js
    assert "profile: state.profile" in popup_js and "profile: state.profile" not in popup_js.split("async function persistSession", 1)[1].split("async function discardPersistedSession", 1)[0]
    assert "renderOverlay" not in extension_js, "Page detection overlays must not remain on the website"
    assert "function rendered(element)" in extension_js and "!rendered(target)" in extension_js
    assert "target.scrollIntoView" in extension_js and "syntheticSubmissionCompleted" in extension_js
    assert "isSyntheticCompletionControl" in extension_js and "visible(element) || isSyntheticCompletionControl(element)" in extension_js
    assert "isSubmitControl" in extension_js and "element.type === 'submit'" in extension_js
    assert "submit|complete|confirm|pay|delete|agree" in extension_js
    assert "'0.0.0.0'" in extension_js
    assert "contentVersion: CONTENT_VERSION" in extension_js and "response?.contentVersion === CONTENT_VERSION" in popup_js
    assert "action.onClicked" in background_js
    assert "pendingCaptures" in background_js and "CAPTURE_TTL_MS" in background_js
    assert "storage." not in background_js, "Raw toolbar capture must remain memory-only"
    assert "tabId: state.tabId" in popup_js
    assert "Click Privvy's toolbar icon once" in background_js
    assert "data-preset=\"many\"" in (ROOT / "test-website" / "index.html").read_text(encoding="utf-8")
    for path in (ROOT / "test-website", ROOT / "extension"):
        for source in path.glob("*"):
            if source.is_file():
                content = source.read_text(encoding="utf-8")
                assert "Ananya Rao" not in content and "ananya.rao@example.test" not in content, f"Legacy identity remains in {source}"

    for path in (ROOT / "extension").glob("*.json"):
        json.loads(path.read_text(encoding="utf-8"))
    chrome_manifest = json.loads((ROOT / "extension" / "manifest.json").read_text(encoding="utf-8"))
    firefox_manifest = json.loads((ROOT / "extension" / "manifest.firefox.json").read_text(encoding="utf-8"))
    assert chrome_manifest.get("side_panel", {}).get("default_path") == "popup.html"
    assert "<all_urls>" not in chrome_manifest.get("host_permissions", [])
    assert "<all_urls>" not in firefox_manifest.get("host_permissions", [])
    assert "http://127.0.0.1/*" in chrome_manifest.get("host_permissions", [])
    assert "http://localhost/*" in chrome_manifest.get("host_permissions", [])
    assert chrome_manifest["version"] in extension_js
    assert "default_popup" not in chrome_manifest.get("action", {})
    assert firefox_manifest.get("action", {}).get("default_popup") == "popup.html"

    node = os.environ.get("PV_TEST_NODE") or shutil_which("node")
    if node:
        for path in [ROOT / "test-website" / "app.js", ROOT / "extension" / "background.js", ROOT / "extension" / "content.js", ROOT / "extension" / "popup.js"]:
            subprocess.run([node, "--check", str(path)], check=True)

    print("All Privvy SIH tests passed.")


def shutil_which(command: str):
    from shutil import which
    return which(command)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"TEST FAILURE: {error}", file=sys.stderr)
        raise
