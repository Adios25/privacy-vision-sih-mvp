# Privvy SIH MVP — UX and privacy contract

## Artifact boundaries

- `test-website/` is a standalone synthetic portal. It contains no browser-extension API calls and does not receive extension state.
- `extension/` is an independently installable WebExtension. It learns the current page only after the user opens it and chooses **Scan current page**.
- `server/` accepts sanitized context only. It never needs the extension's placeholder mapping or local profile.

## Canonical behavior

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native HTML select | DESIGN.md and this contract | Native Chrome/Firefox | Keyboard and open-popup browser check |
| Date | Native HTML date input | This contract | Native Chrome/Firefox | Keyboard, locale, and value test |
| Form | Native labelled controls plus application handlers | This contract | Website application and extension settings | Validation and end-to-end tests |
| Scrollbar | Each artifact's root stylesheet | DESIGN.md | Website and popup palettes | Computed-style and narrow viewport check |

| Operation | Trigger | Pending | Success | Failure and recovery |
|---|---|---|---|---|
| Change scenario | Website scenario select | Immediate local render | URL and form update | Invalid IDs fall back to the internship case |
| Scan | Extension scan button | Button stays fixed and reports scanning | Redacted preview, category ledger, leak check, metrics | No context is sent; user gets a specific retry instruction |
| Local plan | Successful scan | Immediate and offline | Deterministic `TYPE_PLACEHOLDER`/`ABORT` plan plus an explicit high-risk synthetic `CLICK` when present | A leaking payload blocks all assistance |
| Ask server | Optional extension planner button | Local baseline remains visible while the request runs | Validated structured VLM/server plan appears in a separate server card | Invalid/leaking payload is blocked locally; server/model errors leave the local plan usable |
| Execute safe actions | Source-specific local or server execute button | Targets are revalidated and the other plan becomes a non-executable comparison | Empty supported fields fill; typed/prefilled values remain untouched | Stale page or target mismatch blocks all remaining actions and requests rescan |
| Submit | Extension confirmation panel | Confirm button is disabled while executing | Website renders a synthetic receipt | Confirmation is never inferred; invalid target remains blocked |
| Restore Privvy session | Reopen the Chrome side panel or Firefox popup on the same tab | Sanitized session is read from extension storage | Scan, plan, receipt, and confirmation state return | A different or changed tab requires a new scan |
| Open Privvy in Chrome | Click Privvy's toolbar icon | Chrome grants temporary active-tab access and Privvy takes a memory-only capture | Persistent side panel opens | Opening from Chrome's generic side-panel picker asks the user to click Privvy's icon |

## Privacy invariants

- Input and textarea values are inspected locally whether they came from HTML, autofill, website JavaScript, or user typing.
- Any non-empty sensitive value becomes a typed placeholder in the UI graph and its entire visible control box is masked in the screenshot.
- Pattern-like PII typed into a generically labelled field is still detected.
- Raw page text, screenshot pixels, profile values, and placeholder mappings stay in the extension.
- Session restoration stores only the sanitized graph, redacted image, scan identifiers, plan, and action receipts. Raw detected terms, unredacted captures, and the local profile are excluded.
- The toolbar-click capture is held only in service-worker memory, consumed once by the matching tab, and expires after 60 seconds.
- The deterministic local planner receives the sanitized graph only; it never receives the local profile or placeholder mapping.
- The server receives only the redacted screenshot, sanitized graph, category counts, metrics, state hash, and task.
- A known-term leak-check failure disables all network planning.

## Risk and confirmation

- `TYPE_PLACEHOLDER` may execute only against an empty, visible, enabled, supported control with a matching purpose.
- `SCROLL` may execute within the current tab.
- `CLICK` on ordinary controls requires target validation.
- The synthetic completion button is included in the sanitized graph even when below the viewport. A scanned click target remains valid when it is still rendered and enabled but shifts outside the viewport; Privvy scrolls it into view before activation. Removed, hidden, replaced, or disabled targets remain blocked.
- Submit, consent, upload, payment, deletion, and account-change targets are high risk. Both plan cards display the synthetic submit click as `confirmation_required`; Privvy moves focus to an extension-owned approve/decline choice before it may execute.
- The website's safe-test marker is capability metadata, not trust by itself; the extension also checks the configured local test origin.

## Form ownership

- The website uses native select and date controls; platform popup behavior is accepted for current Chrome and Firefox.
- The website form uses `novalidate`, text errors, preserved values, and first-invalid-field focus.
- The website's prefill-preservation slate plants zero to three user-entered values before scanning to demonstrate both payload sanitization and execution-time preservation.
- The extension popup has no destructive browser dialogs. Status and errors are inline live regions.

## Accessibility and layout

- Target WCAG 2.2 AA for labels, keyboard order, focus, contrast, reduced motion, and responsive reflow.
- Website and extension panel each own one natural vertical scroller. Chrome uses its persistent side panel; Firefox uses its popup with sanitized session restoration.
- Button geometry remains stable during busy states.
