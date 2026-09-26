# Latency and resource benchmark log

No benchmark values are recorded yet. Record raw runs before calculating summaries. Use synthetic fixtures only. A benchmark must identify browser/OS, hardware, page size, image dimensions, warm/cold model state, and repetition count.

Recommended raw CSV columns:

```text
run_id,date,browser,browser_version,os,os_version,cpu,gpu,model,model_state,page_element_count,viewport_width,viewport_height,image_width,image_height,repetition,client_scan_ms,redaction_ms,network_ms,model_ms,total_task_ms,js_heap_bytes,notes
```

Keep individual timings. Report median and p90 only when the sample size and repeated conditions support them. Do not pool different device/browser/model states into one summary. Do not put screenshots, page text, OCR output, user profile values, API keys, or request bodies into benchmark artifacts.

The preferred path is to export one sanitized evidence JSON file per repetition and extract timing-only rows. Repeat `--evidence` in run order; use `--append` for later batches under the exact same conditions:

```powershell
python scripts/evidence_to_benchmark_csv.py `
  --evidence evaluation\provider-evidence\run-01.json `
  --evidence evaluation\provider-evidence\run-02.json `
  --output evaluation\benchmarks\raw-results-YYYY-MM-DD.csv `
  --browser Chrome --browser-version 140.0 `
  --os Windows --os-version 11 --cpu "CPU model" --gpu "GPU model" `
  --model-state warm
```

The extractor reads timings, counts, viewport, and redacted-image dimensions only. It does not copy screenshots, request bodies, page text, OCR output, profile values, or API keys into the CSV. Inspect exported evidence before using it.

Alternatively copy `raw-template.csv` to a dated raw-results filename and fill one row per measured repetition. Then summarize comparable runs:

```powershell
python scripts/summarize_benchmarks.py --input evaluation\benchmarks\raw-results-YYYY-MM-DD.csv --output evaluation\benchmarks\summary.json --minimum-runs 5
```

The summarizer groups different browsers, operating systems, hardware, model states, viewport/image sizes, and page sizes separately. Groups below the minimum repetition count are excluded and reported.
