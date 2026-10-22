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

These Apple-branded frame assets are third-party materials and are not covered by the repository’s MIT license. They are sourced from [Apple Design Resources](https://developer.apple.com/design/resources/), under Product Bezels. Apple and iPhone are trademarks of Apple Inc., registered in the U.S. and other countries and regions. Review Apple’s applicable terms before redistributing them outside Plinth.
