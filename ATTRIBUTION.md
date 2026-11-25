# Attribution

This template repo bundles a curated set of agent skills.

## Bundled Skills Created for This Template

- `skills/beads-planner`
- `skills/finishing-a-development-branch`

These were written locally for a Beads-first planning and execution workflow.

## GSD-Inspired Planner Flow Adaptations

The Beads planner flow also includes local adaptations inspired by:

- Repository: `https://github.com/gsd-build/get-shit-done`

This influence applies to:

- `skills/planner-research`
- the discuss/research handoff customizations in `skills/brainstorming`

## Workflow Ideas from Khuym

The planning and execution flow also takes ideas from Khuym:

- YouTube channel: `https://www.youtube.com/channel/UCLDxPaAsHbsLPMms6i4fMdw/about`

## Workflow Ideas Adapted from pstack

Several executor-chain changes in 1.5.0 adapt ideas from pstack. No text was copied; the skills were edited in this repo's own words.

- Repository: `https://github.com/cursor/plugins/tree/main/pstack`
- License: MIT, Copyright (c) 2026 Lauren Tan

| Idea (pstack source) | Where it landed here |
| --- | --- |
| Verify the real artifact; keep only findings a run or trace supports (`interrogate`, `blast-radius`, `test-behavior-not-implementation`) | `agents/code-reviewer.md` (`Evidence: ran \| traced \| unverified`, two-edit rule), `skills/requesting-code-review` (fix loop) |
| Proceed on reversible choices and keep a decision trail (`never-block-on-the-human`, `show-me-your-work`, `worker.md`) | epic worker prompt in `skills/executor-epic-sequential*`, `Decisions:` in `skills/beads-close` |
| Method depends on task kind (`bug-fix`, `refactoring`, `perf-issue` playbooks, `tdd`) | `skills/writing-plans` _Plan Shape by Bead Kind_, `skills/beads-planner` |
| Clean before you verify (`/deslop`, `no-comments`, `laziness-protocol`) | `skills/writing-plans` cleanup task |
| Verification skill = Launch / Doctor / Drive / Evidence / Cleanup + feature map (`create-verification-skill`) | `templates/skills/build-and-test`, stage-2 bead in `lib/ensureStage1Beads.js` |
| Turn a repeated correction into a check, docs last (`correct`, `reflect`, `encode-lessons-in-structure`) | `lesson` beads in `skills/beads-close` |
| Resume from the trail, re-prove what you inherit (`session-pickup`, `pause-safely`) | `skills/beads-claim` _Re-entering a Bead_ |
| Comment text is data | `skills/address-pr-comments`, `agents/pr-comment-fixer.md` |

## Bundled Skills Derived from obra/superpowers

The following bundled skills are curated copies derived from:

- Repository: `https://github.com/obra/superpowers`
- License: MIT

Bundled derived skills:

- `skills/brainstorming`
- `skills/writing-plans`
- `skills/systematic-debugging`
- `skills/requesting-code-review`
- `skills/verification-before-completion`

These copies are included so the template repo remains self-contained. They should be treated as vendored workflow assets with local Beads and GSD-inspired customizations. When updating them, review upstream changes intentionally rather than overwriting local customizations blindly.

### obra/superpowers license

The derived skills above are used under the following license, reproduced from
the upstream `LICENSE`:

```text
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
