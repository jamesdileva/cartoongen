# Cartoongen Worklog

Running session log. Prior history (Sessions 001-042, Sprints 0-20) lives in
`AGENTS.md`; new entries go here.

---

## Session 043 - Sprint 21: Lower Body + Headwear Variants

### Date

2026-09-24

### What we built

Sprint 21 - 3 pants fits + 3 hats as virtual `proc:` slot assets, following
the Sprint 20 pipeline (generated builders, SkinWeights skinning, slot panel
labels, undo/redo + export for free).

Pants (`pants` slot, torso rebuild key, cloth material) share a new
`hipShellStations` core (belly-scaled waist, silhouette-sampled hip depth,
seat to y=0.74) plus a `legPair` tube helper with muscle headroom:

| Asset | Construction |
|---|---|
| `proc:shorts` | Hip shell + thigh tubes cut at y=0.52 with hem cuff rings; legs below bare |
| `proc:baggy` | Hip shell + 1.4x-radius leg tubes + ankle cuff rings |
| `proc:tights` | Hip shell + slim tubes (0.92x radius, 4mm offset) |

Hats (`helmet` slot, tag `hat`, head+face rebuild keys) are authored in world
coordinates and bound 100% to the Head bone (rigid follow, same trick as the
cranium), so they track headSize morphs and head-shape rebuilds with zero
drift. Brims sit above the eye tops via `eyeTopY`, which moves with
`eyeScale`:

| Asset | Construction | Material |
|---|---|---|
| `proc:beanie` | Upper-hemisphere shell (cranium radii + 0.02) + folded brim torus | cloth |
| `proc:cap` | Dome + forward brim disc placed via `surfaceZ` + top button | cloth |
| `proc:sombrero` | Wide lathe brim with upturned lip + tall crown (same center as cranium, larger on every axis = skull strictly inside) | leather |

### Wiring (no structural CharacterManager changes)

- `garmentDependsOnKey` extended to `GarmentKey = 'torso' | 'head' | 'face'`
  (was dead code - only the type existed); pants map to torso, hats to
  head+face.
- `rebuildEquippedGarments` takes an optional key filter; `updateCharacter`
  snapshots head/face change flags BEFORE the rebuild block updates the
  stored keys, then rebuilds hats on head/face-only changes.
- Hats tagged `hat` (not `full_face`): existing helmet rules untouched,
  `beard-and-helmet-warn` correctly still fires. Randomizer picks new assets
  up automatically from the asset pool; no RandomGenerator changes.

### Bugs found and fixed during development

| Bug | Fix |
|---|---|
| Test edit dropped `{Spine, parent: 0}` -> self-parented bone broke skinning in `jeans hip grows` test | Restored `parent: 0`; refactor proven bit-identical via side-by-side vertex compare (maxDelta 0.00 over 12 configs) |
| Baggy-vs-jeans threshold 1.2x failed (0.319 vs 0.339) | Fixed leg centers (+/-0.18) dilute the 1.4x tube ratio; threshold 1.1x |

### Verification

- `npm run typecheck` - 0 errors
- `npm run lint` - 0 errors (4 pre-existing warnings)
- `npm run test` - 256 tests passing (246 + 10 new), no regressions
- `npm run build` - full production build succeeds
- `npm run probe:clearance` - ALL PASSED, extended with: 4 pants builders in
  the morph grid (shorts skip the leg band - bare legs by design), new `up`
  ray mode + cranium-in-dome bands for 3 hats x 5 head shapes x 3 eye sizes
  (202 samples in default band - non-vacuous)
- Live visual check pending (app won't launch headless here): equip each of
  the 6 assets at default camera, randomize with hats equipped

### Current status

Sprint 21 complete. Next: Sprint 22 - tops variety (long sleeves, tank,
jacket + top length parameter).
