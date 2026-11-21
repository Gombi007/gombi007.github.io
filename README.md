# 3D Blender Preview

An interactive browser walkthrough of the furnished 3D Szoba room. The geometry in `assets/room.glb` was exported from the Blender scene at its original scale. The room measures 2.90 × 4.10 m, with 2.60 m walls.

The [editable room](blender/3D%20Szoba%20V56.blend) is saved in `blender/`. Open **04 · Dimensions** in Blender for the annotated floor plan.

The [editable player](blender/Walkthrough%20Player.blend) is a separate Blender file created with the MakeHuman Plugin for Blender (MPFB). The character is 1.75 m tall barefoot and modeled on an estimated body mass of 80 kg. The browser uses the rigged export at `assets/player.glb`.

## Run locally

Serve this folder over HTTP, then open [localhost:8000](http://localhost:8000) in a WebGL 2 browser.

```sh
python -m http.server 8000
```

Select **Play** to enter the room. Use **WASD** or the arrow keys to walk, **Shift** to run, the mouse to look, **V** to switch cameras, and **Esc** to pause. Press **E** to switch between daylight and the ceiling lamp at night. If the browser declines pointer lock, drag to look. On a touch screen, use the joystick to move, drag to look, and tap the lighting button to switch lighting.

Use **EN** or **HU** to switch languages. Press **Q** during play to toggle measurement lines and labels. Use **1–5** to select light grey, blue, green, medium-dark grey, or dark grey walls.

The repo root can be served directly by GitHub Pages from the `main` branch. Three.js r180 and the needed addons are included under `vendor/` with their MIT license. The site makes no third-party requests at runtime.

[Original V56 demo](https://nagynorbertbf-sudo.github.io/3D-szoba/threejs-szoba-v56-demo.html)
