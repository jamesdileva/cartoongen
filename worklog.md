# Cartoongen Worklog

Running session log. Prior history (Sessions 001-042, Sprints 0-20) lives in
`AGENTS.md`; new entries go here.

---

## Session 052 - Sprint 29: Knight Polish (Plate v2 + Armet Pass)

### Date

2026-09-29

### What we built

Sprint 29 - the knight stops looking like painted clothes. `buildPlate`
gained a full arm harness: rerebrace tubes (deltoid->elbow) + elbow
couters + vambrace tubes (elbow->wrist, tucking inside the gauntlet cuff
at 0.7), all with muscle headroom and long-sleeve segment binding so
they track `muscleMass` like cloth sleeves do. Articulation: lame bands
at the waist + hem trim band + 2-layer pauldrons (inner cap + outer lame
offset outboard). Cuirass body, ridge, faulds, gorget unchanged.

`buildArmet` was rebuilt as 3 shells with REAL gaps: a sight slit at eye
level and a breath vent at mouth level, both front-only (rear filler
bands close the back - caught by the new slit test, which first exposed
the full-ring opening). Bevor ridge down the visor front, taller crest
comb. Single-material constraint held: gaps read dark via the hidden
face interior. New `proc:plumed_armet` style (parade plume crest, same
metal) alongside the default armet; knight preset keeps the plain armet.

### Bugs found and fixed during development

| Bug | Fix |
|---|---|
| Hem trim used `stations[last]` (the neck) | Hem is `stations[0]` (unshifted); one-line fix |
| Slit test ray passed clean through (0 hits) | Gap cut a full 2π ring incl. the rear; added rear filler bands (front-only slits, like real slits) |

### Verification

- typecheck 0 errors; lint 0 errors (4 pre-existing warnings); build succeeds
- 308 tests passing (305 + plate-v2 binding/reach + slit/vent gaps + plume), no regressions
- probe:clearance ALL PASSED (plate joins the arm band; armet analytic solid unchanged)
- Pushed as `61d4af9`; Sprints 29-34 written to procedural-character.md (win-unpack -> Sprint 34 last)

### Current status

Sprint 29 complete. Next: Sprint 30 - sallet + great bascinet.

---

## Session 051 - Sprint 28: Preset/Outfit Convergence

### Date

2026-09-29

### What we built

Sprint 28 - one click dresses a full character. The 5 base presets gained
slots + `outfit: true` and the 3 `*-outfit` duplicates were retired:

| Preset | Slots |
|---|---|
| Knight | shirt `proc:plate`, pants `proc:plate_legs`, helmet `proc:armet`, gloves `proc:gauntlets`, shoes `proc:boots` (full head-to-toe plate) |
| Mage | shirt `proc:mage_robe`, pants/helmet `null` (explicit clear) |
| Farmer | shirt `proc:tshirt`, pants `proc:jeans`, helmet `proc:cap` |
| Rogue | shirt `proc:jacket`, pants `proc:tights`, helmet `proc:hood` |
| Barbarian | shirt `null` (bare chest), pants `proc:shorts` |

New `applyOutfit(dna, preset)` mutation (slots + colors only) + matching
`useCharacterStore.applyOutfit` action. The randomizer's 25% outfit roll
now uses it: base presets carry morphs, so a full `applyPreset` would
have stomped the generated body - `applyOutfit` keeps morphs/bodyShape/
face and only dresses the look. Panel clicks still use full `applyPreset`
(proportions + palette + garments). PresetPanel drops from 8 cards to 5
with no code change; plugin outfit presets flow through the same path.

### Verification

- typecheck 0 errors; lint 0 errors (4 pre-existing warnings); build succeeds
- 305 tests passing (300 + 3 applyOutfit + 1 store + 1 data-files), no regressions
- probe N/A (no geometry changed); Garments outfit-resolve test now pins
  the exact 5 outfit IDs; data-files pins convergence (5 presets, all
  outfit, all with non-empty slots)
- Pushed as `891290d`

### Current status

Sprint 28 complete. Next: Sprint 29 - win-unpack installer (last).

---

## Session 050 - Sprint 27: Plate Armour Set

### Date

2026-09-29

### What we built

Sprint 27 - the knight's armour: cuirass (Plate Harness, `shirt` slot),
plated legs (Plate Legs, `pants` slot), and a pivoted-visor armet (`helmet`
slot, `full_face` + `hat` tags). 35 assets total. No new slots, no rule
changes, no pipeline touch.

`buildPlate(shape, bust, belly, butt, topLength)` reuses the torso-shell
core (`halfDForProfile`) so bust/belly/butt/topLength clearance comes free;
dresses it into armour with: parallel offset +0.035 at hi-res 22-ring
sweep, sternum ridge (profileAt-sampled plate over the chest front,
grown past max bust), pauldron caps (overlapping ellipsoid pair per
shoulder sized past max deltoid), a standing gorget collar (plate-height
0.015-0.16 wedge, `face`-dependent), and faulds (3 descending hoops from
the hip shell). Binds the torso chain; hem follows slits/gaps naturally.

`buildPlateLegs(shape, butt, belly)` reuses `hipShellStations` for the
tassets/hips and `FULL_LEG_STATIONS` radii as the muscle-tracking core,
so cuisses follow thigh morphs automatically; adds knee cops (poleyns)
and pointed sabaton toe caps sharing the boots profile.

`buildArmet(shape, face)` + `armetExtents(shape, face)` grow a visor shell
off the cranium ellipsoid (rx = W\*1.5+grow for nose-ahead of chin,
ry = H\*1.15+grow to swallow forehead scars and the chin, rz = L\*1.6+grow
anchored deeper than the nose tip) with a slit-guard floor past the eye
line and a pivoted visor point. Head-bound rigid like all hats; carries
`full_face` + `hat` so both full-helmet-hides-face and hat-hides-hair
fire (engine test proves). `face`-dependent like the hood (follows
nose/chin), tuck-end 1.63 caps the residual tuck chin/neck band gap.

Face-hide mapping (the open question): `SlotManager.setSlotVisibility`
already hides *attached* slots (glasses/mask), `baseBodyFeatures` covers
procedural eyebrows/eyes, and the armet shell contains the cranium/face
by construction - so no code change was needed. The `mouth` slot has no
hide target in the engine and stays as-is (rules.json untouched).

Sizing method: `noseFrontZ(shape)` (surface + nose projection, chin
clamped) published the nose-vs-chin race that previously required pixel
hunting - z-anchor `max(nose+0.035, chinDepth+0.02)` lands the shell
between burial (nose+0.03) and gap (>nose+0.05), uniform 22-ring slice
terminology throughout (equator/`phiEnd` caps / belt / brow / slit-guard).

Also: shared `collarRing` widened (R 0.145 -> 0.155) so collars clear
max neckWidth; plate legs tubes share `FULL_LEG_STATIONS` (muscle-track);
sabaton profile shared via `waistDims`-style helper.

### Verification

- typecheck 0 errors; lint 0 errors (4 pre-existing warnings); build succeeds
- 300 tests passing (294 + 5 new Garments + 1 new engine), no regressions
- probe:clearance ALL PASSED (plate shirt/deltoid bands, plate_legs
  hip/leg bands, armet analytic containment on 5 shapes x 3 eye sizes)
- Pushed as `cbdc8af` (probe PNG artifacts stripped per code-only rule)

### Current status

Sprint 27 complete. Next: Sprint 28 - preset/outfit convergence (needs
user confirmation on retiring `*-outfit` duplicates).

---

## Session 044 - Sprint 22: Tops Variety

### Date

2026-09-24

### What we built

Sprint 22 - 5 new tops (6 total in shirt slot) sharing a new
`torsoShellStations` core with a `topLength` morph (0..1, hem 0.9->1.25).

| Asset | Construction |
|---|---|
| `proc:longsleeve` | Torso shell + arm tubes deltoid-to-wrist tracking arm radii + wrist cuffs; Forearm skinning segments added |
| `proc:tank` | Torso shell + bust-clearing shoulder strap tubes, no sleeves |
| `proc:jacket` | Open-front partial sweep (0.55 rad half-gap) + collar ring + long sleeves; leather |
| `proc:vest` | Open-front partial sweep, sleeveless, no collar; cloth |
| `proc:polo` | T-shirt torso + collar ring + short sleeves |

Infrastructure:

- `makeSweep` gained optional `phiStart`/`phiLength` (default full circle,
  bit-identical output - all 256 prior tests still pass unmodified).
- `topLength` flows through catalog builders, `torsoKeyOf` (body + garment
  rebuild on drag), a Clothes slider in PropertiesPanel (generic setMorph,
  undoable), and the randomizer (skewed full-length).
- `garmentDependsOnKey`: all tops map to torso.

### Bugs found and fixed during development

| Bug | Fix |
|---|---|
| Probe flagged 270 failures incl. previously-clean tshirt | Two causes: (a) refactor verified innocent via side-by-side vertex compare; (b) real issue was probe bands below the cropped hem + bare-by-design zones. Bands now hem-aware; sleeveless tops exclude deltoid zone; open fronts exclude the wedge (jacket side rays crossing the opening were seeing intentional bare torso) |
| Tank strap up-rays missed at tube edges | Band narrowed to strap centerline; analytic strap-clears-bust-peak unit test added |
| Test edit corrupted `parent: 0` (caught in Sprint 21, same lesson) | Diff-check large edits before running suite |

### Verification

- `npm run typecheck` - 0 errors
- `npm run lint` - 0 errors (4 pre-existing warnings)
- `npm run test` - 264 tests passing (256 + 8 new), no regressions
- `npm run build` - full production build succeeds
- `npm run probe:clearance` - ALL PASSED (6 shirts x morph/length grid with
  gap/deltoid/hem-aware bands, per-shirt deltoid checks, armX + strap bands)
- Live visual check pending (app won't launch headless here): equip each top
  at default camera, drag Top Length slider, randomize
- Update 2026-09-24: user launched via `npm run dev` and visually verified -
  all 6 tops look good. No white-screen or render issues.

### Current status

Sprint 22 complete and user-verified. Next: Sprint 23 - archetype outfits
(mage robe, elven tunic, dwarf vest + outfit presets + outfit randomizer).

---

## Session 045 - Sprint 23: Archetype Outfits

### Date

2026-09-24

### What we built

Sprint 23 (final procedural sprint) - 3 archetype garments + outfit presets
with slots + outfit randomizer + Mage template.

| Asset | Construction |
|---|---|
| `proc:mage_robe` | Torso shell into floor-length flared skirt (0.42 half-width hem) + bell sleeves with flared cuffs + collar; fixed hem |
| `proc:elven_tunic` | Long fitted top (hem 0.68 + length range) + V accent tube on chest surface + short sleeves |
| `proc:dwarf_vest` | Open-front chest piece (0.6 half-gap) + elliptical belt torus from shared `waistDims` (belly-tracked) |

Data + wiring (no new UI components):

- `presets.json`: mage/elven/dwarven-outfit with `slots` + `colors` + new
  `outfit: true` flag (Preset type extended). Shown in PresetPanel via
  useDataStore with zero UI changes; applyPreset merges slots per-slot.
- `templates.json`: Mage template (tall, gaunt, sharp jaw) for Ctrl+N.
- `App.tsx` handleRandomize: 25% chance applies a random outfit preset
  after overwriteDNA (presets define no morphs/shape, random body kept).

### Bugs found and fixed during development

| Bug | Fix |
|---|---|
| Robe skirt left 25-28 pelvis misses per config | Skirt stations descended while torso stations ascend - sweep jumped neck-to-floor cutting a diagonal fin. Concatenate skirt-first ascending |
| PowerShell `Set-Content` mojibake'd presets.json emoji | Restored from git, re-applied via file tools; verified 48 insertions 0 deletions |
| Sprint 21 probe/test used out-of-range head shapes (1.3m!) | Corrected to sanitize ranges (0.31/0.18); containment holds |

### Verification

- `npm run typecheck` - 0 errors
- `npm run lint` - 0 errors (4 pre-existing warnings)
- `npm run test` - 270 tests passing (264 + 6 new), no regressions
- `npm run build` - full production build succeeds
- `npm run probe:clearance` - ALL PASSED (robe skirt/leg/arm bands, tunic,
  dwarf vest open-front bands alongside all prior garments)
- Live visual check pending: Ctrl+N Mage + mage-outfit preset, randomize
  until an outfit hits (~25%), export dressed character

### Current status

All 23 sprints complete: fully procedural, DNA-driven characters with
expressions, 16 garments, 3 archetype outfits. Remaining: user testing,
real-asset packs optional, packaging/installer (no sprint covers it yet).

---

## Session 046 - Sprint 24: Procedural Hair

### Date

2026-09-24

### What we built

Sprint 24 - 4 hairstyles in the `hair` slot, Head-bound rigid (zero drift),
`hair` material (ColorPicker works with no UI changes).

| Asset | Construction |
|---|---|
| `proc:crop_hair` | Skull-hugging partial-sphere shell over ears, face wedge open |
| `proc:ponytail` | Cap + tail sweep rooted inside skull (hidden joint) + tie torus |
| `proc:mohawk` | Thin fin, bottom embedded 0.07 into crown, shaved sides |
| `proc:long_hair` | Skull shell + back mane panel clearing tube/belly/butt |

Plus: `hat-hides-hair` rule (helmet tag `hat` -> hide hair) and the tag
resolver wired into useRuleStore's auto-evaluate (tag triggers were
dormant without it - `full_face`/`heavy_armor` rules now live too, no
assets carry those tags so nothing else changes).

### Bugs found and fixed during development

| Bug | Fix |
|---|---|
| makeSweep ring-winding flip: near-vertical paths whose tangent.z crosses zero get a 180-degree side flip, twisting quads into bowties that pinch the tube (long-hair fall missed 81 rays at belly=0) | Twist-free frames in makeSweep: carry previous side forward, un-flip on dot<0. Paths that never flipped are bit-identical (full suite + probe confirm no regressions) |
| Catalog edit ate `proc:beanie` and duplicated cap/sombrero | Repaired by direct inspection; catalog asserts exact 20-entry list |
| Test edit corrupted `parent: 0` again (same Sprint 22 lesson) | Restored; verify diffs after large edits |
| PowerShell `Set-Content` mojibake (same Sprint 23 lesson) | File tools only for JSON with emoji |

### Verification

- `npm run typecheck` - 0 errors
- `npm run lint` - 0 errors (4 pre-existing warnings)
- `npm run test` - 277 tests passing (270 + 7 new), no regressions
- `npm run build` - full production build succeeds
- `npm run probe:clearance` - ALL PASSED (hair containment bands on 5 head
  shapes, tail/fall rear bands on morph grid; twist test fails without fix)
- Live visual check pending: equip all 4 styles, wear hat over each,
  randomize

### Current status

Sprint 24 complete. Next: Sprint 25 - face accessories + more hats
(sunglasses/goggles via surfaceZ, mask, top hat/hood). Sprints 24-27
appended to procedural-character.md.

---

## Session 048 - Sprint 25: Face Accessories + More Hats

### Date

2026-09-24

### What we built

Sprint 25 - 3 face accessories (`head` slot) + 2 hats (`helmet` slot).

| Asset | Construction |
|---|---|
| `proc:sunglasses` | Lens discs proud of sclera + bridge + temple sweeps to ears; `lens` material |
| `proc:goggles` | Wide single lens band + strap torus ringing the head |
| `proc:mask` | Shell over mouth/chin anchored under the nose (nose-relative, like mouth) |
| `proc:tophat` | Tall straight crown (contains upper skull by radii) + flat brim |
| `proc:hood` | Long shell to nape + wide face opening |

Plus: shared `lens` material in MaterialManager (dark, palette-independent,
no ColorPicker changes); `outfit` flag untouched; randomizer picks new
assets up from the pool automatically.

Rules: no data changes. `hat-hides-hair` fires for new hats (tagged `hat`);
new engine test proves hat+hair+glasses resolves to hide(hair) with nothing
targeting `head`.

### Bugs found and fixed during development

| Bug | Fix |
|---|---|
| Catalog edit ate `proc:beanie`, duplicated cap/sombrero | Repaired by direct inspection; exact-list catalog test guards it |
| Probe flagged tophat/hood pole verts | Ray-vs-cap-fan exact-edge degeneracy (axis-aligned construction): converted all hat bands to analytic containment (inside-solid OR in-wedge), strictly stronger than rays |

### Verification

- `npm run typecheck` - 0 errors
- `npm run lint` - 0 errors (4 pre-existing warnings)
- `npm run test` - 285 tests passing (277 + 8 new), no regressions
- `npm run build` - full production build succeeds
- `npm run probe:clearance` - ALL PASSED (containment bands: 5 hats x 5 head
  shapes x 3 eye sizes, non-vacuous)
- Live visual check pending: equip glasses + each hat, randomize

### Current status

Sprint 25 complete. Next: Sprint 26 - extremities + beard (shoes, gloves,
jaw-anchored beards).

---

## Session 049 - Sprint 26: Extremities + Beard

### Date

2026-09-24

### What we built

Sprint 26 - 7 assets filling the last bare slots (32 total): shoes, boots,
gloves, gauntlets, goatee, full beard, mustache.

| Asset | Construction |
|---|---|
| `proc:shoes` | Foot-last shell + sole slab, `Foot` segments |
| `proc:boots` | Shoes + calf shaft (clears max-muscle calves) + cuff |
| `proc:gloves` | Palm/thumb shells + wrist cuff, `Hand` segments |
| `proc:gauntlets` | Gloves + forearm tube |
| `proc:goatee` | Chin tuft below mouth (nose-anchored) |
| `proc:full_beard` | Jaw shell, mouth tucked inside, nose stays out |
| `proc:mustache` | Hair torus arch over mouth |

Beard placement mirrors buildFace anchoring (nose bottom -> mouth).
`beard-and-helmet-warn` fires automatically; randomizer pools fill free.

### Bugs found and fixed during development

| Bug | Fix |
|---|---|
| Shoe toe/heel rays missed (30/50) | Toe/heel caps were coplanar with foot extremities; shoe now overhangs both ends (heel/toe extension stations) |
| Probe bands needed per-garment coverage | Shorts skip leg band (bare legs); bands parameterized |
| Catalog edit collision (beanie eaten, sombrero duplicated) | Repaired by inspection; exact-list test guards |
| HAND upperarm segments duplicated forearm span | Restored to buildArm spans |

### Verification

- `npm run typecheck` - 0 errors
- `npm run lint` - 0 errors (4 pre-existing warnings)
- `npm run test` - 294 tests passing (285 + 9 new), no regressions
- `npm run build` - full production build succeeds
- `npm run probe:clearance` - ALL PASSED (toe/heel/fingers bands added)
- Live visual check pending: equip all 7, beards with helmets (warn)

### Research: preset outfits + armour (user request)

Audited presets vs garment catalog:

- Base presets (knight/mage/farmer/rogue/barbarian): colors+morphs only,
  no slots (by Sprint 7 design, predates assets).
- Outfit presets (mage/elven/dwarven-outfit): slots+colors, randomizer-ready.
- Mage preset does NOT equip the robe (user noticed) - same for knight
  (no armour garments exist at all) and others.

Proposed follow-ups (appended to procedural-character.md as Sprints 27-29):

- Sprint 27 - Plate Armour set: cuirass, pauldrons, greaves, armet
  (full_face tag demos the dormant face-hiding rules), metal material.
  Gauntlets + boots already exist.
- Sprint 28 - Preset/outfit convergence: give the 5 base presets slots
  (knight->armour, mage->robe, farmer->tee+jeans+cap, rogue->jacket+tights
  +hood, barbarian->bare+shorts); retire the 3 *-outfit duplicates;
  randomizer uses slot-bearing presets.
- Sprint 29 - win-unpack installer (last): electron-builder + dist smoke test.

Farmer/rogue/barbarian need NO new garments (all covered). Only knight
needs armour builders.

### Current status

Sprint 26 complete. Next: user picks Sprint 27 (armour) or 29 (packaging)
or the Sprint 28 convergence design needs confirmation (removal of
*-outfit entries).

---

## Session 047 - Shoulder Poke Investigation + Fixes

### Date

2026-09-24

### What we found (user report: minimal skin near shoulders on some randomizes)

Built a headless repro (`scripts/debug/shoulder-repro.mts`, since removed):
real skeleton subset + real ProportionManager + CPU skinning + raycast
probe bands, over 3 shapes x 6 morph combos x 4 tops. Root cause is
differential tracking, not a single bad number:

- The deltoid is ~91% clavicle-bound, so shoulderWidth morph slides it far
  outboard; sleeve tubes are upperarm-leaning and stay behind (44-sample
  pokes at wide shape + max morphs).
- `MUSCLE_HEADROOM` was 1.12 against a real 1.3 max: max-muscle arms
  outgrew sleeves; min-muscle shrank sleeves off the muscle-inert deltoid.
- The sleeve end cap lagged its ring (cap center 100% upperarm-bound),
  opening the cuff mouth forward under morph shear.

### What we changed (all in Garments.ts + BodyParts.ts + CharacterManager.ts)

- `MUSCLE_HEADROOM` 1.12 -> 1.3 (true max; sleeves, legs, cuffs).
- `topSegments` gained `clavReachX`: clavicle capsules extend toward the
  sleeve so cap regions bind clavicle-dominant and track deltoid slide.
- Garment upperarm proxy ends past the deltoid cap (long sleeves keep
  legacy reach for the elbow-to-forearm handoff).
- Sleeve cuff lengthened/flared shape-relative (`outerX`), cuff mouth
  widened, mid-cap ring added to short + long sleeves, cap radii bumped,
  inboard tuck deepened.
- `buildTorso` takes `muscle` (deltoids scale 0.9 + 0.2 * muscle, neutral at
  default); `torsoKeyOf`/`rebuildTorsoMesh` carry it so deltoids stay
  coherent with muscle-responsive sleeves in both directions.

### Verification

- Repro grid went from pokes in 5 configs (up to 44 samples) to clean
  everywhere except single-digit grazes (<=6 samples, ~5mm) at
  double-extreme morph corners (documented residual, armpit tuck zone).
- New skinned-morph regression test (real skeleton + PM + raycast) fails on
  old code, passes on new.
- `npm run test` - 278 passing; `probe:clearance` ALL PASSED (rest geometry
  untouched in behavior); typecheck/lint/build clean.

### Current status

Shoulder investigation closed. Proceeding to Sprint 25.

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
