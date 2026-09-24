# Imported example assets

These files were imported from the user's generated example directory and normalized to 1024×1024 RGBA PNGs. The original generator files, when preserved, are under `source/`; processed files are grouped by type below.

They are intentionally kept in a separate `imported/db` namespace until visual alignment and character consistency are approved. `manifest.json` points the Demo at these files for preview.

## Current review notes

- Whole poses and the three-angle expression set can be previewed in the Demo.
- The normalized pose report is in `process_image/imported_pose_report.json`; `yL30_pC00` and `yL60_pC00` still need eye-anchor review because their rough silhouette center drifts to the right.
- The imported `body`, `head`, `ear_l` and `ear_r` images are available through the **分层预览** button, but the current composite visibly misaligns and should be treated as a diagnostic preview only. Do not mark these layers `ready` yet.
