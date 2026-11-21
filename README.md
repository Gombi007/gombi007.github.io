# 3D Blender Preview

An interactive browser walkthrough of the furnished 3D Szoba room. The geometry in `assets/room.glb` was exported from the Blender recreation of the V56 room. The browser uses that asset for the cutaway, first-person views and furniture collision bounds. Web-compatible textures, lighting and the mirror are set up for real-time rendering.

## Run locally

Serve this folder over HTTP, then open [localhost:8000](http://localhost:8000) in a WebGL 2 browser.

```sh
python -m http.server 8000
```

Select **Play** to enter the room. On a computer, use **WASD** or the arrow keys to walk, the mouse to look and **Esc** to pause. If the browser declines pointer lock, drag to look. On a touch screen, use the joystick and drag the view. **Evening** switches the lighting.

The repo root can be served directly by GitHub Pages from the `main` branch. Three.js r180 and the needed addons are included under `vendor/` with their MIT license. The site makes no third-party requests at runtime.

[Original V56 demo](https://nagynorbertbf-sudo.github.io/3D-szoba/threejs-szoba-v56-demo.html)
