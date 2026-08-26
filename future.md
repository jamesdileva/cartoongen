# Future Roadmap

This document tracks work beyond the initial 12 sprints. It is organized into phases by priority and dependency.

---

## Completed So Far

All 12 sprints from `direction.md` are complete:

- **Sprint 0**: Project scaffold (Electron + React + Three.js + Vite)
- **Sprint 1**: Project system + Character DNA schema + save/load + undo/redo
- **Sprint 2**: Asset Registry + Slot Definitions + Rules Engine
- **Sprint 3**: Three.js Character Assembler (CharacterManager, AssetManager, SlotManager, ProportionManager, MaterialManager)
- **Sprint 4**: Import pipeline (GLB validation, skeleton check, thumbnail gen, asset indexing)
- **Sprint 5**: React UI layer (LayoutShell, SlotPanel, ColorPicker, MorphSliders, ImportDialog, CharacterList)
- **Sprint 6**: Export pipeline (GLB/GLTF, ExportManager, ExportDialog, export profiles, sidecar DNA)
- **Sprint 7**: Presets + Random Generator (5 themed presets, seeded PRNG, templates, TemplateDialog)
- **Sprint 8**: Polish (lighting presets, favorites, character browser, workspace persistence, toasts, export profile editor, character thumbnails)
- **Sprint 9**: Plugin system (PluginValidator, PluginService, plugin merge, PluginPanel, IPC-based data loading)
- **Sprint 10**: Bone scaling proportions (ProportionManager replaces MorphManager, 8 dimensions)
- **Sprint 11**: Quaternius mesh swap (base body GLB loading, breathing animation, Draco support, Game Ready Score)
- **Sprint 12**: Bug fixes (skin remapping, body switching, import refresh, startup persistence, randomizer body preservation, drag-drop GLB-only)

---

## Current State

### Built features
- 14 slot definitions (body, head, hair, helmet, eyebrows, eyes, mouth, beard, shirt, pants, shoes, gloves, cape, wings)
- 5 export profiles (GLB Standard, Unity, Godot, Mixamo, GLTF Debug)
- 5 lighting presets (Studio, Dramatic, Outdoor, Fantasy, Silhouette)
- 5 templates (Stylized Male, Stylized Female, Child, Dwarf, Elf)
- 5 presets (Knight, Mage, Farmer, Rogue, Barbarian)
- 175 color swatches across 6 material categories
- Rules Engine (5 rules: helmet-hides-hair, full-face-helmet, etc.)
- Plugin system with manifest validation and merging
- 8 proportion morphs (height, shoulderWidth, neckWidth, bellySize, headSize, legLength, armLength, muscleMass)
- Seeded PRNG for deterministic random generation
- Quaternius base body GLB loading with skeleton extraction and material remapping

### Asset inventory
- **2 Quaternius base bodies** (male/female) converted to self-contained GLB
- **8 Quaternius hairstyles** as GLTF on disk (NOT imported — need GLB conversion):
  - Hair_SimpleParted, Hair_Long, Hair_BuzzedFemale, Hair_Buzzed, Hair_Buns, Hair_Beard
  - Eyebrows_Regular, Eyebrows_Female
- **0 clothing assets** (shirt, pants, shoes, gloves, cape, wings all empty)
- **0 head/face assets** (head, eyes, mouth slots empty)
- **0 helmet assets**
- **0 animation files**

### Known gaps
| Issue | Impact |
|---|---|
| No clothing/armor assets | Characters are nude superheroes |
| No hairstyle assets imported | Hair slot shows empty |
| No face customization | No separate head/eyes/mouth meshes |
| Belly morph doesn't work | `spine_01` scaling doesn't change belly appearance on Quaternius rig |
| Same base body for all characters | Every character has the same superhero physique |
| No animation import/preview | Characters stand still (only idle breathing) |
| No batch export | Each character exported one at a time |
| No user-saved presets | Only built-in presets, cannot save custom ones |
| No collections | No way to group assets thematically |
| No face morph targets | Nose width, eye size, jaw width cannot be customized |
| No pose library | Cannot preview character in T-pose, A-pose, etc. |
| GLB-only import | GLTF files with external .bin/textures rejected |
| No FBX export | Some game engines prefer FBX |

---

## Phase 1: Asset Pipeline

> **STATUS (2026-08-22, Session 024)**: Largely done — `imported-project/` has 30 registered GLBs
> (2 Superhero bodies, hair, beard, eyebrows, full peasant/ranger clothing sets for M/F).
> **Remaining blocker**: outfits are sculpted for the *Regular* physique; only free bodies are *Superhero*
> (same 65-bone skeleton, different shape). Male fits acceptably; female clips badly.
> **Resume path**: buy Quaternius Source pack ($19.99) → run `node scripts/import-regular-bodies.mjs <unpacked-pack-root>`
> → select Regular bodies → outfits fit. See AGENTS.md Session 024 for full findings.

**Goal**: Populate all 14 slots with real assets so the app can show something other than a nude superhero.

### 1.1 Convert Quaternius GLTF → GLB

The Quaternius asset pack on disk at `assets/Universal Base Characters[Standard]/` contains:

- `Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/`
  - Hair_SimpleParted.gltf
  - Hair_Long.gltf
  - Hair_BuzzedFemale.gltf
  - Hair_Buzzed.gltf
  - Hair_Buns.gltf
  - Hair_Beard.gltf
  - Eyebrows_Regular.gltf
  - Eyebrows_Female.gltf

Each has accompanying `.bin` and `.png` files. Convert all to self-contained GLB using `@gltf-transform/cli optimize`.

**Command**: `npx @gltf-transform/cli optimize input.gltf output.glb`

**Acceptance**: All 10 files (8 hairstyles + 2 eyebrows) converted to single-file GLB. Verify each loads correctly in the app's import validator.

### 1.2 Create fresh starter project

Build a scripted setup (like `scripts/setup-base-body.mjs` but for ALL assets):

- Create new project directory
- Import all converted hairstyles → `hair` slot
- Import beard → `beard` slot
- Import eyebrows → `eyebrows` slot
- Import male body → `body` with `male` tag
- Import female body → `body` with `female` tag
- Generate thumbnails for all assets

**Acceptance**: New project has 14+ registered assets across 4 slots. Slot panel shows hair, beard, and eyebrow options alongside body.

### 1.3 Source clothing assets

Research and import CC0 clothing meshes compatible with the Quaternius skeleton:

**Options ranked by feasibility:**

1. **MakeHuman exports**: Generate rigged shirt/pants/shoes with matching skeleton. Export as GLTF → convert to GLB. Requires installing MakeHuman and setting up export pipeline.

2. **Quaternius Ultimate Animated Props Pack**: Contains weapons, shields, backpacks — but may not include body-fitting clothing.

3. **Mixamo auto-rig**: Model clothing in any tool → upload to Mixamo → download as rigged GLB. Matching the Quaternius bone hierarchy is critical.

4. **Placeholder boxes**: As fallback, generate simple BoxGeometry meshes parented to bones (cone for shirt, box for shoes) — ugly but functionally tests the slot system.

**Target slots**: shirt, pants, shoes, gloves, cape, wings, helmet

**Acceptance**: At least 2 assets per clothing slot (e.g., 2 shirts, 2 pants, 2 shoes). Characters can be dressed.

### 1.4 More body types

Beyond the male/female superhero physique:

1. **Quaternius other packs**: Check if Quaternius offers fat/thin/short/tall body variants
2. **MakeHuman body morphs**: Export bodies with different BMI, muscle, and height settings
3. **Manual bone edits**: Create variant bodies by modifying the existing GLB mesh geometry

**Goal**: At least 3 distinct body shapes (slim, muscular, heavy).

**Acceptance**: Selecting a different body asset changes visible body shape, not just gender.

---

## Phase 2: Belly & Body Morph Fix

**Goal**: The belly morph slider actually makes the belly look fatter.

### 2.1 Investigate Quaternius rig

Open `Superhero_Male_FullBody.glb` in Three.js inspector or Blender:

- Does the body mesh have morph targets (`morphTargetDictionary`)?
- Is there a dedicated belly/spine bone that could be scaled?
- Is belly deformation handled entirely by vertex weights?

**Methods**:
- Load GLB in app, traverse `mesh.morphTargetDictionary` for any relevant targets
- Try scaling other spine bones (`Spine`, `Spine1`, `Spine2`) instead of `spine_01`
- Check if `bellySize` is a recognized morph target name on the body mesh

**Acceptance**: Identify the correct mechanism for belly deformation. Document findings.

### 2.2 Implement fix

Based on investigation:

- **If morph targets exist**: Route `bellySize` through ProportionManager's mesh morph fallback path (already exists for unknown morph names)
- **If bone scaling works on different bone**: Update `BONE_MORPHS` mapping in ProportionManager
- **If neither**: Add note in UI that belly morph is unsupported for current body, and consider adding custom vertex displacement as stretch goal

**Acceptance**: Belly morph slider produces visible belly deformation on at least one body type.

---

## Phase 3: Face Morph Targets

**Goal**: Customize face shape (nose width, eye size, jaw width, cheekbones).

### 3.1 Inspect head assets

Quaternius base bodies include a head mesh (part of the full body GLB). Check for morph targets:

- Does `MI_Superhero_Male` (or similar) have morph target dictionary?
- Are there any morph targets at all on imported base body meshes?

**Acceptance**: Document whether Quaternius heads have usable morph targets.

### 3.2 Add face morph sliders

If morph targets exist:
- Expose them in the PropertiesPanel (alongside body proportion sliders)
- Create a separate "Face" section in the sliders panel
- Wire through ProportionManager's mesh morph fallback path

If they don't exist:
- Consider importing a separate head mesh with morph targets (MakeHuman exports)
- Or defer face customization until asset packs with morph targets are available

**Acceptance**: Face sliders appear in UI and deform the character's face in real-time.

---

## Phase 4: Core Feature Gaps

**Goal**: Complete the remaining deliverables from the original sprint plans.

### 4.1 Batch export

- Add multi-select to CharacterBrowser (checkboxes or Ctrl+click)
- "Export Selected" / "Export All" buttons in toolbar
- Progress bar dialog with per-character success/failure
- Output: `{project}/exports/{profile}/batch-{timestamp}/{characterName}.glb`

**Dependencies**: Phase 1 (need assets worth exporting)

**Acceptance**: Select 5 characters, click Export All, all 5 GLBs written with sidecar DNA files.

### 4.2 User-saved presets

- "Save as Preset" button in toolbar
- Stores current DNA (slots, morphs, colors) to `{project}/presets/{name}.preset.json`
- Generated thumbnail shows preset preview
- Presets appear alongside built-in presets in PresetPanel, with "User" section

**Dependencies**: None (only needs DNA store)

**Acceptance**: Save current character as "My Knight", close app, reopen, apply preset, character matches.

### 4.3 Collections

- Collections defined in `project.json` as `collections: { "Fantasy": ["hair_01", "shirt_03", ...], ... }`
- `CollectionManager` service for CRUD (similar to favorites pattern)
- Collection filter in SlotPanel: dropdown or chip selector
- Assets can belong to multiple collections

**Dependencies**: Phase 1 (collections are meaningless without assets)

**Acceptance**: Filter slot browser by "Fantasy" collection → only fantasy-tagged assets shown.

### 4.4 Pose library

- Pose data: JSON with bone rotation values
  ```json
  { "id": "hero", "name": "Hero Pose", "bones": { "LeftUpperArm": { "x": 0.5 }, "RightUpperArm": { "x": -0.5 } } }
  ```
- Pose selector in toolbar (dropdown or quick buttons)
- Applying a pose does NOT modify DNA (purely visual)
- Built-in poses: T-pose, A-pose, idle relaxation, hero pose, arms crossed
- Pose stored in scene state, not character state

**Dependencies**: None

**Acceptance**: Click "Hero Pose" → character poses accordingly. Click "T-pose" → returns to default. Save and reload — pose is not persisted (intentional).

### 4.5 Animation support

- Animation import through existing import pipeline (detect `gltf.animations.length > 0`)
- Animation selector in viewport controls
- CharacterManager creates AnimationMixer on skeleton root for imported clips
- Animated export: GLB export includes animation tracks

**Dependencies**: Requires real animated GLB assets (Mixamo animations, etc.)

**Acceptance**: Import animated GLB → select animation from dropdown → character plays animation in viewport → export includes animation.

### 4.6 FBX export

- Investigate FBX export libraries:
  - `three-fbx` (Three.js FBX loader, no exporter)
  - `fbx2gltf` command-line tool (GLB → FBX)
  - Custom FBX writer (high effort)
- If no reasonable path: add note that GLB covers Unity/Godot/Mixamo, and FBX users should use external converters

**Dependencies**: Low priority

**Acceptance**: Export profile "FBX Standard" produces `.fbx` file importable into Unity.

---

## Phase 5: Asset Creation & Distribution

**Goal**: Enable third-party asset creation and make the app useful out of the box.

### 5.1 Ultimate Starter Pack

Bundle of all converted and imported assets as a self-contained plugin:

- **Contents**:
  - 2 base bodies (male, female)
  - 8 hairstyles
  - 2 eyebrow variants
  - 1 beard
  - (Phase 1 clothing assets when available)
- **Format**: Standard plugin directory with `plugin.json`, `assets/index.json`, and GLB files
- **Distribution**: Ships with the app or downloadable from a releases page
- **Installation**: Drop into `{project}/plugins/` and restart

**Dependencies**: Phase 1 complete

**Acceptance**: Fresh install → copy starter pack into plugins → restart app → all 14+ assets available in slot browser.

### 5.2 Style guide documentation

Written document for asset creators covering:

- Skeleton requirements (bone names with aliases, hierarchy depth)
- Origin alignment rules per slot type (head at neck pivot, hair at scalp, etc.)
- Poly budgets per slot (body: 15K, hair: 3K, helmet: 5K, etc.)
- Texture size limits (body: 2048x2048, other: 1024x1024)
- Material naming conventions (materials named "skin", "hair", "cloth", etc. get auto-remapped)
- Palette guidelines (use colors from `palettes.json` for best results)
- Export settings (GLB with Draco compression, embedded textures)

**Dependencies**: None (can be written at any time)

**Acceptance**: External Blender artist can follow guide and produce assets that work on first import.

### 5.3 Plugin distribution format

- `.cartoongen-pack` file format (zip containing plugin directory)
- Drag-and-drop install: drop `.cartoongen-pack` onto app → extracted to plugins directory
- Plugin marketplace UI (stretch goal)

**Dependencies**: Phase 5.1

**Acceptance**: Drop a pack file onto the app → plugin appears in PluginPanel with status "loaded".

---

## Phase 6: Procedural Character (Sprints 13–18)

> See **`procedural-character.md`** for the full plan. Builds a fully
> procedural, skeleton-skinned cartoon character from parametric math
> (sweeps + lathes + computed skin weights) — removes the dependency on
> paid/external base-body models. Runs in parallel with Phases 1–3; the
> Regular-physique outfit blocker (Phase 1) becomes optional once the
> procedural body can wear procedurally fitted clothing (post-Sprint 18).

---

## Known Technical Debt

These are issues that don't block features but should be addressed for maintainability.

| Issue | Area | Impact |
|---|---|---|
| `ruleIpc.ts` dynamically imports `pluginIpc.ts` for plugin service access | IPC | Circular dependency risk. Could refactor with dependency injection. |
| `PluginService.ts` dynamically imports `index.ts` | Plugin | Same circular dependency pattern. |
| No test coverage for renderer Three.js code | Testing | AssetManager, SlotManager, ProportionManager, CharacterManager untested. Need jsdom + headless GL. |
| Draco decoder URL hardcoded to gstatic CDN | Asset loading | Offline usage breaks. Should bundle decoder or make configurable. |
| ImportDialog and ExportDialog as raw modals | UI | No shared modal component. Duplicate patterns. |
| `processingBodySlot` guard in CharacterManager | Assembler | Works but fragile. A slot processing pipeline would be cleaner. |
| No asset versioning | Asset Registry | All assets are v1. Changing an asset breaks saved characters that reference it. |

---

## Performance Targets

| Metric | Current | Target |
|---|---|---|
| Startup time | ~1.5s | < 2s |
| Character load (cached assets) | ~200ms | < 500ms |
| Slot swap (cached) | ~50ms | < 100ms |
| Asset import (GLB) | ~1s | < 2s |
| Export (GLB) | ~500ms | < 3s |
| GPU memory (full character) | ~150MB | < 500MB |
| Draw calls (full character) | ~20 | < 100 |
| Triangle budget | ~30K (base body) | < 100K |

---

## Deferred (Not in Scope)

These are explicitly deferred. Do not begin work on them until Phases 1-5 are complete.

- **LOD generation** — auto-generate LOD1-3 for imported assets
- **Texture atlas baking** — combine multiple materials into one texture
- **Cloth/hair physics simulation** — dynamic cloth and hair
- **Facial animation** — blend shape rig for speaking/expression
- **Procedural texture generation** — wear, dirt, patterns
- **AI hooks** — text-to-DNA, image-to-asset-suggestion
- **Cloud/network features** — multi-user, asset sharing, online marketplace
- **VR/AR preview** — view character in VR/AR
- **Mobile support** — responsive layout for tablets/phones
- **FBX export** — see Phase 4.6; only pursue if there's clear demand

---

## How to Use This Document

1. **Before starting each phase**, switch to plan mode to hash out implementation details
2. Update this document with decisions made during planning
3. Mark phases as complete with date and verification notes
4. Move items from Deferred to active phases only when Phases 1-5 are complete
