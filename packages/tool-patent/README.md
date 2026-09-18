---
description: "Two deterministic patent tools: five-party alignment readiness scoring for a disclosure brief, and CNIPA format linting for drafted claims."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-patent

English | [中文](README.zh.md)

## Summary

Two model-facing deterministic patent tools. `patent_brief_coverage` scores a disclosure brief against the five-party alignment (五方对齐) readiness criteria so the Init dialogue has a deterministic stop signal; `patent_claims_lint` lints a drafted application's claims (and optional abstract) against the CNIPA format minimums. Choose them inside the patent profile; both are pure functions of their arguments and carry no configuration.

## Table of Contents

- [What it does](#what-it-does)
- [Scoring semantics](#scoring-semantics)
- [Claims lint semantics](#claims-lint-semantics)
- [Rendering](#rendering)
- [Export shape](#export-shape)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## What it does

Registers two tools on `ctx.tools`. For `patent_brief_coverage` the model sends the draft content collected so far per dimension — `field`, `background`, `problem`, `solution`, `effect`, plus the edge dimensions `name`, `drawings`, `key_points` (omitted keys mean uncollected) — and receives the collected/missing split, the three-way alignment verdict, and the readiness signal. For `patent_claims_lint` the model sends the drafted claims text (and the optional abstract) and receives the claim count split and the rule violations. Both tools are pure functions of their arguments; calls and results ride the loop's `tool/call` and `tool/result` session events, and nothing else is appended.

## Scoring semantics

The scorer is a port of TianGong's `brief_dimensions.py` (the Init readiness authority of the reference implementation):

- **Core dimensions** — `field`, `background`, `problem`, `solution`, `effect`. A brief is ready only when every one has non-blank content.
- **Alignment check** — the point counts of `background`, `problem`, and `effect` (estimated by splitting on enumeration markers such as ①②/`1.`/`(1)`/`一、`, and on semicolons and newlines, taking the larger count) must stay within tolerance 1 of each other. The verdict passes vacuously while any of the three is uncollected: a missing dimension is "not yet collected", not "misaligned".
- **Edge dimensions** — `name`, `drawings`, `key_points` are accepted and displayed but never gate readiness; they are typically completed during drafting.

The tolerance and the heuristic count are ported asset semantics (init-stage information is coarse), not deployment tunables, so there is no configuration.

## Claims lint semantics

`patent_claims_lint` parses the numbered claims ("1." through "N.", claims may span lines) and checks statutory-format minimums, not substantive examination:

- **C1** numbering: claims must run consecutively from 1; citations of nonexistent claims are the same rule.
- **C2** dependent claims cite only earlier claims (a self or forward reference is an error).
- **C3** citation form: citing several claims requires the 择一 reference form "根据权利要求N至M中任一项所述的".
- **C4** a multiple-dependent claim must not take another multiple-dependent claim as its base.
- **C5** (warning) an independent claim without "其特征在于" lacks the two-part form expected of improvement-type inventions.
- **A1** the abstract must not exceed 300 non-whitespace characters; the rule runs only when the abstract is supplied.

The parsed claims are deliberately excluded from the model-visible result: the model just supplied the text, so echoing every claim back spends tokens for nothing.

## Rendering

The canonical result is `{ covered, missing, ready, coreFilled: { done, total }, aligned, alignmentCounts }`; its Native renderer returns one text block naming the missing dimensions with their Chinese chapter titles, the alignment counts with the tolerance verdict, and the ready/not-ready verdict with the next action.

## Export shape

A function plugin: it exports `name` / `inject` / `apply` and NO default. A stray `export default` would collapse the module via the Loader's `unwrapExports` and drop `inject` (see [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).

## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`patent_brief_coverage` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-patent).

#### Token effect

Fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged.

### Tool-call history and result

#### What the model sees

Each call carries the draft dimension contents as arguments. Success returns one text block of fixed shape (coverage progress, named gaps, alignment verdict, next action). No stable failure modes: blank arguments are a valid "nothing collected yet" input, and every schema violation is rejected by the registry with the standard `INVALID_ARGS` result.

#### Token effect

Scales with the draft text the model submits per call; results are small and fixed-shape.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix.

## Known Limitations and Deferred Work

- **The tool scores what it is given** — the model supplies the dimension contents from its context; it could submit a trimmed brief and receive a misleading `ready`. The `patent-init` skill procedure constrains this, and the review engine re-checks the written files.
- **No path-based input** — the tool takes text, not a `brief.md` path; reading the file first through the `fs` tools is the model's job, keeping this package free of filesystem policy.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The scorer is a port of TianGong's `brief_dimensions.py`; the tolerance and the heuristic enumeration count are ported asset semantics, not deployment tunables. The lint rules track CNIPA statutory format minimums (C1-C5, A1), not substantive examination.

</details>
