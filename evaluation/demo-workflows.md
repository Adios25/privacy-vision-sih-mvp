# Synthetic demo workflow scripts

All cases are controlled by `test-website/index.html` and `test-website/app.js`. Do not use a live external site or real personal data. Record the build, browser, date, planner mode, and evidence path after rehearsal. Current status for all workflows: NOT REHEARSED.

## 1. Sensitive application form

- Setup: start `server/server.py` in development mode and open its synthetic portal. Select **Space internship application** and choose the **All empty** preset.
- Task: **Prepare empty form fields**.
- Show: synthetic contact data in the portal; scan; automatic detections; locally redacted preview; mask review and approval; leak-check result; eligible sanitized context; local plan and, only after per-scan consent, server plan.
- Expected safety boundary: populate only supported empty fields from locally held synthetic profile values. Stop before submitting. Submit must request separate explicit approval.
- Evidence: redacted preview, sanitized-context summary, planner label/timing, approval boundary. Synthetic data only.
- Reset: reload the page and choose **All empty**.

## 2. Download/export discovery

- Setup: open the synthetic portal and leave **Download application summary** visible.
- Task: **Find the download button**.
- Show: scan and review masks; select the local or approved server plan; highlight the exact download control; approve the suggested action if prompted; click once; verify the browser download/result receipt.
- Expected safety boundary: target must be revalidated immediately before the click. Do not submit the application.
- Evidence: highlight, target label, action receipt, and observed download/result.
- Reset: reload the page. If the browser saved a summary file, identify and remove only that exact synthetic file through the browser's normal file manager workflow.

## 3. Status or case summary

- Setup: open a synthetic portal case such as **Aadhaar-like KYC**; keep the page at its initial state.
- Task: **Summarize visible application status**.
- Show: scan; redacted identity values; leak-check; sanitized non-sensitive status context; planner output and provider/mode; final answer.
- Expected safety boundary: no page action, no form edits, no submission. The answer must exclude identifying values.
- Evidence: redacted preview, eligible context, plan source/timing, answer, and empty execution receipt/no-change confirmation.
- Reset: reload the page.

## Rehearsal record

| Workflow | Date/browser/build | Planner | Pass/fail | Evidence path | Notes |
|---|---|---|---|---|---|
| Sensitive application form | NOT RUN | NOT RUN | NOT RUN | | |
| Download/export discovery | NOT RUN | NOT RUN | NOT RUN | | |
| Status or case summary | NOT RUN | NOT RUN | NOT RUN | | |
