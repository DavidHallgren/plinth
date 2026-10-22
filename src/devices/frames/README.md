# Device frame assets

These PNGs are official Apple device-frame assets supplied for use in Plinth. Each file has a transparent display aperture sized to the corresponding screenshot resolution:

- iPhone 17 Pro Max: 1470 × 3000 frame with a 1320 × 2868 aperture
- iPhone 17 Pro and iPhone 17: 1350 × 2760 frame with a 1206 × 2622 aperture
- iPhone Air: 1380 × 2880 frame with a 1260 × 2736 aperture

Plinth draws the project screenshot beneath the selected frame in the shared `SceneRenderer`. The existing iPhone 17 and Air frames are portrait; their landscape compositions can rotate the editable device element.

## iPhone Duo

Downloaded on 2026-10-22 from Apple's [iPhone Duo bezel package](https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-Duo.dmg). The eight bundled PNGs are byte-for-byte copies of the package's `PNG/iPhone Duo - {Night Sky,Star White} - {view}.png` files. Filenames are normalized for the repository. The package's license is preserved in [Apple-Design-Resources-License.rtf](Apple-Design-Resources-License.rtf).

| Apple view | Preset | PNG dimensions | Aperture origin | Screenshot dimensions |
| --- | --- | --- | --- | --- |
| Outer Closed Portrait | `iphone-duo-outer` | 1574 × 2194 | 88, 80 | 1398 × 2034 |
| Outer Closed Landscape | `iphone-duo-outer-landscape` | 2194 × 1574 | 80, 88 | 2034 × 1398 |
| Inner Open Portrait | `iphone-duo-inner` | 2247 × 3093 | 120, 120 | 2007 × 2853 |
| Inner Open Landscape | `iphone-duo-inner-landscape` | 3093 × 2247 | 120, 120 | 2853 × 2007 |

Each orientation uses Apple's dedicated artwork, with no image rotation or stretching during asset preparation. Screenshot clipping stays beneath the opaque bezel; the folded display requires asymmetric corner clipping. Hardware details come from the PNG, with no synthetic camera overlay. Duo frames remain visible when `showCamera` is false. Editor, thumbnails, and export use the same frame source, geometry, and image-readiness checks.

## iPad Pro M5, iPad Air M4, and iPhone 18

Downloaded on 2026-10-22 from Apple's [iPad Pro M5 package](https://devimages-cdn.apple.com/design/resources/download/Bezel-iPad-Pro-%28M5%29.dmg), [iPad Air M4 package](https://devimages-cdn.apple.com/design/resources/download/Bezel-iPad-Air-%28M4%29.dmg), and [iPhone 18 package](https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-18.dmg). The iPhone 18 package contains Pro and Pro Max; no base-model frame is included.

The 40 bundled PNGs are byte-for-byte copies with normalized repository filenames. Original package paths are:

- `PNG/iPad Pro (M5) {11,13}" - {Space Black,Silver} - {Portrait,Landscape}.png`
- `PNG/iPad Air {11,13}" (M4) - {Space Gray,Blue,Purple,Starlight} - {Portrait,Landscape}.png`
- `PNG/iPhone 18 {Pro,Pro Max}/iPhone 18 {Pro,Pro Max} - {Black,Burgundy,Glacier,Silver} - {Portrait,Landscape}.png`

All three packages include the same byte-identical [Apple Design Resources License](Apple-Design-Resources-License.rtf) already preserved here and copied into standalone builds.

| Preset | PNG dimensions | Aperture origin | Screenshot dimensions |
| --- | --- | --- | --- |
| `iphone-18-pro-max` | 1470 × 3000 | 75, 66 | 1320 × 2868 |
| `iphone-18-pro-max-landscape` | 3000 × 1470 | 66, 76 | 2868 × 1320 |
| `iphone-18-pro` | 1350 × 2760 | 72, 69 | 1206 × 2622 |
| `iphone-18-pro-landscape` | 2760 × 1350 | 69, 72 | 2622 × 1206 |
| `ipad-pro-m5-13` | 2300 × 3000 | 118, 124 | 2064 × 2752 |
| `ipad-pro-m5-13-landscape` | 3000 × 2300 | 124, 118 | 2752 × 2064 |
| `ipad-pro-m5-11` | 1880 × 2640 | 106, 110 | 1668 × 2420 |
| `ipad-pro-m5-11-landscape` | 2640 × 1880 | 110, 106 | 2420 × 1668 |
| `ipad-air-m4-13` | 2300 × 2980 | 126, 124 | 2048 × 2732 |
| `ipad-air-m4-13-landscape` | 2980 × 2300 | 124, 126 | 2732 × 2048 |
| `ipad-air-m4-11` | 1900 × 2620 | 130, 130 | 1640 × 2360 |
| `ipad-air-m4-11-landscape` | 2620 × 1900 | 130, 130 | 2360 × 1640 |

Each preset has a matching canvas preset at its native screenshot size. Portrait and landscape use separate original files. In particular, the Pro Max landscape aperture starts at y=76, one pixel beyond a simple rotation of the portrait aperture. Clipping radii stay inside the opaque artwork: 150 native pixels for iPhone 18, 40 for iPad Pro, and 20 for iPad Air. Cameras and Dynamic Islands come from the PNG, and the bezel stays visible with `showCamera: false`. Matching Cover and Contain screenshots fill the measured apertures without cropping or padding.

## MacBook Air M5 and MacBook Pro M5

Downloaded on 2026-10-22 from Apple's [MacBook Air M5 package](https://devimages-cdn.apple.com/design/resources/download/Bezel-MacBook-Air-M5.dmg) and [MacBook Pro M5 package](https://devimages-cdn.apple.com/design/resources/download/Bezel-MacBook-Pro-M5.dmg). The 12 bundled PNGs are byte-for-byte originals with normalized repository filenames:

- `PNG/MacBook Air M5 {13,15}-inch {Sky Blue,Silver,Starlight,Midnight}.png`
- `PNG/MacBook Pro M5 {14,16}-inch {Space Black,Silver}.png`

Both packages include the byte-identical [Apple Design Resources License](Apple-Design-Resources-License.rtf) already preserved here.

| Preset | PNG dimensions | Aperture origin | Screenshot dimensions |
| --- | --- | --- | --- |
| `macbook-air-m5-13` | 3400 × 2240 | 420, 288 | 2560 × 1664 |
| `macbook-air-m5-15` | 3540 × 2300 | 329, 218 | 2880 × 1864 |
| `macbook-pro-m5-14` | 3860 × 2540 | 418, 288 | 3024 × 1964 |
| `macbook-pro-m5-16` | 4260 × 2840 | 402, 303 | 3456 × 2234 |

These front-facing landscape frames include the full laptop body and transparent exterior margins. Insets are measured from the original PNG bounds, not from the body edge. The shared screenshot clip uses 20 native pixels at the top corners and zero at the square bottom corners, keeping the curved edges beneath opaque artwork. The notch and camera are provided by the PNG, which stays visible with `showCamera: false`. Matching native screenshots fill the aperture in both Cover and Contain. MacBooks use the `laptop` frame kind, with no browser-window header. The PNGs are neither resized nor modified during asset preparation.

These Apple-branded frame assets are third-party materials and are not covered by the repository’s MIT license. They are sourced from [Apple Design Resources](https://developer.apple.com/design/resources/), under Product Bezels. Apple and iPhone are trademarks of Apple Inc., registered in the U.S. and other countries and regions. Review Apple’s applicable terms before redistributing them outside Plinth.
