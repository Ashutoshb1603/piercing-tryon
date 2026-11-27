# Nose Piercing Try-On

**Live demo:** https://ashutoshb1603.github.io/piercing-tryon/

Live, in-browser try-on for **nose pins (studs), nostril rings and septum rings**. Built on MediaPipe Face Landmarker; no server, and the video never leaves the device.

## Catalogue
| Nose pin | Nose ring | Septum |
|---|---|---|
| Solitaire diamond, Kundan laung (flower), gold ball, pearl, sapphire bezel, emerald bezel | Classic gold hoop, silver captive-bead hoop, twisted rose-gold hoop, crystal hoop, bridal nath with pearl ear chain | Gold clicker, silver horseshoe, crystal clicker, oxidised clicker with swinging drops |

You can wear one of each at once: a pin, a ring and a septum piece. Pins and rings go on the left, right or both nostrils. When a pin and a ring share a nostril, the ring drops lower and further back, like a real double piercing.

## How it works
1. **Tracking:** MediaPipe Face Landmarker (478 landmarks) with One-Euro smoothing.
2. **Face fit:** every piece is modelled in MediaPipe's *canonical face* space (real centimetres). Each frame, a weighted least-squares affine fit maps the canonical face onto the live landmarks, with nose landmarks weighted ×3. Pieces are then pinned to their exact anatomical anchor:
   - nostril: on the ala, between landmarks 48/166 (278/392 on the other side);
   - septum: inside the columella, behind 94/19/2.
3. **Real sizes:** stud diameters and ring gauges/diameters are in mm, so they scale to each person's face.
4. **Occlusion:**
   - every point of every piece is ray-tested against the live face mesh (532 triangles around the nose and mouth), so jewelry hides behind the nose tip when you turn your head;
   - anatomical rules handle the hidden parts: the hoop passing inside the nostril, and the top third of the septum ring inside the nose.
5. **Look:**
   - metal tube shading with a lit side, specular glints, rope twist and contact shadows;
   - faceted diamond with fire and twinkle;
   - pearls and gems;
   - colour and brightness matched to the light on your skin, sampled every few frames;
   - a pendulum for the swinging drops and the nath pendant.
6. **Tools:**
   - hold-to-compare (or hold **C**);
   - zoom close-up on the nose;
   - snapshot PNG;
   - photo upload mode;
   - mirror toggle;
   - tracking overlay (fit points, occlusion mesh, anchor normals).

## Run locally
The page uses ES modules and the camera, so serve it over `http://localhost` or HTTPS:
```bash
python3 -m http.server 8080   # then open http://localhost:8080
```
GitHub Pages works as-is: Settings → Pages → deploy from the `main` branch, root folder.

## Files
- `index.html`, `styles.css`: UI
- `app.js`: camera, tracking, face fit, occlusion, view transform, UI state
- `render.js`: anatomy anchors, catalogue and all jewelry rendering
- `mesh-data.js`: MediaPipe canonical face model (vertices + triangles, Apache-2.0)

Self-hosting the model: `?wasm=<path-to-tasks-vision-wasm>&model=<path-to-face_landmarker.task>`.

## Known limits
- Hands or fingers covering the nose don't hide the jewelry yet. The eye-segmentation approach from the lens try-on would fix this.
- Placement uses an average nose shape. The Height and Front/back sliders let each user fine-tune it.
