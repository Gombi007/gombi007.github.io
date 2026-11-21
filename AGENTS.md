# 3D Szoba walkthrough

This repository is a static first- and third-person room tour. Recreate the published tour by serving the repository with its checked-in assets. Use the Blender files as the editable source for scene changes and the checked-in GLBs as the reference for the exact runtime geometry, materials, and metadata.

## Run and navigate

Run from the repository root and open `http://localhost:8000/` in a WebGL 2 browser.

```sh
python -m http.server 8000
```

The page uses native ES modules, a Three.js r180 import map, and bundled add-ons in `vendor/`. It runs directly over HTTP with the repository files and makes no third-party requests during play. The vendor license is in `vendor/LICENSE`.

| File | Responsibility |
| --- | --- |
| `index.html`, `style.css` | Page, stage, play and pause menus, responsive control guides, and keycaps |
| `room.js` | GLB loading, lights, cameras, inputs, room state, material presets, and rendering |
| `movement.js` | Swept player movement and collision against furniture and architecture |
| `measurements.js` | Furniture-local frames, depth-tested rulers, and localized canvas labels |
| `translations.js` | Hungarian and English UI copy, keycap markup, and number formatting |
| `tour-audio.js` | Web Audio lifecycle, music toggle, and distance-based footsteps |
| `assets/dimensions.json` | Measured dimensions, bounds, and oriented furniture data in glTF coordinates |
| `assets/room.glb`, `assets/player.glb` | Runtime models with embedded textures |
| `assets/room-tour.mp3`, `assets/laminate-steps.wav` | Original soundtrack loop and laminate footfalls |
| `blender/3D Szoba V56.blend` | Editable room, passage, furniture, and placed props |
| `blender/Walkthrough Player.blend` | Editable MakeHuman character, packed textures, and rig |
| `blender/Miniature Forklift.blend` | Editable forklift and three pallets, with separate studio lighting |

## Gameplay and defaults

Start with **Play**. The player spawns in the passage at approximately `(1.45, 0.01, -2.418)` meters in glTF coordinates, facing the door toward positive Z. The entrance reset restores this pose. Hungarian, first person, wall preset **4**, the original warm laminate, and night lighting are the initial defaults. Music starts when play begins. The language switcher remembers the selected language.

| Input | Action |
| --- | --- |
| **WASD** or arrow keys, **Shift** | Move and run |
| Mouse, or drag when pointer lock is unavailable | Look around |
| **V**, **F**, **Esc** | Switch first/third person, toggle fullscreen, pause |
| **Q** | Toggle the in-game measurement rulers and labels |
| **E** | Toggle daylight and the ceiling lamp at night |
| **M** or the Music button | Toggle the soundtrack independently of footsteps |
| **1–5** | Light grey, blue, green, medium-dark grey, or dark grey paint |
| **6–9** | Cool, neutral, gently warm, or original warm laminate |

Touch input uses the on-screen joystick and drag-to-look. During play, the touch-only controls switch cameras, cycle wall and floor presets, and request native fullscreen with a viewport-filling fallback. The touch movement hint closes after one second. Keep the three desktop control groups, individual **W**, **A**, **S**, **D** and number keycaps, and translated labels in both languages when changing shortcuts.

The player is a 1.75 m barefoot male avatar modeled at an estimated 80 kg. The runtime uses a 1.64 m eye height, 1.55 m/s walking speed, and 2.35 m/s running speed. Preserve the `Player Rig` and exported `Idle` and `Walk` clips. The `Walk` loop lasts approximately 1.04 seconds. Third-person camera collision shortens the camera distance immediately at obstacles and eases it back out while preserving mouse yaw and pitch.

## Layout and appearance

Use meters at unit scale 1. Blender is Z-up and the glTF world is Y-up. A Blender world position `(x, y, z)` becomes `(x, z, -y)` in the runtime. The positive-Z end of the room contains the window. The width runs along X.

| Element | Target |
| --- | --- |
| Room interior | 2.90 m wide, 4.10 m deep, 2.60 m high |
| Entrance passage | 2.90 m wide, 4.00 m clear depth, 2.60 m high. The clear span runs from Z = −4.03 to −0.03, and the floor extends to the bedroom threshold at Z = 0. |
| Entry | 0.94 m nominal frame opening, 2.00 m door leaf, with the open door and header retained |
| Window | 1.70 × 1.40 m triple glazing, mounted curtain track and linen panels, with the gas convector below |
| Cabinet | Topeshop Malwa 1D3S/BA, 0.80 × 0.40 × 0.75 m, with an 8 cm gap from the bed |
| Corner shelving | 0.90 × 0.36 × 0.44 m at 45° around the runtime Y axis. The toy forklift and three pallets sit on the top board. |
| Displays | 43-inch wall-mounted TV and 27-inch desk monitor beside the gaming PC, keyboard, and mouse |
| Floor and skirting | Warm greige oak laminate with staggered boards and matching pearl-grey skirting, interrupted at the doorway |

Read `assets/dimensions.json` for precise placement and the remaining furniture sizes. Furniture `dimensions` are width, depth, height. Door and window dimensions are width and height. Furniture `boxes` are in glTF world space. For the corner shelving, `rotationY` and the nominal dimensions define its local collision and ruler frame. Keep the room and passage measurement bounds separate. The rulers are inset from surfaces, and the cabinet name appears above its yellow width ruler. Keep decor, including the forklift, independent of the six furniture collision groups.

The monitor has a packed DOOM gameplay still. The TV has a packed static chart of NVDA closing prices from Nov 16–20, 2026. Both textures are emissive on their screen faces. Reuse the packed images to reproduce the current scene. [DOOM source](https://www.gog.com/en/game/doom_doom_ii) · [NVDA data source](https://stockanalysis.com/stocks/nvda/history/)

## Blender and GLB workflow

Blender 4.2 was used for the editable files. The room includes `01 · Room cutaway`, `02 · Walkthrough`, `03 · Evening`, and `04 · Dimensions`. Edit shared collections to keep the views in sync. Use `02 · Walkthrough` for the runtime export and `04 · Dimensions` for the annotated plan. The player was made with MPFB. Use the included rigged mesh and packed textures as the source when retaining the current avatar.

1. Open the editable source and inspect the existing object hierarchy. Move furniture using its named `Move …` root. Update relevant plan annotations and `assets/dimensions.json` if geometry or clearances change.
2. For an isolated geometry change, export the selected assembly to a staging GLB with its parents and mesh children, modifiers applied, materials and textures, and custom properties. Use glTF binary, +Y up, and embedded images. Keep the room export a single scene. Runtime cameras and lighting are created in `room.js`. The player GLB is exported separately with its skinned mesh, textures, and both animation clips.
3. Integrate changed assemblies into a copy of the shipped room GLB. Preserve unrelated nodes, transforms, materials, textures, and custom properties. If merging GLB data directly, remap scene and node references, meshes, materials, textures, images, samplers, accessors, and buffer views, and rebase byte offsets in the aligned binary buffer. A transformed assembly should occupy the same position in Blender, the exported room, and the measurement data.
4. For a full room export, use the shipped GLB as the material and metadata reference. Transfer or rebake the existing UV textures for procedural materials into glTF-compatible maps. Preserve the glass and mirror roles, the screen emission maps, and both laminate material names. Blender's editable room currently omits some runtime tags. Restore `collision` on `Move bed`, `Move wardrobe`, `Move desk`, and `Move shelves`, and `mirror` on `P&B · Full-length mirror` if rebuilding from the editable file.
5. Reopen the staged GLB in Blender, check the modified geometry and clearances, and verify the runtime contracts below before replacing the published asset.

### Runtime metadata

`roomRole` is a glTF node custom property exported in `extras`. Keep these contracts if rebuilding or re-exporting.

| Role | Nodes and behavior |
| --- | --- |
| `floor` | `Floor slab`, the bedroom reference bounds |
| `passageFloor` | `Passage floor`, the passage bounds and spawn reference |
| `collision` | Exactly six furniture roots named `Move bed`, `Move wardrobe`, `Move desk`, `Move shelves`, `Move heater`, and `Move cabinet`. The suffix is the measurement ID. |
| `enclosure` | Bedroom and passage walls, including the section above the door. These supply collision bounds and receive wall paint changes. |
| `architecture` | Door components and passage ceiling. The camera checks overhead objects, while walking ignores objects above head height. |
| `glass` | The six window panes, replaced with the runtime glass material |
| `mirror` | `P&B · Full-length mirror`, replaced with the runtime reflector |

Floor presets tint the materials named `Laminate · Warm natural grey oak` and `Laminate · Taupe shadow joints` in both spaces. Keep these names and the embedded oak atlas. The room ceiling and main lamp are runtime meshes. The passage has its own modeled ceiling and light fixture. Keep the room and passage floor bounds separate when sizing the room ceiling.

### Sound assets

Use the included 64-second stereo MP3 for the original light trance loop. The footstep bank is a 24 kHz, 16-bit mono WAV with six consecutive 0.30-second slots. Each sample plays for 0.225 seconds and fades to silence before its slot ends. Keep those offsets synchronized with `tour-audio.js` if replacing the bank. Reuse the checked-in binaries for matching sound.

Audio starts after the play gesture, pauses with the tour, and uses separate music and footstep gains. The first footfall follows actual movement, and the steady stride derives from walking speed and the animation duration. Brief interruptions preserve the step phase. Keep footsteps driven by distance after collision resolution so they stay silent against a wall.

## Verify and publish

- For geometry changes, check the editable Blender scene and reimport the staged GLB. Compare the model extents with `dimensions.json`, verify the passage floor meets the room floor, and confirm the player can cross the open doorway in both directions.
- Check both cameras, ruler clearance, both languages, wall and floor key ranges, night/day lighting, music mute, and footsteps against a wall when the change affects them. Use Blender checks and offline JavaScript checks when browser testing is out of scope.
- Run `node --check` on changed JavaScript files and `git diff --check`. The plain static page is the application entry point.
- To refresh cached files on GitHub Pages, bump the `?v=` suffix at each import, asset URL, or stylesheet link that references a changed file. When changing `translations.js`, keep the version in both `room.js` and `measurements.js` in sync. Publish source changes and their corresponding binaries together.
- The repository root on `main` is the GitHub Pages source, with `.nojekyll` checked in. When publishing, verify that Pages serves the expected files over HTTP. [Repository](https://github.com/Gombi007/gombi007.github.io) · [Live tour](https://gombi007.github.io/)

The legacy layout reference is the original V56 demo. Use the checked-in models and dimensions for the current layout. [Original demo](https://nagynorbertbf-sudo.github.io/3D-szoba/threejs-szoba-v56-demo.html)
