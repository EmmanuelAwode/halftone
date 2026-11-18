# Halftone — local design studio

**Live app:** https://emmanuelawode.github.io/halftone/

A local-first, browser-based editor for YouTube thumbnails, single cover art, Instagram posts,
TikTok/story covers and promo graphics. Pick a size or a starter template, drop in photos,
arrange layers, add text and export — no account, backend or API keys. Projects and imported
photos are stored in your browser (IndexedDB) and the app works offline once loaded.

## Install it as an app

Open the live app in Chrome or Edge and click **Install app** on the home screen (or the install
icon in the address bar). Halftone then opens from the Start menu / desktop in its own window and
works without an internet connection.

## Features

- Presets: YouTube thumbnail (1280 × 720), single cover (3000 × 3000), Instagram portrait (1080 × 1350),
  story / TikTok cover (1080 × 1920), plus custom sizes
- Three editable starter templates with photo spots (also linkable: `#/new/bold-thumb`,
  `#/new/minimal-cover`, `#/new/release-story`)
- Photo import by drag-and-drop, file picker or paste (PNG, JPEG, WebP); non-destructive crop;
  brightness, contrast, saturation and blur with reset
- Text with bundled offline fonts, weight, alignment, colour, outline and shadow; one-click
  "thumbnail title" styling
- Rectangles, circles and lines with fill, stroke and opacity
- Snapping guides, zoom, pan and fit-to-screen; layer panel with reorder, rename, hide and lock
- Undo/redo where each drag or slider gesture is one step; shortcuts pause while typing
- Autosave, project screen with rename/delete, exact-size PNG/JPEG export (transparent PNG
  supported) and editable `.halftone.json` backups that include photos

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run lint
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Code map

- `src/lib/project.ts` — versioned `ProjectDoc` schema and `migrateProject`; only this is persisted
- `src/lib/db.ts` — IndexedDB stores: `projects`, `meta` (list and thumbnails), `assets` (photo blobs)
- `src/lib/backup.ts` — backup format: project document plus base64 photos
- `src/editor/controller.ts` — Fabric canvas and transient editor state (zoom, selection, crop),
  undo/redo, autosave, crop, snapping, export
- `src/editor/scene.ts` — asset reference ↔ blob URL mapping and off-screen exact-size rendering
- `src/editor/templates.ts` — starter templates
- `src/ui/*` — project picker, editor shell, tool rail, inspector, layers

Built with React, TypeScript, Vite, Fabric.js and idb.
