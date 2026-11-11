---
name: peaksnature-ui
description: Entry point for any UI or UX work on Peaksnature (review, critique, audit, design, implement, polish, responsive, copy, motion). Use it before impeccable, ui-ux-pro-max, better-ui, emil-design-eng or improve-animations: it picks the one specialist a task needs and overrides the parts of them that conflict with this repo's design system.
argument-hint: "[review|design|implement|polish|motion] [route or file]"
---

# Peaksnature UI router

This skill only routes. The design rules live in CLAUDE.md ("UI/UX design
engineering"), PRODUCT.md, DESIGN.md (normative tokens) and
docs/design-direction.md: §7 motion, §8 surface → Impeccable mode and density,
§9 settled decisions, §10 open decisions. Work items and finding IDs:
docs/ui-improvement-roadmap.md and docs/ui-audit.md.

## Precedence

When instructions disagree, the higher one wins:

1. CLAUDE.md and the user's words in this conversation.
2. design-direction §9 and the roadmap's "Ground rules for every change".
3. DESIGN.md.
4. This skill.
5. A specialist skill. Specialists bring technique, never direction.

So in this repo:

- **impeccable**: "Finish the job" never skips CLAUDE.md's stops (plan first;
  explicit approval before anything that could touch booking, payment, auth,
  the database or tenant isolation). Existing surfaces take the refinement
  route; new pages extend the DESIGN.md world. The redesign route (new visual
  world, replaced DESIGN.md) runs only when the owner asks for a redesign.
- **ui-ux-pro-max**: never load the skill. For a UX guideline lookup, run
  `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux`.
  Take the rule, not the code example (its colours are generic). Skip
  `--stack`: its Next.js advice assumes Server Actions, which this repo does
  not use. Never `--design-system`, `--persist` or `--page`; never take its
  palettes, fonts or styles.
- **better-ui**: its values apply only where DESIGN.md sets none. It hands
  typography, accessibility, layout and colour to `better-*` skills that are
  not installed; use impeccable `typeset`, `audit` and `layout` instead.
- **Open decisions** (§10) belong to the owner. No skill settles them; ask.

## Route

Load one primary skill. Add a second only for a gap you can name.

| Mode | Request | Primary | Add only for |
|---|---|---|---|
| A Review | critique, find UX problems, check responsive | `impeccable critique` (UX) or `impeccable audit` (a11y, perf, responsive). Read-only: no source edits. | a ui-ux-pro-max lookup |
| B Design | a new page, flow or component, before code | `impeccable shape` | none |
| C Implement | build or improve a page | impeccable; `adapt` for responsive, `clarify` for copy, `harden` for loading, empty and error states | better-ui |
| D Polish | spacing, type, "more premium" | `impeccable polish`, `layout`, `typeset` or `quieter` | better-ui |
| E Motion | add or change motion | `impeccable animate` | emil-design-eng, when §7 has no answer |
| E Motion audit | motion across the codebase | improve-animations at `quick` effort unless asked for more | none |

- Before re-auditing a page, read its findings in docs/ui-audit.md and
  `.impeccable/critique/`.
- emil-design-eng and improve-animations answer a bare invocation with a
  greeting and wait: pass the target and the question as args.
- If a request fits two modes, ask one question.
- If a skill named here is missing from the available skills, say so and go on
  without it.

## Not routed

- **frontend-design**: its bold, unexpected direction (new fonts, textures,
  grid-breaking layouts, theme variation) conflicts with DESIGN.md and §9.
  Don't use it in this repo.
- **review-animations**: manual only (`disable-model-invocation: true`), so the
  Skill tool cannot load it. For every motion change, read its SKILL.md and
  STANDARDS.md and apply them to the diff as the final motion check.

## Watch points the specialists don't know

- Copy: guest and host strings change in both `messages/en.json` and
  `messages/th.json`; `/admin` stays English-only; บ้านพัก / House, never
  ห้องพัก / Room; Thai counts use หลัง.
- Visual checks, including Impeccable's "look at the rendered result": use the
  CDP method in CLAUDE.md. Never submit checkout step 2: it writes holds and a
  draft.

## Finish

Run the roadmap's "Verification for every PR" list. Report per CLAUDE.md §6,
plus the mode chosen and the skills actually loaded.
