---
description: Diagnose GeoJSON and Cesium polygon artifacts without destructive edits
agent: plan
---

Inspect the current dataset and rendering code. Identify candidate features responsible for visual artifacts. Check ring closure, duplicate points, winding, coordinate ranges, suspicious longitude jumps, hole structure, disconnected rings, and likely Cesium triangulation limitations. Do not modify the dataset. Return feature indices, names, evidence, and a ranked set of minimal fixes.
