# brand-guidelines.md — AI Agent Security Proxy (Lepton Hackathon)

Visual/UX rules for all agents generating UI. Read alongside `GEMINI.md`.

## Design references (specific elements to borrow, not vibes)

| Source | What to take | What to leave |
|---|---|---|
| Lepton hackathon page | Dark bg + monospace data-label treatment (FORMAT/DATES-style bracket cells), serif display wordmark pairing with mono UI text | The exact gold hue — shift it (see palette) |
| Bilan "Watchmaking 2016" | Whitespace discipline, single large serif headline, thin minimal CTA, restrained one-idea-per-view pacing | The cream/blush/pink palette |
| WQF exponential-tech page | Ambient dot-particle background drift, scroll-triggered sequential reveal of the next feature/word | — |
| WQF partners page | Bracket-cornered button treatment (`⌐ LABEL ⌐`), uppercase mono nav labels, wave-mesh particle option for hero variants | — |

**Two distinct surfaces, one brand:**
- **Landing/marketing page** (sells the narrative to judges): heavier motion, particle ambiance, scroll-linked storytelling.
- **Live dashboard** (real scanned-link feed, real data): same visual language, restrained motion — fast load and legibility over flourish.

## Color

**Base (dark theme, both surfaces):**
- Background: near-black, `#0A0A0B` to `#111113`
- Surface/card: slightly lifted, `#17171A`
- Primary text: off-white `#F2F0EB`
- Secondary/muted text: warm gray `#8C8A85`

**Brand accent — deliberately shifted off pure gold:**
- Brand amber/orange: `#D97B3F` (burnt-orange, warmer/more saturated than Lepton's pale gold) — logo, primary CTA, active nav state, hero accents only.
- Do not use this color for risk-status indicators — see below.

**Functional risk-status colors (dashboard only, kept separate from brand accent):**
- Allow: green, `#4ADE80`
- Sanitize: gold/yellow, `#EAB308` (visually distinct from brand orange — more yellow, less orange)
- Quarantine: red, `#F87171`

This separation matters: brand color and risk color must never be confusable at a glance — a judge should instantly tell "this is your logo" from "this just got flagged as a threat."

## Typography

- **Display/headline:** a clean serif (e.g. Playfair Display, or similar editorial serif matching Lepton's wordmark weight contrast) — used sparingly, hero headlines only.
- **UI/data/labels:** monospace (e.g. IBM Plex Mono, JetBrains Mono) — nav labels, metric cells, timestamps, risk scores, fee amounts. This is your dominant typeface across the dashboard.
- **Body copy:** a neutral geometric sans (e.g. Inter, Neue Montreal) — descriptive paragraphs, reasoning text.

## Navigation

Two-dash (☰-style but minimal, two horizontal bars not three) hamburger, top-right or top-center, uppercase mono labels on open. Keep the nav itself invisible/absent until opened — matches the Bilan reference's choice to not compete with the hero.

## Components

- **Buttons:** bracket-cornered treatment (`⌐ Apply to build →⌐`-style corner brackets), mono uppercase label, brand-orange border/text on transparent or near-black fill. Hover: brackets tighten slightly or brighten — a small, deliberate micro-interaction, not a color swap.
- **Metric/data cells:** bordered box with label on top (small, muted, uppercase mono) and value below (larger, off-white) — directly modeled on Lepton's FORMAT/DATES cells. Use for risk_score, fee, action, timestamp in the dashboard feed.
- **Particle background:** ambient dot-field, slow independent drift, dark bg, off-white/faint-orange dots at low opacity. On the landing page, particles can respond subtly to scroll position; on the dashboard, keep static/very slow so it doesn't compete with live data.

## Motion principles (from the psychological-framework brainstorm, applied concretely)

- **First impression (Halo Effect):** the hero's particle animation + headline must render clean and immediately — no layout shift, no visible pop-in. This is the single highest-leverage few seconds of the whole site.
- **Cognitive fluency:** one idea per scroll section on the landing page — pipeline stages (fetch → evaluate → price → pay → clean) revealed one at a time as the user scrolls, matching the WQF scroll-reveal behavior. Never show two unrelated data points competing for attention in the same view.
- **Micro-interactions (Peak-End Rule):** reserve deliberate motion for moments that matter — a new row landing in the live feed, a risk badge resolving from "evaluating..." to its final color, a button's bracket-tighten on hover. Do not animate everything; restraint is what makes the intentional moments read as premium.

## What NOT to import from the video guidelines (already filtered)

SEO structure, client-autonomy/CMS concerns, post-launch support/handover, ongoing maintenance plans, and bespoke custom illustration — not relevant to a single-stakeholder, ~30-hour hackathon build. Skip without guilt.

## Fable/v0 usage note

The hero particle-background + scroll-reveal sequence is the one piece worth spending the v0/Fable credit on — highest complexity, one-shot generation, not iterated on repeatedly. Everything else (dashboard, metric cells, nav) goes through the normal Flash/Sonnet routing in `GEMINI.md`.
