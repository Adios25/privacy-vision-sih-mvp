# Submission claim review

Complete this only after detector results, browser records, provider evidence, workflow rehearsals, and benchmarks exist. A `PASS` requires an evidence path or exact source location. Do not convert a planned behavior into a measured claim.

No slide deck is currently stored in this repository. If one is added, include it in every applicable row below.

## Review record

| Claim surface | Result | Evidence / notes |
|---|---|---|
| README accuracy and detector wording matches recorded results | PASS | evaluation/results/text-rules-v1.json; evaluation/results/visual-v1.json |
| README browser and platform support matches Chrome/Firefox records | PASS | evaluation/manual-browser-verification.md | 
| README planner/provider wording matches the audited real provider run | PASS | evaluation/provider-evidence/audit-report.json |
| README latency/resource wording matches comparable benchmark groups | PASS | evaluation/benchmarks/summary.json |
| Demo script and any external slide deck use only synthetic evidence and measured claims | PASS | evaluation/demo-workflows.md;evaluation/benchmarks/summary.json |   
Allowed wording after the corresponding evidence passes:

> Privvy performs local page and visual analysis, applies reviewed masks to both screenshot and structured context, and requires a passing client leak check plus per-scan consent before sending sanitized context to the configured planner. Returned actions are validated and executed locally under risk controls.

Do not claim perfect anonymization, zero leakage, face detection from COCO `person`, production readiness, or broad accuracy from this small synthetic evaluation set.
