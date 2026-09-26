# Manual browser verification log

Do not mark checks passed from build output or automated tests. Each result needs the browser, exact version, OS, test date, extension build/commit, tester, and evidence path. Use synthetic portal data only.

## Run record

| Field | Chrome run | Firefox run |
|---|---|---|
| Browser and version | Version 0.11.7.1 (Official Build, Chromium 147.0.7727.137) (64-bit) | 156.0.1 |
| OS and version | Windows 11 Version 25H2 | Windows 11 Version 25H2 |
| Test date | 2026-09-26 | 2026-09-26 | 
| Extension version / commit | 1.3.5 | 1.3.5 |
| Tester | Soumil | Soumil|
| Evidence directory | .\provider-evidence\ | .\provider-evidence\ | 


## Chrome

| Check | Result | Evidence / notes |
|---|---|---|
| Extension loads without manifest/runtime errors | PASS | .\provider-evidence\ |
| Scan and visible-tab capture work | PASS | .\provider-evidence\ |
| Local vision/OCR fallback is clear and blocks unsafe egress | PASS | .\provider-evidence\ |
| Manual overlay drawing and mask toggling work | PASS | .\provider-evidence\ |
| Screenshot and structured payload rebuild after review | PASS | .\provider-evidence\ |
| Failed leak check blocks server transmission | PASS | .\provider-evidence\ |
| Sanitized server planning works after per-scan consent | PASS | .\provider-evidence\ |
| Local-only fallback works with server/network unavailable | PASS | .\provider-evidence\ |
| Safe action revalidates target before execution | PASS | .\provider-evidence\ |
| Submit/payment/delete requires separate approval | PASS | .\provider-evidence\ |

## Firefox

| Check | Result | Evidence / notes |
|---|---|---|
| Extension loads without manifest/runtime errors | PASS | .\provider-evidence\ |
| Scan and visible-tab capture work | PASS |  .\provider-evidence\ |
| Local vision/OCR fallback is clear and blocks unsafe egress | PASS | .\provider-evidence\ |
| Manual overlay drawing and mask toggling work | PASS |  .\provider-evidence\|
| Screenshot and structured payload rebuild after review | PASS | .\provider-evidence\ |
| Failed leak check blocks server transmission | PASS | .\provider-evidence\ |
| Sanitized server planning works after per-scan consent | PASS | .\provider-evidence\ |
| Local-only fallback works with server/network unavailable | PASS | .\provider-evidence\ |
| Safe action revalidates target before execution | PASS | .\provider-evidence\ |
| Submit/payment/delete requires separate approval | PASS | .\provider-evidence\ |

## Current environment note
Tested Manually
