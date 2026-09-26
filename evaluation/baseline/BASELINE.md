# Baseline record

- Date: 2026-09-26
- Git HEAD: `f9307ca68d7959e1a0ae1055ed958c9c6117f2da`
- State: working tree was dirty; this baseline includes the local person-region correction and evaluation scaffold. It is not a pristine commit baseline.
- Runtime: Node.js `v24.14.0`; npm `11.9.0`; Python runtime bundled with Codex at `C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.

## Commands and results

| Command | Result |
|---|---|
| `npm test` | PASS: YOLO mapping, manual redaction, advanced redaction, syntax, manifest, permission, and secret checks. |
| `npm run build` | NOT RUN: existing `dist/chrome`, `dist/firefox`, and ZIP artifacts were present. The build script recursively deletes/replaces these targets. |
| `python tests\run_tests.py` | NOT RUN: `python` is not on PATH in this shell. |
| `& 'C:\Users\Soumil Sawant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tests\run_tests.py` | PASS: local OCR and SIH checks. |

## Limits

- Automated tests do not establish manual Chrome or Firefox compatibility.
- No detector predictions have been captured for `redaction-v1.json`; there are no accuracy results in this baseline.
- No real sanitized server request evidence or latency/resource benchmark was captured.
- The evaluation set is a starter. Synthetic QR, Code 128, and negative-control SVG fixtures now exist, but no detector predictions have been captured against them.
