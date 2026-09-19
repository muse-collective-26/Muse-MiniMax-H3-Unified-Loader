# Claude Changes Log — Muse MiniMax H3 Unified Loader

## 2026-09-09 — "PINNED MEMORY POOL" control added (Claude)

**Why.** All-day H3 Director RAM investigation (see
`Muse-MiniMax-Director-Combo-V2/CLAUDE_CHANGES_LOG.md` 2026-09-09 and scratchpad
`h3_ram_comparison.md`). After `--fast-disk` + the final-chunk transformer unload,
the two-stage Reference render peak dropped to ~39 GB — now a **Stage-2 sampling**
peak, not decode. The remaining lever is ComfyUI's pinned-memory pool, hardcoded
at `ram * 0.40` (~20 GB on the 48 GB rig) in `comfy/model_management.py`, with no
partial cap — only `--disable-pinned-memory` (all/nothing, session-wide).

**What was added.**
- `nodes_attention_master.py` — appended a `pinned_memory_cap` COMBO widget
  (append-only, so existing saved-workflow widget slots are unchanged):
  `["Default (40% of RAM)", "16 GB", "14 GB", "12 GB", "10 GB", "8 GB", "6 GB"]`,
  default `"Default (40% of RAM)"`.
- `nodes.py` `load()` — at the very top, before any model load: if the choice
  starts with a digit, set `comfy.model_management.MAX_PINNED_MEMORY` to that many
  GB, but **only if it lowers the current value** (never raises). `MAX_PINNED_MEMORY`
  is a live module global read on every pin/evict check, so mutating it here takes
  effect for the run. Logs `[Muse Unified Loader] pinned-memory pool capped at ...`.
- `web/js/zzzzzz_unified_loader_final_ui.js` — new fascia section `pinned`
  ("PINNED MEMORY POOL", green `#6fbf73`), inserted in `GROUPS` between `profile`
  and `reference` so it renders directly under the VRAM quality profile; `LABELS`
  entry; added to the `muse_loader_final_collapsed` defaults.

**Scope / safety.** "Default" is a no-op — nothing changes for anyone who leaves
it. A number only ever lowers the cap. It's a global set from the loader, which is
fine because there is one Unified Loader per workflow.

**Backups:** `nodes.py.pinned-cap-20260909-194057.bak`,
`web/js/zzzzzz_unified_loader_final_ui.js.pinned-cap-20260909-194057.bak`.
**Rollback:** restore those two, and delete the `pinned_memory_cap` line from
`nodes_attention_master.py`.

**Status: CONFIRMED WORKING — keep, currently set to 10 GB.**
- Run 8 (2026-09-09 19:56), cap 12 GB: `pinned-memory pool capped at 12 GB (was
  19.2 GB)`. Workflow peak 39.2 -> **34.3 GB**, 354 s. Stage 1 s/it 11.8 -> 10.9
  (less eviction churn), Stage 2 unchanged.
- Run 9 (2026-09-09 20:04), cap 10 GB: peak **33.5 GB**, **348 s** (fastest).
  12 -> 10 only bought 0.8 GB — diminishing returns below ~12.
- Peak is now the **Stage 2 refine sampling plateau**, not decode. 32 GB gap ~1.5 GB.
- `MAX_PINNED_MEMORY` doesn't reset between runs without a ComfyUI restart; the
  widget only ratchets it *down* within a session (matches the "only lowers"
  design; run 9's log said "was 12.0 GB" for that reason).

Full ladder + measurements: `../Muse-MiniMax-Director-Combo-V2/HANDOVER_FOR_CODEX_20260909.md`.
