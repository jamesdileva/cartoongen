The System Architecture

(DeepSeek V4 Flash on Max Effort Engine)

                       [ BROWSER UI LAYER ]
           ┌─────────────────────────────────────────┐
           │ Customizer Controls (Sliders, Colors)   │
           └────────────────────┬────────────────────┘
                                │
                       [ THREE.JS RUNTIME ]
           ┌────────────────────┴────────────────────┐
           │  • Base Mesh Display                   │
           │  • Bone Hierarchy Traversal            │
           │  • Morph Target Blendshapes            │
           │  • Attachment Points (Hair/Equip)       │
           └────────────────────┬────────────────────┘
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
 [ LOCAL PREVIEW ]                            [ EXPORT PIPELINE ]
┌─────────────────┐                          ┌──────────────────┐
│ AnimationMixer  │                          │ FBX / GLTF       │
│ Playback (JS)   │                          │ Bundler          │
└─────────────────┘                          └────────┬─────────┘
                                                      │
                                                      ▼
                                             [ MIXAMO / ENGINE ]
                                            (Drop in & Play)

Key Technical Decisions

    Base Model (Rigged Base): Pass your base body mesh through Mixamo once at the start of development to generate a base_rigged.gltf file.

    Morph Targets for Faces: Face customization (nose size, cheekbones, eye spacing) is handled via Three.js morphTargetInfluences on the base head rather than joint bones.

    Hard-Attachment Modular Props: Hair, helmets, and shoulder pads aren't bound to skin weights; they are parented directly to bone nodes (e.g., skeleton.getBoneByName('Head').add(hairMesh)).

    Soft-Mesh Modular Clothes: Shirts and pants share the exact same skeleton matrix weights as the base mesh.

Project Setup & Code Template

Below is the production-ready modular character setup written using Three.js. This demonstrates how to bind facial blendshapes, attach modular equipment directly to bones, and play back animations without Blender.
JavaScript

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export class CharacterSystem {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.characterGroup = new THREE.Group();
    this.scene.add(this.characterGroup);
    
    this.baseMesh = null;
    this.skeleton = null;
    this.mixer = null;
    this.boneMap = new Map();
    this.attachments = new Map(); // e.g., 'hair' -> Mesh
  }

  // 1. Load the core Mixamo-rigged base
  async loadBaseCharacter(url) {
    const gltf = await this.loader.loadAsync(url);
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.isSkinnedMesh) {
        this.baseMesh = child;
        this.skeleton = child.skeleton;
      }
      if (child.isBone) {
        this.boneMap.set(child.name, child);
      }
    });

    // Initialize Animation Mixer
    if (gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      const action = this.mixer.clipAction(gltf.animations[0]);
      action.play();
    }

    this.characterGroup.add(model);
  }

  // 2. Adjust Facial Morph Targets (No rigging required)
  setFacialFeature(featureName, value) {
    if (!this.baseMesh || !this.baseMesh.morphTargetDictionary) return;
    
    const index = this.baseMesh.morphTargetDictionary[featureName];
    if (index !== undefined) {
      this.baseMesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
    }
  }

  // 3. Attach Rigid Modular Items (Hair, Helmets, Weapons) to Bones
  attachPropToBone(boneName, propMesh, slotKey) {
    const targetBone = this.boneMap.get(boneName);
    if (!targetBone) {
      console.error(`Bone "${boneName}" not found in skeleton.`);
      return;
    }

    // Clear existing item in slot
    if (this.attachments.has(slotKey)) {
      const oldProp = this.attachments.get(slotKey);
      oldProp.parent.remove(oldProp);
    }

    // Parent directly to the target bone node
    targetBone.add(propMesh);
    this.attachments.set(slotKey, propMesh);
  }

  // 4. Update Animations in Main Loop
  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }

  // 5. Package and Export Combined Character Scene
  exportGLTF(filename = 'CustomCharacter.gltf') {
    const exporter = new GLTFExporter();
    exporter.parse(
      this.characterGroup,
      (gltf) => {
        const blob = new Blob([JSON.stringify(gltf, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
      },
      (error) => console.error('Export error:', error),
      { binary: false, embedImages: true }
    );
  }
}

Workflow Execution Steps

To implement this architecture without running into asset issues:

    Get One Clean Base Mesh: Export a generic humanoid mesh (from MakeHuman or similar) in T-pose.

    Rig Once in Mixamo: Upload your base mesh to Mixamo once. Download it as .gltf / .fbx with a standard armature. This is your single source of truth for bone weights.

    Build Items Separately: Build hair, hats, and props centered at (0, 0, 0) in your 3D software of choice.

    Assemble On the Fly: Load props in your WebGL app and mount them to the skeleton bones (Head, RightHand, Spine) programmatically.



    When building complex WebGL or 3D engine applications (like a modular character customizer), keeping runtime code separated from raw asset source files is crucial.
    
    Recommended Directory Structure

    my-3d-app/
├── public/                     # Static assets served as-is
│   ├── assets/
│   │   ├── models/             # Production-ready exports (.glb / .gltf)
│   │   │   ├── heads/
│   │   │   ├── hair/
│   │   │   └── bodies/
│   │   ├── textures/           # Compressed maps (.ktx2, .jpg, .png)
│   │   └── fonts/
│   └── decoders/               # Draco / KTX2 web workers & WASM decoders
│
├── raw-assets/                 # NEVER deployed to public (git-ignored or separate storage)
│   ├── blender/                # Source .blend files, armatures, sculpts
│   └── high-res-textures/      # Raw .psd, .substance, or 4K uncompressed maps
│
├── src/
│   ├── assets/                 # Code-imported static assets (icons, UI SVGs)
│   │
│   ├── core/                   # Engine & WebGL base wrappers
│   │   ├── Engine.ts           # Main render loop & canvas initialization
│   │   ├── CameraManager.ts    # Orbit controls, presets, framing
│   │   └── Lighting.ts         # Environment maps, directional lights, shadows
│   │
│   ├── components/             # Modular 3D scene objects (SceneSubjects)
│   │   ├── Character.ts        # Assembly parent for head, hair, body, rig
│   │   ├── FeatureSlot.ts      # Slot logic for swapping modular parts
│   │   └── Stage.ts            # Pedestal, background, ground reflection
│   │
│   ├── loaders/                # Asset loading & caching pipeline
│   │   ├── AssetManager.ts     # Central GLTF/Texture loading manager + cache
│   │   └── DracoDecoder.ts     # Configured decoder instance
│   │
│   ├── state/                  # Application state (Zustand, Redux, or Signals)
│   │   ├── characterState.ts   # Active mesh selections, color values, morph weights
│   │   └── uiState.ts          # Active UI tab, panel visibility, loading state
│   │
│   ├── utils/                  # Helper utilities
│   │   ├── Exporter.ts         # GLTFExporter / OBJExporter wrappers
│   │   └── ColorUtils.ts       # Color space conversions (sRGB to Linear)
│   │
│   └── ui/                     # 2D overlay UI components (React, Svelte, or Vanilla DOM)
│       ├── CustomizerPanel/
│       ├── ColorPicker/
│       └── ExportButton/
│
├── index.html
└── package.json

Key Architecture Sections

1. Asset Pipeline & Compression StrategySpecify formats, decoders, and compression targets for build time vs runtime:Geometry: Compress .glb files using Draco or Meshopt. Document decoder path hosting (public/decoders/) so loaders know where to find WASM workers.  Textures: Define max texture dimensions (e.g., 2048x2048 for body, 1024x1024 for small features) and GPU compression standards (e.g., KTX2/BASIS).  Origin Alignment: Document strict mesh origin guidelines for swapable assets (e.g., "All head meshes must have their origin placed at (0, 0, 0) at the neck pivot point").

2. State & Event ArchitectureDecouple the UI overlay from the 3D canvas:State Store as Single Source of Truth: The UI updates state (e.g., selectedHairId: "hair_02"), and a subscriber in the 3D scene handles fetching, swapping, and disposing of the active mesh.Unidirectional Data Flow: Never let sub-meshes directly alter main application state. Route actions through central state or an Event Bus.

3. Memory & Lifecycle Management3D apps in browsers leak GPU memory fast if unhandled. Include explicit rules for asset disposal:Disposal Contract: Document that every dynamic 3D component must implement a dispose() method.TypeScriptpublic dispose(): void {
  this.mesh.geometry.dispose();
  if (Array.isArray(this.mesh.material)) {
    this.mesh.material.forEach(m => m.dispose());
  } else {
    this.mesh.material.dispose();
  }
  this.parent.remove(this.mesh);
}
Asset Cache: Maintain a map of cached loaded geometries/materials so swapping back to a previously loaded mesh doesn't trigger a duplicate network request or GPU upload.

4. Performance Budget ArchitectureSet clear constraint metrics early in your architecture doc:Draw Call Target: Stay under 100 draw calls per frame.  Triangle Count Budget: Set a ceiling for total polycount on screen (e.g., max 50k-100k tris for a fully assembled character).Render Loop Strategy: Decide if rendering will be continuous (requestAnimationFrame) or on-demand (only re-render when state, camera, or animations change to save mobile battery).  

5 critical architecture questions:

1. Multi-Mesh Assembly Strategy

    The Question: How are swapped meshes attached and animated?

    Why it matters: Swapping a static mesh (like a hat) is easy—you just parent it to a head bone. But swapping skinned/deformed meshes (like changing pants or face shapes) requires the new mesh to share the exact same skeletal rig and bone weight hierarchy as the body.

    Architecture decision: Decide whether you will:

        Option A (Shared Rig): Keep one main Armature in memory and dynamically re-bind the newly loaded sub-mesh's skeleton to the main scene rig.

        Option B (Separate Scene Assemblies): Load self-contained .glb modules that include their own duplicate armatures, playing synchronized animation actions across all of them.

2. Morph Targets (Blend Shapes) vs. Unique Mesh Swaps

    The Question: How much of the customization is done via sliders (morphs) vs. discrete file swaps?

    Why it matters: If a user wants slightly wider cheekbones or a broader nose, downloading a separate .glb model for every permutation is inefficient.

    Architecture decision:

        Use Morph Targets (Blend Shapes) for continuous adjustments (height, weight, nose size, eye angle). These live inside a single base head/body mesh.

        Use Discrete Mesh Swaps for completely distinct topology (changing short hair to long braided hair, or adding glasses).

3. Shader & Material Synchronization

    The Question: How do materials react across swapped parts?

    Why it matters: If a user changes skin color or adjust skin roughness, that change must apply seamlessly across separate meshes (e.g., the head mesh, the neck, and the hands/body).

    Architecture decision: Implement a Shared Material Manager. Instead of each mesh holding its own unique material instance, create global material instances (e.g., GlobalSkinMaterial) that subscribe to color changes in state and are shared across all relevant sub-components.

4. UI-to-3D Picking & Camera Auto-Framing

    The Question: Does clicking a body part open its UI controls, and does the camera move?

    Why it matters: Good character creators feel reactive. When a user selects "Earrings", the camera should smoothly orbit and focus on the head.

    Architecture decision: Define a Camera Focal Preset System. Each customizable slot should have a camera coordinate target (x, y, z, FOV) attached to it so CameraManager.ts can interpolate the view when that slot becomes active.

5. Export & Output Requirements

    The Question: What happens after the user finishes customizing their character?

    Why it matters: Runtime assembly in WebGL uses many separate draw calls, but exporting the character for a game or rendering requires consolidation.

    Architecture decision:

        Exporting 3D (.glb / .obj): Do you need a runtime exporter (e.g., merging geoms, baking texture atlases into a single 2K texture, and stripping unused bones)?

        Exporting 2D (Profile Pictures / Thumbnails): Do you need a hidden canvas renderer to snapshot high-res transparent .png avatars with specific lighting presets?



        1. Character DNA System (The biggest missing piece)




====================================================================================================================================================================================================


Right now the document only talks about meshes.

Real character creators never save meshes.

They save data.

Something like

{
  "gender":"female",

  "body":"body_02",

  "head":"head_round",

  "eyes":"eyes_large",

  "nose":"nose_small",

  "hair":"ponytail_03",

  "eyebrows":"arched",

  "skinColor":"#F1D0B8",

  "hairColor":"#553322",

  "shirt":"hoodie_02",

  "pants":"jeans",

  "boots":"boots_01",

  "morphs":{
      "noseWidth":0.3,
      "eyeSize":0.7,
      "jawWidth":0.5
  }
}

The renderer should simply build a character from that.

Not the other way around.

That becomes your save file.

2. Asset Registry

Right now everything loads manually.

Eventually you'll have

500 hairstyles

400 shirts

200 pants

etc.

You need an Asset Registry.

Example

Hair

hair_short_01.glb

hair_short_02.glb

hair_long_01.glb

hair_bun.glb

...

metadata.json

metadata

{
"id":"hair_short_01",

"slot":"Hair",

"tags":[
"male",
"short",
"cartoon"
],

"preview":"hair01.png"
}

Then the UI simply asks

Give me every Hair asset.

instead of hardcoding files.

3. Slot System

This is huge.

Instead of

loadHair()

loadHat()

loadHelmet()

Everything becomes slots.

Head

Hair

Eyebrows

Eyes

Mouth

Beard

Helmet

Chest

Back

Shoulders

Hands

Weapon

Shield

Waist

Pants

Shoes

Cape

Tail

Wings

Each slot knows

allowed assets

bone attachment

layer priority

visibility rules
4. Dependency Rules

Example

Selecting

Helmet

should hide

Long Hair

Selecting

Heavy Armor

may automatically remove

Cape

Selecting

Glasses

might adjust eyebrows.

These rules become data.

5. Style Library

This is something almost nobody plans.

For a stylized game...

you don't want random assets.

You want them all matching.

Document things like

Eye size

Head ratio

Hand ratio

Leg length

Material roughness

Outline thickness

Texture resolution

Color palette

Bevel amount

Poly budget


That way every new asset automatically matches.

6. Character Generator

Instead of manually clicking everything.

Imagine

Generate Random Character

It chooses

Hair

Skin

Eyes

Outfit

Colors

Accessories

respecting compatibility rules.

That becomes incredibly useful for NPC creation.

7. Preset System

This is different than saves.

Presets are templates.

Knight

Mage

Farmer

Scientist

Merchant

Guard

Zombie


One click builds the base.

Then user tweaks.

8. Material System

This is surprisingly absent.

Instead of every mesh having materials

Create

Skin Material

Hair Material

Metal Material

Leather Material

Cloth Material

Eyes Material

Every asset shares them.

Changing skin color updates

Head

Hands

Neck

Body

Legs

Feet

instantly.

9. Color Palette Architecture

Don't allow arbitrary colors.

Use palettes.

Example

Skin

24 colors

Hair

32 colors

Eyes

20 colors

Armor

50 colors


Makes every character look professionally designed.

10. Outfit System

Instead of selecting

shirt

pants

boots


you can have

Outfit

Casual

Knight

Mage

Police

Pirate

Chef


which equip multiple slots automatically.

11. LOD Generation

Eventually you'll want

LOD0

LOD1

LOD2

LOD3

Especially for Unity.

12. Thumbnail Renderer

This is one of those features everyone loves.

Every saved character automatically gets

128x128 PNG

256x256 PNG

512x512 PNG

Transparent background.

Useful for

Inventory

NPC lists

Save files

Character selection

13. Export Profiles

Instead of one export.

Support

Unity

Godot

Unreal

Mixamo

VRChat

GLB

FBX

OBJ

Each profile tweaks export settings automatically.

14. Batch Export

Extremely useful.

Generate

500 NPCs

↓

Export All

↓

500 GLBs

500 PNGs

500 JSON DNA files

Great for procedural games.

15. Asset Validation

Every imported asset should be checked.

Example

Correct origin?

Correct scale?

Correct skeleton?

Correct materials?

Too many triangles?

Too many bones?

Missing textures?

Duplicate vertices?


The app should reject broken assets before they get into your library.

16. Character Assembly Graph

Instead of a linear process

Think of it as

Character

│

├── Body

├── Head

├── Hair

├── Face

│ ├── Eyes

│ ├── Nose

│ ├── Mouth

│ └── Brows

├── Clothing

│ ├── Shirt

│ ├── Pants

│ └── Shoes

├── Equipment

├── Accessories

└── Materials

Every node can be swapped independently.

17. Asset Import Pipeline (Probably the biggest omission)

Right now the document assumes assets already exist.

Eventually you'll need an import pipeline.

Import GLB

↓

Validate

↓

Auto Scale

↓

Generate Preview

↓

Assign Slot

↓

Assign Tags

↓

Compress

↓

Store Metadata

↓

Ready to Use

That turns your app into a true content creation tool rather than just a viewer.

One architectural change I'd make

There's one thing I'd rethink from the current design. The document centers the runtime around a CharacterSystem class that directly loads meshes, applies morphs, and attaches props.

As your library grows, that class will become responsible for too many concerns.

I'd split it into dedicated managers:

Character Creator

├── CharacterManager
│      Builds characters from DNA
│
├── AssetManager
│      Loads and caches assets
│
├── SlotManager
│      Handles attachments and compatibility
│
├── MaterialManager
│      Controls shared materials and colors
│
├── MorphManager
│      Applies body and face sliders
│
├── ExportManager
│      Creates GLB/FBX/JSON/PNG exports
│
├── PresetManager
│      Handles templates and random generation
│
└── ValidationManager
       Verifies imported assets

This separation makes it much easier to add new asset types, export formats, and editing features without turning one class into a maintenance bottleneck.


====================================================================================================================================================================================================
1. Versioned Asset Library

Assets change over time.

Hair 01

v1
v2
v3

Old characters shouldn't suddenly break because Hair 01 changed.

Every asset should have

UUID
Version
Author
Created
Modified
Tags
Dependencies
License
2. Asset Dependency Graph

Example

Knight Armor

↓

Requires

Knight Boots

Knight Gloves

Knight Helmet

If a user deletes Knight Armor

the app warns

This asset is used by 18 saved characters.
3. Undo / Redo

Probably one of the most overlooked features.

Ctrl+Z

Ctrl+Y

Every customization should be reversible.

Changing

color
hair
morphs
equipment

should all be undoable.

4. History Timeline

Imagine Photoshop history.

Imported Hair

↓

Changed Skin

↓

Adjusted Nose

↓

Added Helmet

↓

Changed Shirt

You can jump backwards.

5. Workspace Layouts

Some people like

Character

Large

Controls

Right

Others

Controls

Left

Character

Center

Remember layout.

6. Plugin Architecture

This is HUGE.

Instead of hardcoding everything

Imagine

Plugins

Pokemon Pack

Fantasy Pack

Sci-Fi Pack

Cyberpunk Pack

Anime Pack

Each plugin simply drops assets into folders.

No code.

7. Smart Asset Discovery

Instead of

Hair

↓

300 entries

Search

Long

Blonde

Female

Fantasy

Braided
8. Procedural Variations

Imagine

Hair

↓

Generate 30 color variations

Automatically.

Same for

shirts

pants

armor

9. Character Validation

Before export

✓ Missing textures

✓ Missing bones

✓ Non-manifold geometry

✓ Too many triangles

✓ Invalid UVs

✓ Duplicate materials

✓ Missing morphs

Think of it as

Game Ready Score

98/100
10. Export Validation

Mixamo is picky.

Unity is picky.

Before export

Scale OK

Forward Axis OK

Rig OK

Animations OK

Bone Count OK

Materials OK

Normals OK

11. Asset Browser

Instead of folders.

Imagine

Cards

Hair

(image)

Short Hair

Fantasy

324 triangles

GLB
12. Thumbnail Generator

Every imported asset automatically gets

PNG Preview

Animated Preview

Turntable GIF

13. Favorites

You'll end up using the same hairstyles constantly.

⭐ Favorite

Hair 03

Hair 18

Eyes 05
14. Collections
Fantasy

SciFi

Villagers

NPC

Enemies

Heroes
15. Character Templates

Different than presets.

Template means

Stylized Male

Stylized Female

Child

Dwarf

Elf

Goblin

Robot

Everything inherits from these.

16. Metadata Driven Everything

Instead of

if Hair01...

Everything becomes

metadata.json

Example

{
"id":"hair04",

"slot":"Hair",

"compatible":[
"male",
"female"
],

"hideSlots":[
"helmet"
],

"tags":[
"anime",
"fantasy"
]
}
17. Automatic Compatibility

The app should know

Helmet

↓

Hide Hair

↓

Show Beard

No code.

Just metadata.

18. Save Character DNA Separately

Never save

GLB

as the master.

Save

character.json

↓

Rebuild

↓

Export

Huge difference.

19. Random NPC Generator

This is one of my favorite ideas.

Generate

100 villagers

Each gets

random clothes
random colors
random morphs
random accessories

Then

Export All.

20. Rule Engine

Imagine

Age

↓

Old

↓

Automatically

Gray Hair

Wrinkles

Less Saturation

Or

Orc

↓

Tusks

↓

Green Skin

↓

Heavy Brows

No code.

Just rules.

21. Asset Baking

Eventually you'll want

15 Materials

↓

Bake

↓

1 Material

Unity loves this.

22. Atlas Generator
Hair Texture

Body Texture

Armor Texture

↓

Texture Atlas

↓

One Draw Call

Massive optimization.

23. Pose Library

Instead of always T-pose.

Preview

Idle

Wave

Run

Jump

Hero Pose

Crossed Arms

Makes assets easier to evaluate.

24. Lighting Presets
Studio

Sunset

Night

Fantasy

Dungeon

Cell Shaded

Makes screenshots look amazing.

25. Future AI Hooks (Optional)

Even if you never implement AI now, design extension points:

Describe Character

↓

Generate DNA

or

Reference Image

↓

Suggest Assets

Because your system is data-driven, these features can be layered on later without changing the core architecture.

The one thing I think almost everyone misses

If I were the architect from day one, I'd add one top-level subsystem that isn't in your current document at all:

Project

│

├── Asset Library

├── Character Library

├── Export Profiles

├── Style Guide

├── Validation

├── Rules Engine

├── Presets

├── Plugins

├── Thumbnail Cache

├── Metadata Database

├── Version History

└── User Workspace

Notice what's not in there?

Three.js.

Three.js becomes just the renderer.

That's actually how professional tools are built. Blender, Character Creator, and Unreal Editor all treat the rendering engine as just one subsystem. The editor itself is primarily about managing assets, metadata, rules, history, and user workflows.

My biggest recommendation

I think your vision has the potential to become something much larger than a character creator. If you keep it local-first, data-driven, and renderer-agnostic, you'll end up with a reusable Character Asset Studio.

The architecture I'd aim for would look like this:

Character Asset Studio

├── Project System
├── Asset Database
├── Character DNA System
├── Rules Engine
├── Style System
├── Import Pipeline
├── Validation Pipeline
├── Preview Renderer (Three.js)
├── Export Pipeline
├── Plugin System
├── Batch Processing
├── Asset Browser
├── Character Browser
├── Thumbnail Generator
├── Material Manager
├── Pose Manager
├── Camera Manager
├── Lighting Manager
└── Mixamo/Unity Integration

With that foundation, you aren't limited to making humanoid characters. The same architecture can later support creatures, vehicles, props, modular buildings, or any other game assets by defining new slot types, rules, and exporters rather than rewriting the application. I think that's the kind of flexibility worth designing for from the beginning.