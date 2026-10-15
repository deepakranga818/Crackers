# Image quality report

Measured by `python scripts/image_quality.py`. No image file is edited: photos are shown
whole, in one neutral frame. Framing cannot repair a photo, so the images below still
render small or poorly even though the cards are consistent. Please supply original,
single-product photos for them (and for the products with no photo).

- Images that fit the frame well: **37**
- Images flagged below: **14**
- Products with no photo: **2**

A photo is flagged when it is a wide strip (ratio 2.2:1 or more), a tall strip (0.6:1 or less),
below 300px on its short side, or fills less than half of the 4:3 phone frame.

| Product | Photo | Size | Ratio | Frame fill 4:3 / 16:10 | Why flagged |
|---|---|---|---|---|---|
| dc-002 POP-UP | 1 | 761×206 | 3.69 | 36% / 43% | wide strip; low resolution; fills only 36% of the phone frame |
| dc-004 15cm Ronak | 2 | 960×247 | 3.89 | 34% / 41% | wide strip; low resolution; fills only 34% of the phone frame |
| dc-005 18cm Pogo | 1 | 229×531 | 0.43 | 32% / 27% | tall strip; low resolution; fills only 32% of the phone frame |
| dc-010 G.C. Ashoka KS | 1 | 910×388 | 2.35 | 57% / 68% | wide strip |
| dc-010 G.C. Ashoka KS | 2 | 340×513 | 0.66 | 50% / 41% | fills only 50% of the phone frame |
| dc-020 2 Sound Cracker KS | 1 | 280×469 | 0.60 | 45% / 37% | tall strip; low resolution; fills only 45% of the phone frame |
| dc-022 Loose 50 piece Rathna | 2 | 351×589 | 0.60 | 45% / 37% | tall strip; fills only 45% of the phone frame |
| dc-024 2000 Laddi RL | 1 | 960×307 | 3.13 | 43% / 51% | wide strip; fills only 43% of the phone frame |
| dc-032 Rocket Bomb KS | 1 | 297×523 | 0.57 | 43% / 35% | tall strip; low resolution; fills only 43% of the phone frame |
| dc-033 2 Sound Rocket KS | 1 | 329×564 | 0.58 | 44% / 36% | tall strip; fills only 44% of the phone frame |
| dc-034 Lunik Ex. Coro | 1 | 229×501 | 0.46 | 34% / 29% | tall strip; low resolution; fills only 34% of the phone frame |
| dc-035 Zitiwala Rocket Coro | 1 | 206×578 | 0.36 | 27% / 22% | tall strip; low resolution; fills only 27% of the phone frame |
| dc-039 7 Shot Special | 1 | 296×508 | 0.58 | 44% / 36% | tall strip; low resolution; fills only 44% of the phone frame |
| dc-044 AK 47 MR | 1 | 960×427 | 2.25 | 59% / 71% | wide strip |

## Products with no photo

- dc-045 60 Shot: the card shows “Product image coming soon”.
- dc-046 100 Shot: the card shows “Product image coming soon”.

## Not detectable by measurement

Some photos are multi-panel collages or screenshots of several cards (visually confirmed for
dc-001 and dc-002). A collage can have a normal aspect ratio, so it is not flagged above;
it needs the owner's original single-product photo, or a faithful, documented crop.
Public reuse rights for all photos are still unconfirmed (see docs/LAUNCH.md).
