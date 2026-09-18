# Vendored skill

This directory is a verbatim copy of [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design)
`skills/diagram-design/` (MIT, see [LICENSE](LICENSE)), vendored into the patent bundle so the
patent assistant can draw figure types the three drawio-native shapes do not cover
(sequence, state machine, deployment, and the rest of the 40 types).

- Vendored at upstream skill version 2.6 (repo cloned 2026-09-16).
- Keep this directory byte-for-byte upstream so `git pull` + copy stays the update path.
- Local deviations from upstream (re-apply after every update):
  - Trailing whitespace stripped on `references/onboarding.md:84` and
    `assets/example-queue-animated.html:298` — upstream ships both lines with
    trailing spaces and the repository whitespace gate rejects them.
- Do not edit SKILL.md or `references/` here; patent-specific rules live in the
  [patent-figure-design](../patent-figure-design/SKILL.md) skill, which routes to this one
  and ships the CNIPA monochrome profile (`patent-figure-design/assets/cnipa-monochrome.md`)
  that overrides the editorial default skin for patent figures.
