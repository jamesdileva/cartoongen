# Plan — Restore the Dressed Character Vision

## Goal

Get back to the original vision: **randomized 3D characters wearing clothes**.
The engine is complete (141 tests passing). Two concrete problems stand in the way:

1. The app opens the wrong project (stale `projectRoot` in `app-state.json` after user moved project folders), so clothes don't appear in the slot panel
2. Outfits clip through the body because they were sculpted for Quaternius' *Regular* physique, but the registered base bodies are the *Superhero* variant (same 65-bone skeleton, different shape)

User decisions: **Option A** (source matching Regular Male/Female bodies), **keep baked outfit textures** (palette won't tint them — accepted).

## Phase 1 — Workspace repair

1. `electron/main.ts` + `electron/services/WorkspaceService.ts`: verify startup logic re-prompts for a project folder when the saved `projectRoot` no longer exists on disk (audit found it apparently loaded a stale/wrong project instead of prompting).
2. Remove leftover `[BoneDebug]` console.log lines in `src/renderer/three/CharacterManager.ts` (~lines 601-603).
3. Point workspace at `imported-project/` (via dialog pick on first run or by fixing `app-state.json`).

## Phase 2 — Source matching base bodies

1. Download Quaternius **Regular Male / Regular Female** rigged GLTFs (CC0) — these are the bodies the Modular Character Outfits pack was built around (outfit textures are literally named `T_Regular_Male/Female_*`).
2. Convert to self-contained GLB: `npx @gltf-transform/cli optimize input.gltf output.glb`.
3. **Gate**: verify bone names match the existing 65-joint skeleton (`root…ball_leaf_r`). If Quaternius renamed bones between packs, extend the aliases map in `reference-skeleton.json` rather than changing code.
4. Register both as `base_body` assets in `imported-project/assets/index.json` (extend `scripts/import-all-assets.mjs` or add a small script).

## Phase 3 — Visual verification

1. Launch app against `imported-project/`; confirm clothes appear in Shirt/Pants/Shoes/Gloves/Helmet/Cape tabs with textures.
2. Equip each outfit on the matching Regular body; screenshot; grade fit (no skin poke-through = pass).
3. Thumbnails: `imported-project/assets/thumbnails/` is empty ("no preview" cards). Generate via the app's import flow, or accept missing thumbnails as cosmetic.

## Phase 4 — Randomize end-to-end

1. Ctrl+R → randomized character should include clothing from populated slots.
2. Rules check: ranger hood equipped → hair hidden (`helmet-hides-hair` rule).
3. Export dressed character to GLB; verify file written with sidecar DNA.
4. Regression: `npm run test` — 141 tests still passing.

## Phase 5 — Future idea (document only, do not implement)

Record in `future.md`: user-generated outfit textures/clothing sourced from fashion references for more customization. Note licensing care when pulling textures from websites; baked-texture path means new outfits only need BaseColor/Normal/ORM maps on the same skeleton.

## Success criteria

- Clothes visible and fitted on Regular bodies (no clipping)
- Randomize produces dressed characters deterministically
- Hood hides hair via rules engine
- Export produces valid GLB of a dressed character
- All 141 tests pass, typecheck/lint clean

## Risks

| Risk | Mitigation |
|---|---|
| Regular-body GLTFs have different bone naming | Aliases map already handles 30+ conventions; extend if needed |
| Quaternius pack download unavailable | Fallback: Option B (accept minor clipping on Superhero) |
| Thumbnail generation needs running app | Cosmetic; defer |
| Old repo-root `project.json`/assets clutter | Leave untouched unless user wants cleanup |
