---
version: alpha
name: "Privvy SIH MVP"
description: "An independent institutional test portal and browser-resident privacy lens for measurable agent demonstrations."
colors:
  primary: "#1D4ED8"
  portal-ink: "#102A43"
  portal-canvas: "#F4F6F8"
  portal-surface: "#FFFFFF"
  lens-ink: "#071A18"
  lens-mint: "#42E6B1"
  lens-soft: "#DDFBF1"
  warning: "#9B5D0B"
  danger: "#B42332"
  border: "#CBD5E1"
typography:
  sans:
    fontFamily: "Aptos, Segoe UI, Arial, sans-serif"
  mono:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
rounded:
  DEFAULT: "4px"
  sm: "3px"
  lg: "6px"
spacing:
  control-height: "44px"
  page-gutter: "24px"
  section-gap: "32px"
components:
  portal-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.portal-surface}"
    rounded: "{rounded.DEFAULT}"
  lens-button:
    backgroundColor: "{colors.lens-mint}"
    textColor: "{colors.lens-ink}"
    rounded: "{rounded.DEFAULT}"
  field:
    backgroundColor: "{colors.portal-surface}"
    textColor: "{colors.portal-ink}"
    rounded: "{rounded.sm}"
  status-safe:
    backgroundColor: "{colors.lens-soft}"
    textColor: "{colors.lens-ink}"
  page-canvas:
    backgroundColor: "{colors.portal-canvas}"
    textColor: "{colors.portal-ink}"
  alert-warning:
    backgroundColor: "#FFF6E5"
    textColor: "{colors.warning}"
  alert-danger:
    backgroundColor: "#FFF1F3"
    textColor: "{colors.danger}"
  divider:
    backgroundColor: "{colors.border}"
---

## Overview

The SIH MVP has two visibly and technically separate surfaces. The test website resembles a credible public-service case dossier. The extension resembles a compact instrument panel placed over the browser: it reports what was seen, what was masked, what crossed the network boundary, and what action was approved.

The signature element is the extension's redaction ledger: each detected category is paired with a typed token and a real bounding-box mask in the screenshot preview. The rest of the interface stays restrained so judges can follow the end-to-end evidence.

## Colors

The standalone portal uses a navy service bar, paper-white work surfaces, blue actions, and muted blue-grey case metadata. The extension keeps its existing deep green-black and mint identity to create a clear software boundary. Amber means a value or instruction needs review; red is limited to blocks and failures.

Runtime CSS variables in each surface are canonical. This file documents their intended semantic mapping; the website and extension intentionally do not share a stylesheet or build dependency.

## Typography

The portal uses an offline-safe Aptos/Segoe UI/Arial stack for a familiar operational character. The extension uses system sans for controls and mono for tokens, hashes, timings, and payload evidence. Essential instructions never use tiny metadata sizing.

## Layout

The portal is a responsive case dossier: a navy service header and four-part case strip lead into a source-record rail beside a conventional destination form. A single navy dossier edge is its visual signature. It avoids a marketing hero, decorative metric cards, and Privvy status UI. Privvy uses the same instrument-panel surface in Chrome's persistent side panel and Firefox's restorable popup, with stable status, action, preview, and evidence regions.

## Elevation & Depth

Surfaces are border-led and flat. The website dossier may use one nearly imperceptible shadow; the extension status card may retain its low-contrast shadow. Redaction masks use solid pixels, never blur or translucent privacy theatre.

## Shapes

Website controls use 3–4px corners and its dossier is square-edged. Extension controls retain their existing 6–10px geometry. Status chips are compact rounded rectangles, not decorative pills.

## Components

Native select and date controls are an explicit Chrome/Firefox hackathon choice because operating-system popup geometry is acceptable. All forms use real labels, `novalidate`, inline validation, visible focus, stable busy states, and natural document scrolling. Confirmation is owned by the extension popup rather than a browser dialog.

## Do's and Don'ts

- Do keep the website functional when the extension is absent.
- Do label heuristic, WebGPU, Ollama, and cloud-model modes honestly.
- Do sanitize values already typed or prefilled on the page.
- Do show exact timings and payload size instead of invented scores.
- Don't claim perfect PII detection, Firefox WebGPU parity, or a trained face model.
- Don't transmit raw screenshots, DOM text, profile values, or placeholder mappings.
- Don't use `alert`, `confirm`, or `prompt` for product interactions.
