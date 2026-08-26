# Direction

This document is the single source of truth for what to build and in what order.

It is structured as a series of Sprints. Each Sprint has a clear goal, a list of deliverables, and completion criteria.

Do not skip sprints. Do not reorder sprints unless this document is updated.

The project is built in Electron + React + TypeScript + Three.js + Node.js. Local-first. No cloud services. No paid APIs.

---

## Architecture Principles

These are non-negotiable. Every sprint must respect them.

1. **Data is the source of truth.** The renderer (Three.js) is a client of the data layer, not the owner. Character DNA is saved, not meshes.

2. **Unidirectional data flow.** UI mutates state via actions. Subscribers (renderer, exporter, etc.) react to state changes. No reverse flow.

3. **Metadata-driven assets.** Everything is an asset with metadata. No hardcoded filenames. No hardcoded compatibility rules.

4. **Composition over inheritance.** Systems are composed of focused managers, not monolithic god classes.

5. **Renderer-agnostic core.** The data layer, asset registry, rules engine, and export pipeline do not import Three.js. Only the preview renderer and exporter touch 3D APIs.

6. **Validation gates every pipeline.** Assets are validated on import. Characters are validated before export. Bad data never enters or leaves the system silently.

7. **Design for undo on day one.** DNA mutations are immutable operations that return new state. Undo/redo is free.

---

## System Architecture

```
                    ┌─────────────────────────────┐
                    │       React UI Layer         │
                    │  (Panels, Pickers, Viewport) │
                    └──────────┬──────────────────┘
                               │ actions
                               ▼
                    ┌─────────────────────────────┐
                    │       State Manager          │
                    │  (Zustand / useReducer)      │
                    │  DNA + UI state              │
                    └──────────┬──────────────────┘
                               │ state
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                   ▼
   ┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
   │ Preview        │ │ Export       │ │ Validation       │
   │ Renderer       │ │ Pipeline     │ │ Pipeline         │
   │ (Three.js)     │ │              │ │                  │
   │                │ │ GLB / FBX    │ │ Asset Import     │
   │ Character      │ │ Export       │ │ Character Export │
   │ Assembler      │ │ Profiles     │ │                  │
   └────────────────┘ └──────────────┘ └──────────────────┘
                               ▲
                               │ reads
                    ┌──────────┴──────────┐
                    │     Asset Registry   │
                    │  (JSON index + fs)   │
                    └─────────────────────┘
```

### Core Data Flow

```
User clicks "Hair → hair_03"
  → React dispatches setSlot("hair", "hair_03")
  → State produces new DNA (immutable)
  → Renderer subscriber detects change
  → AssetManager loads hair_03.glb from cache or disk
  → SlotManager attaches to Head bone
  → MaterialManager applies shared hair material
  → Scene updates

User clicks "Save"
  → DNA serialized to {project}/characters/{name}.character.json
```

---

## Sprint Roadmap

### Sprint 0: Project Scaffold

**Goal**: Bootable Electron app with React and Three.js canvas.

**Deliverables**:
- Electron + React + TypeScript scaffold (Vite bundler)
- Three.js canvas rendering in a viewport component
- Dev tooling: ESLint, Prettier, TypeScript strict mode
- `package.json` with all dependencies
- Basic window with empty 3D viewport
- `.gitignore`, `tsconfig.json`, `vite.config.ts`

**Completion criteria**:
- `npm run dev` launches Electron window with Three.js scene
- Hot reload works for both React and Three.js
- TypeScript compiles with no errors (strict mode)

---

### Sprint 1: Project System + Character DNA

**Goal**: The data layer is fully functional. Characters can be created, saved, loaded, and manipulated in code. No visual customization yet.

**Prerequisites**: Sprint 0

**Deliverables**:

1. **Project system**
   - `ProjectService` creates/opens projects (a folder with a `project.json` manifest)
   - `project.json` contains: project name, version, asset index reference, created/modified dates
   - Project folders: `characters/`, `assets/`, `thumbnails/`
   - `ProjectService.listCharacters()` returns all `.character.json` files
   - `ProjectService.listAssets()` returns all indexed assets

2. **Character DNA schema**
   ```typescript
   interface CharacterDNA {
     version: number;
     name: string;
     slots: Record<string, string | null>;        // slotId -> assetId
     morphs: Record<string, number>;               // morphName -> value 0-1
     colors: Record<string, string>;               // materialId -> hex color
     metadata: { created: string; modified: string; };
   }
   ```
   - Versioned schema with migration path

3. **DNA mutation functions** (pure, immutable)
   - `setSlot(dna, slotId, assetId) → DNA`
   - `setMorph(dna, morphName, value) → DNA`
   - `setColor(dna, materialId, hex) → DNA`
   - Each returns a new DNA object, does not mutate

4. **Save/Load service**
   - `saveCharacter(project, dna) → writes .character.json`
   - `loadCharacter(project, name) → DNA`
   - `deleteCharacter(project, name)`
   - `listCharacters(project) → DNA[]`

5. **State manager** (Zustand)
   - `useProjectStore`: current project path, character list
   - `useCharacterStore`: current DNA, undo stack, redo stack
   - `useAssetStore`: asset registry, loading states

**Completion criteria**:
- Can create a character DNA in code, save to disk, reload, and verify deep equality
- Undo/redo stack works at the state level (no UI yet)
- Multiple characters can exist in a project
- State can be inspected in DevTools

---

### Sprint 2: Asset Registry + Slot Definitions

**Goal**: Assets are discoverable via a queryable index. Slots are defined as data. The Rules Engine evaluates compatibility.

**Prerequisites**: Sprint 1

**Deliverables**:

1. **Slot definitions** (static data file)
   ```typescript
   interface SlotDefinition {
     id: string;                 // "hair", "helmet", "shirt", etc.
     label: string;              // "Hair", "Helmet", etc.
     boneAttachment: string;     // "Head", "Spine1", etc.
     layer: number;              // render order / priority
     allowedTags: string[];      // ["hair", "hat"] for head slot
     maxAssets: number;          // 1 for most, >1 for multi-slot
   }
   ```
   - Slots are defined in a JSON file, not hardcoded
   - Adding a new slot type requires no code changes

2. **Asset Registry**
   - JSON index file (`assets/index.json`) in the project
   - Each entry: `{ id, slotId, path, tags, previewPath, version, created }`
   - `AssetRegistry.query({ slot, tags }) → AssetEntry[]`
   - `AssetRegistry.getById(id) → AssetEntry`
   - `AssetRegistry.register(entry) → void` (adds to index)
   - `AssetRegistry.unregister(id) → void` (removes from index)
   - Index is loaded once at startup, cached in memory

3. **Rules Engine**
   ```typescript
   interface Rule {
     trigger: { slot?: string; asset?: string; tag?: string; };
     conditions?: { slot?: string; asset?: string; hasTag?: string; };
     actions: Array<
       { type: "hide_slot"; target: string; }
       | { type: "show_slot"; target: string; }
       | { type: "disable_slot"; target: string; }
       | { type: "force_asset"; target: string; assetId: string; }
       | { type: "warn"; message: string; }
     >;
   }
   ```
   - Rules are stored in `project.json` or separate `rules.json`
   - Rules Engine takes current DNA + rules → returns `RuleResult[]`
   - Each result: `{ type: "hide" | "show" | "warn", slotId, message? }`
   - UI layer uses results to disable/hide slots, show warnings

4. **Example rules for testing**
   - Helmet equipped → hide Hair slot
   - Heavy Armor equipped → disable Cape slot with warning
   - Full face helmet → disable Eyebrows and Mouth slots

**Completion criteria**:
- `AssetRegistry.query({ slot: "hair", tags: ["female"] })` returns matching assets
- Rules Engine evaluates: helmet equipped → Hair slot is hidden
- Slot definitions can be inspected in console
- A test script can validate all rules against all assets

---

### Sprint 3: Three.js Character Assembler

**Goal**: Characters are rendered from DNA data. The bridge between data and 3D scene exists.

**Prerequisites**: Sprint 2

**Deliverables**:

1. **CharacterManager** (orchestrator)
   - Subscribes to character state
   - On DNA change: diff old vs new, only update changed slots/morphs/colors
   - Calls AssetManager, SlotManager, MorphManager, MaterialManager

2. **AssetManager** (3D loader + cache)
   - `loadAsset(assetId) → THREE.Group` (loads GLB from path, caches)
   - `releaseAsset(assetId)` (disposes geometry/materials, removes from cache)
   - LRU eviction policy (configurable max cached assets)
   - Handles Draco-compressed GLB files
   - Cache keyed by asset version — old version cached separately from new

3. **SlotManager** (attachment system)
   - `attachSlot(slotId, mesh)` — parents mesh to correct bone
   - `detachSlot(slotId)` — removes mesh, calls dispose
   - Respects layer ordering for overlapping slots
   - Handles both hard-attachment (parent to bone) and soft-attachment (copy bone weights)
   - Visibility controlled by Rules Engine results

4. **MorphManager** (blend shapes)
   - `applyMorphs(morphValues)` — sets morphTargetInfluences on head/body meshes
   - Validates morph names exist before applying (graceful fallback)
   - Stores base morph target dictionary for reference

5. **MaterialManager** (shared materials)
   - Global material instances: `skin`, `hair`, `cloth`, `metal`, `leather`, `eye`, `mouth`
   - `getMaterial(materialId) → THREE.Material` (shared instance)
   - `setColor(materialId, hex)` — updates color on shared material, triggers re-render
   - Each material has a default color and property set (roughness, metalness, etc.)
   - Imported assets get their materials remapped to shared instances

6. **Base mesh loading**
   - Loads the Mixamo-rigged base mesh (body + head) on character creation
   - Extracts skeleton, creates bone map
   - Stores morph target dictionary from head mesh
   - Sets up AnimationMixer with default idle animation

7. **Disposal contract enforcement**
   - Every 3D asset implements `dispose()` pattern
   - SlotManager calls dispose on detach
   - AssetManager calls dispose on cache eviction
   - Console warning if undisposed assets remain when switching character

**Completion criteria**:
- Loading a DNA file results in a fully assembled 3D character
- Changing a slot via state triggers hot swap in the scene (no flicker)
- Changing a color via state updates all meshes using that material instantly
- Morph sliders deform the head in real-time
- Rules Engine visibility changes are reflected (helmet hides hair)
- Asset disposal verified (no GPU memory leak on slot change)

---

### Sprint 4: Import Pipeline

**Goal**: Users can import their own assets. Assets are validated, indexed, and immediately available.

**Prerequisites**: Sprint 2 (needs Asset Registry + Slot definitions)

**Deliverables**:

1. **File import interface**
   - Drag-and-drop GLB/GLTF files onto the app window
   - File picker dialog for import
   - Multi-file import (batch import multiple assets)

2. **Format validation**
   - File is valid GLB/GLTF (parse header/magic bytes)
   - GLTF version >= 2.0
   - File is not corrupted (checksum/hash verify)

3. **Skeleton validation**
   - Compare asset skeleton to reference skeleton (base mesh)
   - Missing bones report: warning if non-critical, error if critical
   - Bone weight validation: sum of weights per vertex ≈ 1.0
   - Max bones per vertex check (should be ≤ 4)

4. **Scale normalization**
   - Detect asset scale relative to reference mesh
   - Auto-scale if within 10x range, warn if outside
   - Apply uniform scale to match project units

5. **Texture validation**
   - All referenced textures exist
   - Texture dimensions within budget (body: 2048, other: 1024)
   - Texture format supported (PNG, JPEG, KTX2)

6. **Slot assignment**
   - Manual: user selects slot from dropdown
   - Auto-detect: based on bone attachment proximity and naming conventions

7. **Preview generation**
   - Render asset in isolation (neutral lighting, centered camera)
   - Generate 256x256 PNG thumbnail with transparent background
   - Store in `projects/{name}/thumbnails/{assetId}.png`

8. **Metadata editor**
   - Asset name, slot assignment, tags (multi-select with autocomplete)
   - Version field (defaults to 1)
   - Dependency fields: "requires asset X"

9. **Asset indexing**
   - On import complete: write entry to `assets/index.json`
   - Asset is immediately available in Asset Registry queries

**Completion criteria**:
- Drag a GLB into the app, assign to "hair" slot, see it in the asset browser
- Import an asset with wrong skeleton — validation rejects with clear message
- Import an asset with missing textures — warning displayed, import proceeds
- Thumbnail is generated and visible in asset browser
- Imported asset is immediately usable in character customization

---

### Sprint 5: React UI Layer

**Goal**: Full visual character customization with panels, pickers, and viewport.

**Prerequisites**: Sprint 3 (assembler works), Sprint 4 (assets can be imported)

**Deliverables**:

1. **Layout shell**
   - Three-panel layout: asset browser (left), viewport (center), properties (right)
   - Panel resize handles
   - Collapsible panels
   - Responsive to window size

2. **Viewport component**
   - Three.js canvas embedded in React
   - Orbit controls (rotate, pan, zoom)
   - Grid overlay or stage floor
   - Camera preset buttons (front, back, side, face close-up, full body)
   - Background color/lighting toggle

3. **Slot browser (asset grid)**
   - Slot selector: list of slots (Hair, Helmet, Shirt, etc.) as tabs or sidebar
   - Asset grid: thumbnail cards for current slot's available assets
   - Current asset highlighted
   - Asset hover: tooltip with name, triangle count, tags
   - Empty state: "No assets for this slot. Import some!"

4. **Color pickers**
   - Category tabs: skin, hair, cloth, metal, leather, eyes
   - Palette grid: predefined colors per category (not a free color wheel)
   - Currently selected color has checkmark
   - Palettes defined in JSON (can be extended)
   - Reset color to default button

5. **Morph sliders**
   - Section for face morphs, section for body morphs
   - Sliders with range display (0-100%)
   - Reset to default (0%) button per slider
   - Slider names from morph target dictionary

6. **Toolbar**
   - Save button (saves current DNA)
   - Load button (opens character list)
   - New Character button
   - Undo/Redo buttons (with keyboard shortcuts Ctrl+Z / Ctrl+Y)
   - Randomize button
   - Export button
   - Import button

7. **Character list panel**
   - Grid of saved characters with name and thumbnail
   - Click to load, right-click to delete/rename
   - Search/filter by name

8. **Search and filtering**
   - Search bar in asset browser (filters by name, tags)
   - Tag filter chips (show assets tagged "fantasy", "female", etc.)
   - Favorites filter toggle

9. **Keyboard shortcuts**
   - Ctrl+S: save
   - Ctrl+Z: undo
   - Ctrl+Y / Ctrl+Shift+Z: redo
   - 1-6: camera presets
   - Ctrl+N: new character
   - Delete: remove current slot asset

**Completion criteria**:
- User can customize every slot, change colors, adjust morphs, and save
- All UI actions go through state → DNA → renderer (no direct Three.js calls from React)
- Undo/redo works for all customization actions
- Imported assets appear in the asset browser automatically
- The app feels responsive (< 100ms between action and visual feedback)

---

### Sprint 6: Export Pipeline

**Goal**: Reliable export to game-ready formats. Characters work in Unity and Mixamo.

**Prerequisites**: Sprint 3 (assembler works), Sprint 5 (UI allows character creation)

**Deliverables**:

1. **ExportManager** (orchestrator)
   - Takes current DNA + export profile → produces output file(s)
   - Coordinates: mesh merging, material baking, skeleton stripping, format conversion

2. **GLB export**
   - Merges all character meshes into single glTF scene
   - Preserves skeleton hierarchy and bone indices
   - Preserves morph targets and morph target names
   - Embed textures (no external references)
   - Output file: {characterName}.glb

3. **GLTF export (JSON)**
   - Same as GLB but as readable JSON + separate buffers
   - Useful for debugging and manual inspection

4. **Export profiles**
   - Profile: JSON object defining export settings
   - **Unity profile**: Y-up, -Z forward, FBX/GLB, humanoid rig convention, 1:100 scale
   - **Mixamo profile**: T-pose, specific bone naming (Mixamo standard), FBX
   - **Godot profile**: GLB, -Z forward, no scale adjustment
   - **GLTF standard**: draco compression optional, embedded textures
   - Users can create custom profiles

5. **Export validation**
   - Pre-export check: required slots filled? (body, head)
   - All referenced assets exist and are loaded
   - Morph targets match between head mesh and export
   - Material references valid (no missing textures)
   - Skeleton complete (no critical bones missing)
   - **Game ready score** display: {passedChecks}/{totalChecks}

6. **Batch export**
   - Select multiple characters from character list
   - Choose export profile
   - Export all to output directory
   - Progress indicator
   - Summary report: succeeded/failed per character

7. **Export output**
   - Files go to: {project}/exports/{profile}/{characterName}.{ext}
   - Sidecar DNA file optionally included for reference
   - Export log: {project}/exports/export_log.json

**Completion criteria**:
- Export character to GLB → import into Unity → animations work (tested)
- Export character to FBX → upload to Mixamo → auto-rig succeeds
- Export with missing slot → validation warning shown before export
- Batch export 10 characters completes without error

---

### Sprint 7: Presets + Random Generator

**Goal**: Users can apply templates and generate random characters.

**Prerequisites**: Sprint 5 (UI exists)

**Deliverables**:

1. **Preset system**
   - Preset: partial DNA (subset of slots/morphs/colors)
   - Applying a preset: merges preset DNA onto current DNA (does not replace unset fields)
   - Built-in presets: "Knight", "Mage", "Farmer", "Rogue", "Barbarian"
   - User can save current state as a preset
   - Preset browser: grid with thumbnails, searchable

2. **Random character generator**
   - `generateRandomDNA(rules, assetRegistry) → DNA`
   - Algorithm:
     a. Pick random base body type
     b. Pick random assets for each slot (respecting rules compatibility)
     c. Assign random morph values (within defined ranges)
     d. Assign random colors (from palettes)
     e. Validate rules, fix conflicts
   - Weighted selection: some assets more common than others (configurable)
   - Seed support: same seed produces same character (useful for sharing)

3. **Template characters**
   - Templates: "Stylized Male", "Stylized Female", "Child", "Dwarf", "Elf"
   - Each template defines: default morph values, allowed slots, color palettes
   - Templates are the starting point for new characters
   - User chooses template on "New Character"

**Completion criteria**:
- Applying "Knight" preset equips appropriate slots and colors
- Random character generator creates valid characters (no rule conflicts)
- Same seed produces identical character (deterministic)
- Templates provide distinct starting points

---

### Sprint 8: Polish & Professional Quality

**Goal**: The app feels professional. Quality-of-life features are present.

**Prerequisites**: Sprint 5, Sprint 6, Sprint 7

**Deliverables**:

1. **Thumbnail system**
   - Auto-generate character thumbnail on save (512x512, transparent PNG)
   - Asset thumbnails regenerated if lighting/materials change
   - Thumbnail cache in `{project}/thumbnails/`
   - Lazy generation: only generate when needed (not at startup)

2. **Lighting presets**
   - Studio (3-point lighting)
   - Dramatic (single strong key light)
   - Outdoor (warm sun + blue sky fill)
   - Fantasy (colored fills, rim light)
   - Silhouette (backlit)
   - Each preset: light positions, colors, intensities, environment map

3. **Pose library**
   - Idle, T-pose, A-pose, Hero pose, Crossed arms
   - Pose data: bone rotation values stored as JSON
   - Switching pose does not modify DNA (purely visual)
   - Poses stored in project or globally

4. **Favorites**
   - Star/favorite toggle on assets
   - Filter asset browser to show favorites only
   - Favorites persisted per project

5. **Collections**
   - User-defined asset groups
   - Example: "Fantasy Hair", "Sci-Fi Armor", "Female Outfits"
   - Assets can belong to multiple collections
   - Collections stored in `project.json`

6. **Character browser**
   - Full-screen grid of saved characters
   - Each card: thumbnail + name + slot count + last modified
   - Sort by: name, date created, date modified
   - Search by character name

7. **Export profiles UI**
   - Profile editor: rename, duplicate, delete profiles
   - Profile settings: format, scale, axis, compression, embed textures
   - Default profiles are read-only, user profiles editable

8. **Workspace persistence**
   - Restore last opened project on launch
   - Remember panel sizes and visibility
   - Remember last selected character
   - Remember camera position per character

9. **Progress indicators**
   - Loading spinner for asset loading
   - Progress bar for batch export
   - Toast notifications for save/export/import completion

**Completion criteria**:
- User can work without friction for extended sessions
- No loading delays beyond initial asset caching
- All UI states (loading, empty, error) are handled gracefully
- Application state survives restart (last project, panel layout)

---

### Sprint 9: Extensibility

**Goal**: Third-party asset packs can be distributed as plugins.

**Prerequisites**: Sprint 4 (import works), Sprint 8 (app is stable)

**Deliverables**:

1. **Plugin manifest format**
   - `plugin.json`: name, version, author, description, minAppVersion, assets directory
   - Folder structure:
     ```
     my-plugin/
     ├── plugin.json
     ├── assets/
     │   ├── index.json    (asset registry entries)
     │   ├── meshes/       (GLB files)
     │   └── thumbnails/   (PNG files)
     ├── rules.json        (optional: additional rules)
     ├── presets.json      (optional: additional presets)
     ├── palettes.json     (optional: additional color palettes)
     └── README.md
     ```

2. **Plugin loader**
   - Scan plugins directory at startup
   - Load plugin manifests
   - Merge plugin assets into Asset Registry
   - Merge plugin rules into Rules Engine
   - Merge plugin presets into Preset system
   - Handle errors gracefully: bad plugin does not crash app

3. **Plugin validation**
   - Verify plugin.json structure
   - Verify all referenced asset files exist
   - Verify minAppVersion compatibility
   - Report errors per plugin (not global failure)

4. **Plugin management UI**
   - Plugin list with enabled/disabled toggle
   - Per-plugin status: loaded, error, incompatible
   - Error details: which plugin file has issues

5. **Style guide documentation** (written, for asset creators)
   - Skeleton requirements (bone names, hierarchy)
   - Origin alignment rules (per slot type)
   - Poly budgets per slot type
   - Texture size limits and format requirements
   - Material naming conventions
   - Color palette guidelines

**Completion criteria**:
- Drop a plugin folder into plugins directory, restart app, new assets appear
- Plugin with missing files shows error but does not crash app
- Disabled plugin does not load its assets
- Asset creators can produce compatible assets by following the style guide

---

## Future (Beyond Sprint 9)

These are explicitly deferred. Do not begin work on them until Sprint 9 is complete.

- LOD generation (auto-generate LOD1-3 from high-poly source)
- Texture atlas baking (combine multiple materials into one texture)
- Physics simulation (cloth, hair dynamics)
- Animation import/retargeting (import custom animations)
- Facial animation (blend shape rig for speaking/expression)
- Procedural texture generation (wear, dirt, patterns)
- AI hooks (text-to-DNA, image-to-asset-suggestion)
- Cloud/network features (multi-user, asset sharing)
- VR/AR preview
- Mobile support

---

## Testing Strategy

Each Sprint must include tests appropriate to the deliverables:

- **Sprint 0-2**: Unit tests for data layer (DNA mutations, Asset Registry queries, Rules Engine evaluation)
- **Sprint 3**: Integration tests for character assembly (load DNA → verify scene graph)
- **Sprint 4**: Integration tests for import pipeline (import GLB → verify asset indexed)
- **Sprint 5**: Component tests for UI (React Testing Library)
- **Sprint 6**: Integration tests for export (export → re-import → verify DNA preserved)
- **Sprint 7-9**: Integration + manual QA

Test framework: Vitest (same config as Vite build).

---

## Performance Budget

- **Startup time**: < 2 seconds to interactive (Electron window + Three.js canvas)
- **Character load**: < 500ms from DNA to fully rendered character (with cached assets)
- **Slot swap**: < 100ms from click to visual result (asset must be cached)
- **Asset import**: < 2 seconds per asset (including validation and thumbnail gen)
- **Character export**: < 3 seconds per character (GLB with embedded textures)
- **GPU memory**: < 500MB for a fully dressed character with all materials
- **Draw calls**: < 100 for a fully assembled character
- **Triangle budget**: < 100K tris for a fully assembled character
- **Cache size**: LRU with max 50 loaded assets (configurable)

---

## Error Handling Principles

- **No silent failures.** Every error is logged, and if user-facing, shown as a toast.
- **Graceful degradation.** A missing asset does not crash the app — it shows a placeholder.
- **Validation before action.** Validate before import, before save, before export.
- **Recovery path.** Every error has a suggested recovery action.

---

## File Naming Conventions

- Character files: `{characterName}.character.json`
- Project manifest: `project.json`
- Asset index: `assets/index.json`
- Rules: `rules.json`
- Presets: `presets/{presetName}.preset.json`
- Export profiles: `export-profiles/{profileName}.profile.json`
- Plugins: `plugins/{pluginName}/plugin.json`

---

## Directory Structure (Generated by App)

```
my-project/                      # A project folder
├── project.json                 # Project manifest
├── characters/                  # Saved character DNA files
│   ├── MyHero.character.json
│   └── Villager.character.json
├── assets/                      # Asset library
│   ├── index.json               # Asset registry (auto-maintained)
│   ├── meshes/                  # Asset files (symlinked or copied on import)
│   │   ├── hair_short_01.glb
│   │   └── hoodie_02.glb
│   └── thumbnails/              # Auto-generated previews
│       ├── hair_short_01.png
│       └── hoodie_02.png
├── exports/                     # Exported characters
│   ├── unity/
│   ├── mixamo/
│   └── glb/
├── thumbnails/                  # Character thumbnails
├── presets/                     # User-saved presets
├── plugins/                     # User-installed plugin packs
└── export-profiles/             # Custom export profiles
```
