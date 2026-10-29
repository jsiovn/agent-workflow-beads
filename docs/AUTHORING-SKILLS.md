# Authoring & Editing Skills

A checklist for adding or changing a skill in this template repo before it ships
downstream. A skill bug here has wide blast radius — it lands in every downstream
repo on its next `agent-workflow-beads update`. Treat each change as a release, not an edit.

Read `docs/SKILLS_RELATIONSHIPS.md` first so the change slots into an existing
seam instead of creating a parallel one.

---

## 1. Before you write

- [ ] **Confirm the gap is real.** Search existing skills — is this a new skill,
      or an edit to one that already owns this seam? Prefer editing.
- [ ] **Pick the mode.** Planner or executor (see `SKILLS_RELATIONSHIPS.md` §1).
      A skill belongs to exactly one. If it would touch both, it's two skills.
- [ ] **Decide the surface.** Shared (`skills/<name>/`, copied to `.claude/skills/`
      on every run — OpenCode reads skills from there too), or stage-1 /
      bootstrap-only (`templates/skills/<name>/`,
      copied once and preserved — used today for `build-and-test` and the
      opt-in `attach-web-screenshots`)?
- [ ] **Pick the type.** Technique (concrete steps), Pattern (way of thinking),
      or Reference (lookup). Don't blend — a Technique with no steps is a Pattern
      mislabeled.

## 2. Writing the SKILL.md

- [ ] **Frontmatter `description` is a trigger, not a summary.** State *when* to
      use it, not what it is — that text is all the model sees when deciding to
      load the skill. Lead with the trigger condition.
- [ ] **`<HARD-GATE>` if the skill must not cross the mode boundary.** Planner
      skills must not write code or claim beads; executor skills must not
      re-plan. Copy the gate wording from an existing same-mode skill.
- [ ] **Keep scope narrow by default.** Extended audits / multi-step analysis
      belong behind an explicit opt-in, not in the default path.
- [ ] **State the verification step.** If the skill produces work, it must say
      how completion is proven — defer to `verification-before-completion`
      rather than restating it.

## 3. Pressure-test with a subagent

Invoke the **`pressure-test-skill`** skill (template-repo-only, in
`.claude/skills/`) — it runs this step. The summary:

The point of failure for a skill is not "is it correct" but "does the agent
still follow it under pressure." Before committing, dispatch a fresh
general-purpose subagent (via the Agent tool) with the skill loaded and a
realistic scenario that pushes against it:

- [ ] Build a scenario with at least two **competing pressures** — time, sunk
      cost, a plausible shortcut, an authority telling the agent to skip a step.
- [ ] Give the subagent the skill and the scenario; force an explicit choice.
- [ ] **Pass:** the subagent follows the skill *and* names the pressure it
      resisted. **Fail:** it rationalizes a shortcut, or follows the skill only
      because nothing tempted it otherwise.
- [ ] On fail, the fix is almost always sharper wording — a `<HARD-GATE>`, an
      "Iron Law", or a named anti-pattern — not more explanation. Re-test.

A skill that has never been tested against a subagent under pressure is a draft.

## 4. Propagation check

- [ ] **Auto-pickup.** A new shared skill under `skills/<name>/` is picked up
      automatically — `lib/scaffold.js` copies every `skills/` dir into
      `.claude/skills/`. No copy line to add.
- [ ] **Renames/removals.** Removing or renaming a skill? Add the old name to the
      `LEGACY_SKILLS` list in `lib/scaffold.js` so existing downstreams get the
      stale copy pruned on their next `agent-workflow-beads update`.
- [ ] **Snippet markers intact.** If the change touches `AGENTS.snippet.md` or
      `CLAUDE.snippet.md`, the `BEGIN/END TEMPLATE BD WORKFLOW` markers must
      survive untouched.
- [ ] **Update the map.** Add or revise the skill's entry in
      `docs/SKILLS_RELATIONSHIPS.md`.

## 5. Verify the round-trip

A change isn't done until it survives the full propagation cycle:

- [ ] `agent-workflow-beads update` against a scratch downstream repo (use `npm link`
      from the template checkout to run your in-progress CLI changes).
- [ ] Inspect what landed in `.claude/skills/` (and `.opencode/agents/` when
      testing with `--with-opencode`).
- [ ] Confirm the refreshed files appear as ordinary tracked files in
      `git status` (committed, not gitignored).
- [ ] If you removed a skill, confirm its old path is *gone* downstream.

Only then commit.
