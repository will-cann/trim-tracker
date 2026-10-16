# Plant Health Report Images + Auto Issue Identification

## Problem

Cultivators already file a **Plant Health Report** from the Plant Map (select strain group → pick contaminant chips → adjust score → submit). That flow only mutates the current `plant_health` / `contaminants` on each selected plant or batch row. It does not:

1. **Keep a report history** — each submit overwrites the live score; there is no dated record, notes, or reporter.
2. **Accept photos** — scouts photograph PM, mites, or nutrient burn on a leaf; today those images stay in camera rolls / Slack and never enter NeuroCann.
3. **Suggest issues from photos** — operators must know the taxonomy and tap the right chips. Vision could pre-fill likely contaminants with confidence so the report is faster and more consistent.

The 2023 NeuroCann how-to PDF (`ReportingPlantHealthusingneurocann_PDF_*.pdf`) already expected **issue + intensity + notes**. Intensity and notes are only partially mirrored today (band slider around `computeHealthFromIssues`; `note` accepted by the API client but discarded in `plant-actions.ts`). Images and auto-ID are net-new.

## Core Insight

Plant health reporting is a **confirm-then-write** workflow — the same pattern as AI proposed actions and vendor menu parse. Photos should never silently rewrite plant health. Flow:

```
Capture / attach image(s)
  → Claude vision suggests CONTAMINANT_MAP keys + confidence + rationale
  → Operator confirms / edits chips + score + notes
  → Persist health_report (+ media) AND update live plant/batch health
  → Optionally spawn IPM human task
```

Reuse the existing contaminant catalog and score math. Do not invent a parallel pathogen ontology.

## Current State (codebase)

| Layer | Today |
|-------|--------|
| Live health | `plants.plant_health`, `plants.contaminants[]` (same on `plant_batches`) — migration `008_plant_map.sql` |
| Taxonomy | `CONTAMINANT_MAP` in `src/types/plantMap.ts` (pests / fungi / viruses / nutrient / other) |
| Score | `computeHealthFromIssues` → base score, operator ±15 band |
| UI | `PlantActionModal` action `plant-health` (“Plant Health Report”) |
| API | `netlify/functions/plant-actions.ts` case `plant-health` — overwrites rows; ignores `note` |
| AI text | `plants` tool `update_health` / legacy `update_plant_health` → `actionExecutor` → same plant-actions path |
| Vision precedent | `parse-vendor-menu.ts` — base64 image/PDF → Claude `document`/`image` content; **ephemeral**, no blob store |
| Media store | **None** (no S3 / Netlify Blobs / attachment table) |
| Report entity | **None** — modal title is product language only |
| Harvest contaminants | Separate narrow enum (`powdery_mildew` \| `bud_rot` \| `insects` \| `other`) via `flag_contamination` — do not conflate with plant-map catalog |

## User Workflow (Target)

### A. From Plant Map (primary)

1. Select strain group(s) in a room (existing selection model).
2. Open **Plant Health Report**.
3. Attach 1–N photos (file picker + camera `capture="environment"` on mobile/tablet).
4. Tap **Identify issues** (or auto-run after first image settles).
5. See suggested chips with confidence; edit freely; add notes; adjust score in band.
6. Submit → creates immutable report + updates live health on targeted plants.

### B. From AI chat / ambient (secondary)

1. User uploads or pastes a plant photo in chat (extend beyond CSV-only attach).
2. User says e.g. “PM on lower fans in Flower 2 Wedding Cake.”
3. AI calls `analyze_plant_health_image` (or equivalent) then proposes `create_plant_health_report` / `update_plant_health` with suggested contaminants — **preview → confirm** as today.

### C. Scout on one plant inside a group (important edge)

Photos often show **one** sick plant in a healthy group. Reporting must support:

- **Scope:** entire selected group (default, today’s behavior) **or** subset of plant IDs / “affected only.”
- When scope is subset, only those rows get the new score/contaminants; group map aggregates continue to average / union as they do now.

## Feature Design

### Phase 1 — First-class health reports + notes

**Goal:** Make “Plant Health Report” a real record, not just an overwrite.

**Schema (sketch):**

```sql
plant_health_reports (
  id uuid PK,
  company_id uuid NOT NULL,
  room_id uuid,
  entity_type text NOT NULL CHECK (entity_type IN ('plants', 'plantbatches')),
  -- denormalized context for history UI
  strain_name text,
  room_name text,
  growth_phase text,
  plant_ids uuid[] NOT NULL DEFAULT '{}',  -- empty = batches-only path
  batch_ids uuid[] NOT NULL DEFAULT '{}',
  contaminants text[] NOT NULL DEFAULT '{}',
  health_score int NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  note text,
  source text NOT NULL DEFAULT 'manual',  -- manual | vision | ai_chat | ambient
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Optional per-issue detail (severity 2+)
plant_health_report_findings (
  id uuid PK,
  report_id uuid REFERENCES plant_health_reports(id) ON DELETE CASCADE,
  contaminant_key text NOT NULL,
  confidence numeric,           -- 0–1 from vision; null if manual
  severity text,                -- low | medium | high | null
  rationale text,               -- model short reason; operator-editable
  confirmed boolean NOT NULL DEFAULT true
);
```

**API:**

- Extend `plant-actions` `plant-health` (or new `create-plant-health-report`) to:
  1. Insert report (+ findings).
  2. Persist `note`.
  3. Update live `plant_health` / `contaminants` for scoped IDs.
- `GET` list/history by room, strain group, or plant id for a thin history drawer.

**UI:**

- Notes field in `PlantActionModal` (closes PDF gap).
- Optional “View past reports” on the group / plant detail.

**Definition of done:** Submitting a report without images creates a durable row with notes; live health still updates; history queryable by company.

---

### Phase 2 — Image attachments (storage + UI)

**Goal:** Attach photos to a report and display them later.

**Schema:**

```sql
media_objects (
  id uuid PK,
  company_id uuid NOT NULL,
  storage_key text NOT NULL,      -- blob key or object path
  content_type text NOT NULL,
  byte_size int,
  width int,
  height int,
  sha256 text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

plant_health_report_media (
  report_id uuid REFERENCES plant_health_reports(id) ON DELETE CASCADE,
  media_id uuid REFERENCES media_objects(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (report_id, media_id)
);
```

**Storage choice (recommended):**

| Option | Fit |
|--------|-----|
| **Netlify Blobs** | Best default — already on Netlify Functions; company-scoped keys; signed/read via function; no new cloud vendor |
| Direct base64 only | OK for Phase 3 MVP analyze-then-discard; **not** for retention (payload limits, no gallery) |
| S3/R2 | Prefer later if retention, CDN, or multi-env size demands it |

**Upload flow:**

1. Client compresses image client-side (max edge ~1600px, JPEG/WebP, target &lt; ~1.5 MB).
2. `POST /.netlify/functions/upload-media` with auth → returns `{ mediaId, storageKey }` (or upload URL).
3. Report submit includes `mediaIds[]`.
4. Serve via `GET /.netlify/functions/get-media?id=` (auth + `company_id` check) — never public unguessable-only URLs without auth.

**UI:**

- Multi-image strip in Plant Health Report modal: thumbnails, remove, add more.
- Camera input on tablets: `<input type="file" accept="image/*" capture="environment">`.
- Show thumbnails on report history entries.

**Constraints:**

- Max images per report: start at **4**.
- Allowed types: `image/jpeg`, `image/png`, `image/webp` (no HEIC until convert path exists).
- Virus/malware: treat as binary blobs; do not execute; size cap ~5 MB pre-compress.

**Definition of done:** Operator attaches photos, submits, reopens history and sees the same images; media scoped by `company_id`.

---

### Phase 3 — Auto issue identification (vision)

**Goal:** From attached images, suggest `CONTAMINANT_MAP` keys for operator confirmation.

**New function:** `analyze-plant-health-image.ts` (mirror `parse-vendor-menu.ts`).

**Input:**

- One or more images (media IDs preferred; base64 allowed for chat MVP).
- Optional context: strain, room, growth phase, existing contaminants, operator note.

**Output (structured JSON):**

```json
{
  "suggestions": [
    {
      "contaminantKey": "powdery_mildew",
      "confidence": 0.86,
      "severity": "medium",
      "rationale": "White powdery patches on upper leaf surface"
    }
  ],
  "differential": [
    { "contaminantKey": "nutrient_deficiency", "confidence": 0.35, "rationale": "..." }
  ],
  "healthHint": 72,
  "warnings": ["Image is blurry; confidence reduced"],
  "modelNote": "Not a lab diagnosis; confirm visually before treatment."
}
```

**Prompt rules:**

- **Closed vocabulary:** only keys from `CONTAMINANT_MAP` (pass the catalog + labels in the system prompt). Never invent free-text pathogens.
- Prefer abstaining (`suggestions: []`) over low-confidence guesses; put uncertain items in `differential` only if confidence ≥ ~0.25.
- Map lookalikes carefully (e.g. PM vs nutrient burn vs light bleach); ask for multi-label when co-occurring.
- Always include disclaimer: vision assists scouting; not a regulatory or lab diagnosis.
- Harvest `bud_rot` ↔ plant-map `botrytis`: if user is in plant-map path, emit `botrytis` only.

**UI integration:**

1. After analyze, pre-select chips with confidence ≥ threshold (e.g. **0.55**).
2. Show confidence badges; lower-confidence items as “Possible — tap to add.”
3. Recompute score via existing `computeHealthFromIssues`; keep ±15 band.
4. Submit still requires explicit Confirm (same as today).

**AI chat:**

- New proposed action type e.g. `analyze_plant_health_image` (side-effect: returns suggestions into chat) and/or fold into `create_plant_health_report` with `mediaIds` + suggested contaminants.
- Keep preview/confirm; do not auto-execute health writes from vision alone.

**Eval:**

- Add fixtures under `tests/eval/` (or a small vision eval folder) with labeled sample images per contaminant class where available; measure top-1 / top-3 accuracy and false-positive rate on “healthy leaf” negatives.
- Golden tests for JSON schema + key whitelist (no hallucinated keys).

**Definition of done:** Attaching a clear PM photo on a test plant pre-fills `powdery_mildew` with high confidence; operator can dismiss; wrong suggestions do not write without confirm; healthy / blank images do not force chips.

---

### Phase 4 — Downstream automation (optional, after 1–3)

- Auto-create `human_tasks` with `category: 'ipm'` when confirmed report includes high-impact keys (e.g. impact ≥ 25 or severity high) — treatment / quarantine / re-scout.
- Link task to `plant_health_report_id` (schema addition on `human_tasks` or metadata JSON).
- Ambient mode: photo from field device → silent analyze → queue proposed report for review (do not silent-apply).
- Align harvest `flag_contamination` labels with plant-map keys over time (`bud_rot` → `botrytis` alias) — separate cleanup; not blocking.

## Technical Approach

### Reuse

- `CONTAMINANT_MAP` + `computeHealthFromIssues` (`src/types/plantMap.ts`)
- `PlantActionModal` plant-health UI + `plant-actions` write path
- Vision call shape from `parse-vendor-menu.ts` (Claude Messages API, base64 source)
- Proposed-action preview from `ai-parse` / `actionExecutor`
- `create_human_tasks` + `ipm` category for Phase 4

### Build

| Area | Work |
|------|------|
| Migration | `plant_health_reports`, findings, `media_objects`, join table; next number after `065_*` |
| Functions | `upload-media`, `get-media`, `analyze-plant-health-image`, extend plant-actions / new report CRUD |
| Frontend | Image picker + compress util; modal strip; suggestion chips; history drawer |
| Types | Report + media DTOs in `plantMap.ts` / `definitions.ts`; new `ProposedAction` variants |
| Auth | All media + reports filtered by `company_id` from `resolveContext` |

### Payload / limits

- Prefer **upload media first, analyze by media ID** so Netlify function bodies stay small.
- Analyze function loads blob server-side and sends to Claude as `image` content (`media_type` from stored content type).
- Client compression before upload is mandatory for phone camera originals.

### Privacy / compliance posture

- Media is tenant-scoped cultivation ops data; enforce company isolation on every read/write.
- Retention: soft-delete reports/media later; v1 can hard-delete with report.
- Do not train / log raw images to third parties beyond the configured Claude API call.
- UI copy: “AI suggestions assist identification; confirm before treating or destroying plants.”

## What This Doesn't Cover (Yet)

- Lab PCR / third-party diagnostic APIs
- Video or time-lapse analysis
- Automatic plant destroy / quarantine room moves without human confirm
- HEIC without conversion
- Public share links for photos
- Training a custom vision model (start with Claude; revisit if volume/cost/accuracy demands it)
- Changing the strain+room group aggregation model on the map (reports can still target subsets; map view remains averaged)

## Success Metrics

- Time to file a photo-backed health report &lt; 60s on tablet (capture → confirm → submit)
- ≥ 70% of vision top suggestions accepted or one-tap corrected in early usage (track accept/edit/reject)
- False auto-apply rate = **0** (architecture: confirm required)
- % of health updates that include a note or photo rises vs. chip-only baseline
- Report history available for any room/strain group that has filed issues

## Build Order

1. **Phase 1 — Report entity + notes** — unlocks history and makes “report” real; low risk; unblocks PDF parity.
2. **Phase 2 — Media store + attach UI** — prerequisite for retained evidence; choose Netlify Blobs early.
3. **Phase 3 — Vision analyze + confirm UX** — highest product novelty; depends on 1–2 for production path; base64-only spike OK to validate prompt quality first.
4. **Phase 4 — IPM tasks + chat/ambient photo path** — leverage existing task + AI patterns once reports/media are solid.

## Spike (optional, before Phase 2 storage)

A half-day spike: hardcode 5–10 labeled leaf images → `analyze-plant-health-image` with base64 only → measure key accuracy against `CONTAMINANT_MAP`. If closed-vocab accuracy is poor on real grow photos, adjust prompt / few-shot examples before building Blobs + UI polish.

## Files Likely Touched (implementation)

- `migrations/066_plant_health_reports_media.sql` (number may shift)
- `netlify/functions/plant-actions.ts` (or `create-plant-health-report.ts`)
- `netlify/functions/analyze-plant-health-image.ts` (new)
- `netlify/functions/upload-media.ts`, `get-media.ts` (new)
- `netlify/functions/utils/media.ts` (new — Blobs helpers)
- `src/components/PlantMap/PlantActionModal.tsx`
- `src/types/plantMap.ts`, `src/types/definitions.ts`
- `src/services/apiService.ts`, `src/services/actionExecutor.ts`
- `netlify/functions/ai-parse.ts` (chat tools / proposed actions)
- `tests/eval/` (vision / schema evals)

## Open Questions

1. **Default scope:** When a photo is attached to a multi-plant group, default to whole group or force “affected count / IDs”? Recommendation: default whole group (matches today’s mental model) with an explicit “Only N plants” control.
2. **Replace vs merge contaminants:** On submit, replace the plant’s contaminant list with the report set (today’s overwrite) or union with previous? Recommendation: **replace with report set** (report is the new truth) but show previous chips as starting state when opening the modal.
3. **Blob vs S3:** Stick with Netlify Blobs unless multi-region CDN or &gt; Blobs practicality becomes an issue.
4. **Severity vs impact:** Keep score from `CONTAMINANT_MAP.impact` for v1; store optional vision `severity` on findings for display only until product wants intensity sliders per issue (PDF “intensity”).
