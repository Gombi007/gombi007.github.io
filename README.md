# 3D Szoba Walkthrough

Explore a furnished Blender room in first or third person. The room measures **2.90 × 4.10 m**, with **2.60 m** walls. Select **Play** to start in the **2.90 × 4.00 m** entrance passage, then walk through the open door. [Play the walkthrough](https://gombi007.github.io/)

The tour starts in Hungarian with night lighting, wall color **4**, and the original warm laminate floor. Use **EN** or **HU** to change the language. Original laminate footsteps and a royalty-free light trance loop play during the tour.

## Run locally

From the repository root, start a local HTTP server. Then open the tour in a WebGL 2 browser. [Local walkthrough](http://localhost:8000/)

```sh
python -m http.server 8000
```

## Controls

| Input | Action |
| --- | --- |
| **WASD** or arrow keys | Walk |
| **Shift** | Run |
| Mouse | Look around, or drag if pointer lock is unavailable |
| **V** | Switch between first and third person |
| **F** | Toggle fullscreen |
| **Esc** | Pause |
| **Q** | Show or hide measurement rulers and labels |
| **E** | Switch between daylight and night lighting |
| **M** | Toggle music while keeping footsteps audible |
| **1–5** | Select light grey, blue, green, medium-dark grey, or dark grey walls |
| **6–9** | Change the laminate from cool to warm. **9** restores the original finish. |

On a touch screen, use the joystick to move and drag to look around. Tap **FPS/TPS** to switch views, **Wall** or **Floor** to cycle colors, and the fullscreen icon to expand the tour. The lighting and **Music** buttons also work by touch. The in-game movement hint closes after one second.

## Blender files

- The editable room includes the passage, furniture, and placed props. Open **04 · Dimensions** in Blender for the annotated floor plan. [3D Szoba V56.blend](blender/3D%20Szoba%20V56.blend)
- The MakeHuman player is 1.75 m tall barefoot and modeled at an estimated 80 kg. The tour uses the rigged export in `assets/player.glb`. [Walkthrough Player.blend](blender/Walkthrough%20Player.blend)
- The yellow miniature forklift and three pallets on the corner shelf are also available as a separate editable model. [Miniature Forklift.blend](blender/Miniature%20Forklift.blend)

The tour uses `assets/room.glb` for the scene and `assets/dimensions.json` for its measurements. The recreation guide covers the file layout, Blender export workflow, and runtime metadata to preserve. [Recreation guide](AGENTS.md)

The repository root on `main` is published through GitHub Pages. Bundled Three.js r180 and its add-ons are available under the MIT license, and the walkthrough makes no third-party requests during play. [Three.js license](vendor/LICENSE) · [Original V56 demo](https://nagynorbertbf-sudo.github.io/3D-szoba/threejs-szoba-v56-demo.html)
