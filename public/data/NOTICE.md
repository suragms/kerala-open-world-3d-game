# Geographic data and asset notices

## OpenStreetMap

Roads, building footprints, water features, rail alignments, settlements, transport records and most landmark coordinates: **© OpenStreetMap contributors**, available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). See [OpenStreetMap copyright and contributors](https://www.openstreetmap.org/copyright).

The derived geographic database is distributed as the JSON/GeoJSON files in this directory under ODbL 1.0, retaining source feature identities and/or per-place source URLs. Import/validation programs are provided in `scripts/`. Preserve attribution and applicable ODbL obligations when distributing this data or derived databases. Application code and original artwork are separate works; this notice does not assign them a new license.

Snapshot retrieved on 16 October 2026. OSM can be incomplete or incorrect and is not a live transport feed. Verification means a source record was checked against district geometry; it does not mean survey-grade accuracy.

## District boundaries

Fourteen district polygons were selected from **geoBoundaries IND ADM2**, boundary ID `IND-ADM2-76128533`, year represented **2021**. Source: **Pathways Data Pvt. Ltd., lgdirectory.gov.in**, supplied by geoBoundaries. Source metadata identifies the license as **Open Data Commons Open Database License 1.0**. Full metadata: `boundary-source.json`.

- [geoBoundaries API](https://www.geoboundaries.org/api.html)
- [Exact release source](https://github.com/wmgeolab/geoBoundaries/tree/9469f09/releaseData/gbOpen/IND/ADM2)

These are generalized historical administrative polygons, not cadastral or present-day surveyed boundaries. A sourced Kollam Beach point lies 57 m outside the generalized coastal edge; `validation-report.json` records the exception. Its coordinate has not been moved to hide it.

## Kerala Tourism reference

The Aranmula Parthasarathy Temple coordinate is an attributed factual coordinate from [Kerala Tourism's temple reference](https://www.keralatourism.org/temples/pathanamthitta/aranmula-parthasarathy): 9.328000 N, 76.687614 E. The register explicitly identifies this source. Other Tourism pages provided descriptive geographic/architectural references. No Tourism photographs, prose, textures or 3D models are redistributed.

## Original assets and dependencies

Character meshes, buildings, landmark interpretations, vehicles, vegetation, texture noise and synthesized ambient/engine audio were authored for this project. They are approximate original game assets. No proprietary GTA content, Google imagery/geometry or third-party character-model pack is included.

Three.js and React retain their dependency licenses. Lucide icons retain their ISC license. Google Fonts serves DM Sans and Manrope, both under SIL Open Font License 1.1; system fonts provide fallbacks. Font binaries are not stored in this directory.

- [DM Sans license](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt)
- [Manrope license](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt)

No affiliation or endorsement by a landmark operator, transport provider or data contributor is implied.
