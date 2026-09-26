# Manual browser verification log

Do not mark checks passed from build output or automated tests. Each result needs the browser, exact version, OS, test date, extension build/commit, tester, and evidence path. Use synthetic portal data only.

## Run record

| Field | Chrome run | Firefox run |
|---|---|---|
| Browser and version | Pending manual run | Pending manual run |
| OS and version | Pending manual run | Pending manual run |
| Test date | Pending manual run | Pending manual run |
| Extension version / commit | Pending manual run | Pending manual run |
| Tester | Pending manual run | Pending manual run |
| Evidence directory | Pending manual run; synthetic artifacts only | Pending manual run; synthetic artifacts only |

## Chrome

| Check | Result | Evidence / notes |
|---|---|---|
| Extension loads without manifest/runtime errors | NOT RUN | |
| Scan and visible-tab capture work | NOT RUN | |
| Local vision/OCR fallback is clear and blocks unsafe egress | NOT RUN | |
| Manual overlay drawing and mask toggling work | NOT RUN | |
| Screenshot and structured payload rebuild after review | NOT RUN | |
| Failed leak check blocks server transmission | NOT RUN | |
| Sanitized server planning works after per-scan consent | NOT RUN | |
| Local-only fallback works with server/network unavailable | NOT RUN | |
| Safe action revalidates target before execution | NOT RUN | |
| Submit/payment/delete requires separate approval | NOT RUN | |

## Firefox

| Check | Result | Evidence / notes |
|---|---|---|
| Extension loads without manifest/runtime errors | NOT RUN | |
| Scan and visible-tab capture work | NOT RUN | |
| Local vision/OCR fallback is clear and blocks unsafe egress | NOT RUN | |
| Manual overlay drawing and mask toggling work | NOT RUN | |
| Screenshot and structured payload rebuild after review | NOT RUN | |
| Failed leak check blocks server transmission | NOT RUN | |
| Sanitized server planning works after per-scan consent | NOT RUN | |
| Local-only fallback works with server/network unavailable | NOT RUN | |
| Safe action revalidates target before execution | NOT RUN | |
| Submit/payment/delete requires separate approval | NOT RUN | |

## Current environment note

On 2026-09-26, this execution environment exposed only Codex's in-app browser. No Chrome or Firefox browser session was available, so no browser row has been verified.
