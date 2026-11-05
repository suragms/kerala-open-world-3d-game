# Generated artifacts and geographic reproducibility

Audit at Phase 9 baseline: 235 tracked files under output/. Raw Phase 8 source caches occupy 203,210,423 bytes (71 files); historical browser captures/reports occupy approximately 76 MB (160 files); four other import/research outputs occupy 2,513,593 bytes. Screenshot sizes can vary when regenerated.

- `public/data/` is required runtime source data. Keep all datasets, ODbL attribution, fidelity registers and importer scripts in Git.
- `output/phase8-source/` contains raw responses used by importers. Keep these existing reproducibility inputs until a versioned, checksummed replacement archive is actually published and verified. No source files were deleted in this audit.
- Existing `output/playwright/` files are historical evidence linked from Phase 8 documentation. Retain that evidence; do not overwrite it in new runs.
- New browser captures, traces, logs, HTML snapshots and per-run results belong in ignored `output/playwright/phase9*/` or `output/playwright/phase10*/` directories. The Node runner redirects old workflow screenshot names into its run directory.
- CI uploads browser diagnostics as a downloadable GitHub Actions artifact with 14-day retention, including failures. These are generated evidence, not application assets.
- `dist/`, `dist-subdirectory/`, test reports, import data-cache and build metadata are ignored. The test runner owns and closes its local server and browsers.

No history rewrite or external archive upload was performed. A future source-cache move must preserve exact downloaded responses, retrieval metadata, licensing and checksums; deleting them because they are generated would reduce reproducibility.
