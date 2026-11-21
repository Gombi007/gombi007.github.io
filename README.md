# 3D Blender Preview

An interactive browser walkthrough of the furnished 3D Szoba room. The geometry in `assets/room.glb` was exported from the Blender scene at its original scale. The room measures 2.90 × 4.10 m, with 2.60 m walls. The browser uses the Blender export for the cutaway, first-person view, and furniture collision bounds.

The [editable room](blender/3D%20Szoba%20V56.blend) is saved in `blender/`. Open **04 · Dimensions** in Blender for the annotated floor plan.

## Run locally

Serve this folder over HTTP, then open [localhost:8000](http://localhost:8000) in a WebGL 2 browser.

```sh
python -m http.server 8000
```

Select **Play** to enter the room. On a computer, use **WASD** or the arrow keys to walk, the mouse to look and **Esc** to pause. If the browser declines pointer lock, drag to look. On a touch screen, use the joystick and drag the view. **Evening** switches the lighting.

Use **EN** or **HU** to switch languages. Select **Dimensions** or press **M** to show the measurements generated from the Blender scene. Select any measurement to highlight its location, and hide the panel when you are done.

The repo root can be served directly by GitHub Pages from the `main` branch. Three.js r180 and the needed addons are included under `vendor/` with their MIT license. The site makes no third-party requests at runtime.

[Original V56 demo](https://nagynorbertbf-sudo.github.io/3D-szoba/threejs-szoba-v56-demo.html)
