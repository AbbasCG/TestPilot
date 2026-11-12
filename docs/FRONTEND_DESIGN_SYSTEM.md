# TestPilot interface

Arabic RTL quality workspace, desktop first with a compact mobile navigation.

Palette: ink #19334A; canvas #F3F6FA; surface #FFFFFF; action blue #235CC7; passed teal #147D70; failure red #BC3545. Dark mode uses #101E2C canvas and #192B3D surfaces with light text and brighter accessible action colors.

Typography: locally bundled Noto Sans Arabic variable for labels, prose, and headings; system monospace only for technical identifiers. Body 14–16px, section titles 22px, page titles 30px. Right alignment with explicit LTR email and URL inputs.

Layout: fixed right navigation → restrained topbar → page title and contextual action → working area. Project lists use tables with meaningful membership/status fields. Forms have explicit labels, errors and visible focus rings. Empty states invite creation; statistics come from API records only.

Distinctive emphasis: test execution reads as an ordered work ledger; participants and results remain visibly separate. Avoid decorative metrics, chart placeholders and nonfunctional controls. Respect reduced motion. Persistence conflicts must prompt refresh rather than overwrite.

Plan review: a generic dashboard card grid would conceal the primary work. Use a project ledger and contextual details instead; reserve cards for actual summary counts.

## Typography (2026-11-12)

- Families: Thmanyah Sans for all interface text (300 light, 400 regular, 500 medium, 700 bold, 900 black); Thmanyah Serif Display (700, 900) only for page titles (`h1`) and the printable report title. One expressive face, used in one place.
- Tokens (Tailwind 4 `@theme` in index.css): `--font-sans`, `--font-display`, `--font-mono` (technical identifiers only: issue numbers, hashes). Every element inherits `--font-sans`; buttons, inputs, selects, textareas use `font: inherit`.
- Fallback: Noto Sans Arabic Variable (bundled, OFL) → system UI. Faces load with `font-display: swap` from hashed bundled files; licensed files stay out of Git (see DEVELOPMENT_SETUP.md).
- Scale: body 15px / line-height 1.75; page title 30px / 1.45 serif display 700; section 19px, card titles 16px, labels 13px medium, meta 11–12px. Weights in CSS map to available faces only (no 600/650/750/800).
- Controls: buttons min-height 40px, inputs 42px, textareas 88px. Table headers medium 500. Numbers in stats use tabular figures.
- Verified in light/dark at 1440 and 390 px on dashboard, project, scenario builder, issues and analytics (e2e/typography.spec.ts).
