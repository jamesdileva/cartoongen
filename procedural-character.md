# Procedural Cartoon Character — Sprint Plan (Sprints 13–18)

> Created: Session 025 (2026-08-25)
> Goal: Replace the cylinder-mannequin fallback body with a fully procedural,
> skeleton-skinned cartoon character built from parametric math — PS2/PS3-era
> cartoon quality, zero external model dependencies, $0 content cost.

---

## Why

The Quaternius asset route is blocked on the $19.99 Source pack (outfits are
sculpted for the *Regular* physique; free bodies are *Superhero*). Rather than
wait on paid content, we build the character ourselves out of math:

- **Parametric sweeps** (tapered elliptical tubes along bones) for limbs
- **Lathe surfaces** (profile curves revolved around an axis) for torso/head
- **Smooth skin weights** computed via distance-to-bone-segment falloff so the
  mesh deforms with our existing bone hierarchy — proportion sliders and any
  future animation work on the procedural body for the first time

This is how PS2-era devs actually worked: profile curves + swept surfaces +
hand-computed deformation. Every shape is a parameter table we can iterate on.

## Architecture

New module directory: `src/renderer/three/procedural/`

| Module | Purpose |
|---|---|
| `GeometryKernel.ts` | Reusable parametric primitives. All return `BufferGeometry` plus a parallel array mapping each vertex to its nearest bone segment(s): `SweptGeometry` (tapered elliptical tube along an arbitrary bone segment, with per-station width/height/offset profiles), `LatheGeometryEx` (profile curve revolved around Y with per-ring bone binding), `ellipsoid()`. |
| `SkinWeights.ts` | Pure math, no Three scene objects, fully unit-testable. Given bone segments (start/end points + names) and vertex positions: compute up-to-4 influences via inverse-distance falloff with controllable sharpness. Output feeds directly into `THREE.SkinnedMesh`. |
| `BodyParts.ts` | Part builders: `buildHead(params)`, `buildTorso(params)`, `buildArm(params)`, `buildHand(params)`, `buildLeg(params)`, `buildFoot(params)`. Each takes a params object and returns geometry whose vertices are already annotated with bone bindings from our canonical `SKELETON` hierarchy in CharacterManager. |
| `FaceFeatures.ts` | Eyes (sclera + iris + pupil), brow ridges, nose wedge, mouth — separate meshes parented to head bones, placement/scale/color driven by DNA so they track headSize changes. |
| `ProceduralBodyBuilder.ts` | Orchestrator: takes `BodyShapeParams`, generates all parts, merges into one or few `THREE.SkinnedMesh`(es) using shared MaterialManager materials, exposes a group ready for `scene.add()`. |

### BodyShapeParams (target schema)

```ts
interface BodyShapeParams {
  // Head (watermelon reference: ellipsoid cranium, wider than tall at cheeks,
  // tapering to a soft jaw)
  headLength: number      // cranium depth front-back
  headWidth: number       // cheek width
  headHeight: number      // overall skull height
  jawChin: number         // 0 = round chin, 1 = pointed chin
  // Torso
  shoulderWidth: number
  chestDepth: number
  waistTaper: number      // chest -> waist ratio
  hipWidth: number
  torsoCurve: number      // lathe profile bulge control
  // Limbs
  armThickness: number
  armLengthScale: number
  legThickness: number
  legLengthScale: number
  handSize: number
  footSize: number
}
```

These become part of CharacterDNA in Sprint 18 (schema bump + migration).

### Skin weighting approach

1. Represent each deformable region as ordered bone segments
   (e.g. arm: UpperArm→Forearm→Hand as 3 capsules).
2. For each vertex: distance to each segment (point-to-segment, standard
   vector math).
3. Weight_i = (1 / (d_i^k + epsilon)) for the 4 nearest segments, normalized.
4. Sharpness k (~2–3 default) controls joint crispness; per-region override
   where needed (shoulders softer, knees sharper).
5. Bind matrices come from the bone rest pose — since we generate geometry IN
   rest pose, bind matrix is simply the bone's world inverse, computed once.

### Integration point

`CharacterManager.buildBaseCharacter()` currently hard-parents cylinders to
the scene. It will be replaced by:

```
buildSkeleton(SKELETON)          // unchanged — bones are the source of truth
ProceduralBodyBuilder.generate(defaultParams)
  → SkinnedMesh(es) bound to those bones
scene.add(rootBone); scene.add(bodyGroup)
```

Everything downstream (MaterialManager colors, ProportionManager bone scaling,
rule visibility, export) keeps working because:
- Parts use shared materials by category (skin/hair/eye/mouth)
- Bone scaling propagates through skinning automatically
- Export already serializes SkinnedMesh via GLTFExporter

## Sprint definitions

### Sprint 13 — Geometry Kernel + Head ✅ starting now

**Goal**: The three parametric primitives + weight math, and a "watermelon"
head rendered and skinned.

- [ ] `GeometryKernel.ts`: elliptical tapered sweep, lathe-with-binding,
      ellipsoid
- [ ] `SkinWeights.ts` + unit tests (distance function, falloff, normalization,
      4-influence cap, degenerate cases)
- [ ] `BodyParts.buildHead()`: cranium ellipsoid (scaled sphere), jaw as lathe
      blended into cranium, ear bumps, neck stub — all skinned to Head/Neck
- [ ] Integrate into CharacterManager alongside existing body (head replaces
      the sphere; rest unchanged)

**Reference**: watermelon = ellipsoid roughly 1.15 wide : 1.0 tall : 1.05 deep
with slightly flattened top where it meets the jaw. Jaw starts ~40% down.

**Acceptance**: App launches with procedural head visible; dragging headSize
slider deforms the skinned head smoothly; kernel + weights have unit tests;
typecheck/lint/test/build green.

### Sprint 14 — Face Features

**Goal**: Personality. Eyes/brows/nose/mouth attached to the head surface.

- [ ] `FaceFeatures.ts`: eye group (sclera sphere + iris disc + pupil),
      brow ridge (flattened torus segment), nose wedge (small lathe/prism),
      mouth (torus arc or extruded curve)
- [ ] Placement derived from the same head params used to build the head, so
      features stay on the surface when headSize changes
- [ ] Colors routed through MaterialManager ('eye', 'mouth' categories exist
      already); brows use 'hair'
- [ ] DNA-driven eye scale/spacing parameters

**Acceptance**: Face reads clearly at default camera distance; changing eye
color and headSize behaves correctly; features export in GLB.

### Sprint 15 — Torso + Shoulders + Pelvis

**Goal**: The trunk, first full test of lathe + smooth weights across many
segments.

- [ ] `buildTorso()`: lathe profile neck→chest→waist→hips with control points
      from BodyShapeParams; shoulder deltoid caps; pelvis wedge
- [ ] Spine-segment weighting (Root/Spine/Spine1/Spine2/Neck chain) with soft
      blending at shoulders
- [ ] Remove cylinder-torso legacy path

**Acceptance**: bellySize / shoulderWidth / height morphs visibly deform the
procedural torso; breathing-style spine animation deforms mesh smoothly.

### Sprint 16 — Arms, Hands, Legs, Feet

**Goal**: Complete the silhouette. Feet expected hardest (shoe-last shape).

- [ ] `buildArm()`: upper arm sweep with deltoid blend into torso, elbow bulge,
      forearm taper, wrist
- [ ] `buildHand()`: v1 mitten (palm box-blend + thumb), v2 finger grooves if
      time allows — parameterized so both ship behind a flag
- [ ] `buildLeg()`: thigh/calf sweeps with knee cap, ankle taper
- [ ] `buildFoot()`: shoe-last lathe — heel bulb, arch instep, toe box flatten;
      oriented forward from ankle bone

**Acceptance**: Full body renders standing on grid; limb morphs
(armLength/muscleMass/legLength) work; hands and feet read correctly from
all camera presets.

### Sprint 17 — CharacterManager Integration Cleanup

**Goal**: Make the procedural builder THE base body path.

- [ ] Replace `buildBaseCharacter()` entirely with ProceduralBodyBuilder
- [ ] Delete legacy cylinder/sphere code and `proceduralMeshes` special-casing
- [ ] Verify: undo/redo, rule visibility (helmet-hides-hair etc.), color
      picker propagation, save/load round-trip, GLB export of procedural body
- [ ] Update ExportDialog validation (body/head checks must pass procedurally)

**Acceptance**: Full manual checklist passes with NO GLB assets present —
fresh project, pure procedural character, dressed only by slot placeholders.

### Sprint 18 — DNA-Driven Shapes

**Goal**: Shape becomes data. Randomizer and templates gain real variety.

- [ ] Add `bodyShape?: BodyShapeParams` to CharacterDNA (version bump +
      migration fills defaults)
- [ ] Procedural regeneration on shape change (debounced; geometry rebuild
      target < 50ms)
- [ ] RandomGenerator emits coherent random shapes (correlated params — tall
      characters get longer legs, not random noise soup)
- [ ] Templates get distinct silhouettes: Child (big head ratio), Dwarf
      (wide/torso-short), Elf (slender/tall)
- [ ] Presets may carry shape hints

**Acceptance**: Ctrl+N → Child template produces visibly child-proportioned
procedural character; Ctrl+R produces varied coherent bodies; same seed =
same shape; save/load preserves shape.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Joint pinching from naive weights | Unit-test SkinWeights against known cases; tune sharpness per joint; fall back to rigid bind per-part if a joint fights back |
| Geometry rebuild jank when morphing | Sprints 13–17 only regenerate on discrete changes; Sprint 18 adds debounce + measures rebuild time |
| GLTFExporter + generated SkinnedMesh edge cases | Sprint 17 explicitly tests export before anything else builds on it |
| Feet/hands eat the schedule | Sprint 16 scoped so feet can slip without blocking Sprint 15/17 |
| Scope creep toward "realistic" | Locked aesthetic: cartoon/PS2. Flat shading acceptable; personality > realism |

## Verification cadence

Every sprint ends with: `npm run typecheck && npm run lint && npm run test &&
npm run build`, manual viewport check, commit + AGENTS.md session log update.
