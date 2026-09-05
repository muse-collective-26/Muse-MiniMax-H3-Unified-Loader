# Muse MiniMax H3 Unified Loader

**One hardware-aware loader for the whole MiniMax H3 Director model stack — model, CLIP, VAEs, LoRAs, and attention patches — auto-selected from your detected VRAM.**

Built by [Muse Collective](https://musecollective.co.uk) for use with [Muse Minimax Director](https://github.com/muse-collective-26/MiniMaxH3-Director-V1.2). Instead of wiring a separate model loader, CLIP loader, VAE loaders, LoRA stack, and attention-patch nodes by hand — and picking the right combination for your specific GPU yourself — this node exposes three fixed profiles (Low VRAM / Balanced / Maximum Quality), each fully configurable, and picks the right one automatically from your card's detected VRAM.

![ComfyUI Custom Node](https://img.shields.io/badge/ComfyUI-Custom%20Node-orange?style=flat-square)
![MiniMax H3](https://img.shields.io/badge/MiniMax-H3-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

> **Before you run this node, install these two dependencies manually — ComfyUI Manager's "install missing custom nodes" prompt will NOT catch them.** This node calls them internally at runtime rather than placing them as their own nodes in the workflow graph, which is the only thing Manager's missing-node scanner checks. Skipping this step gets you a `RuntimeError: Required node '...' is not installed or did not load.` the moment you run the node.
> - **[ComfyUI-H3-Multishot](https://github.com/jlucasmcrell/ComfyUI-H3-Multishot)** — always required.
> - **[ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes)** — required if you leave any of SageAttention / low-VRAM attention / chunked feed-forward switched on (all on by default).
>
> Install both the same way as this node (Manager search, or `git clone` into `custom_nodes`), then restart ComfyUI.

---

## Changelog

### 2026-09-05
- **Missing-dependency errors now name the exact package and where to get it**, instead of a bare "not installed or did not load." Root cause of the confusing failure: `H3ModelLoaderAny` and the KJNodes attention patches are looked up dynamically at runtime, not placed as their own nodes in the saved workflow graph — so ComfyUI Manager's "install missing custom nodes" scanner, which only reads node types actually present in the workflow JSON, never gets a chance to flag them. A fresh install without these two dependencies got no prompt at all, just a plain crash. The error message itself now states which package is missing and links to it directly.

### 2026-09-04
- **Removed Sol-Attn as an attention option entirely.** Confirmed via a controlled A/B test (identical GGUF Low VRAM run, only this toggle changed) that it causes a real stall — VRAM unload finds almost nothing to free, and the render sits at ~99% GPU utilization with no progress for minutes. Every other attention option here (core attention backend, SageAttention, low-VRAM attention, chunked feed-forward) has run clean in every render tested; Sol-Attn was the only one that produced this failure. Removed from the node's inputs and from the optional-dependencies list below, so no one can switch it on and hit this by surprise.

---

## What it does

- **One `profile` dropdown** — `Automatic`, `Low VRAM`, `Balanced`, or `Maximum Quality`. `Automatic` picks based on detected VRAM: Low VRAM up to 12.5 GB, Balanced up to 20.5 GB, Maximum Quality above that.
- **Each profile has its own model + CLIP + mmproj slots** — configure once per profile, then just switch the dropdown (or leave it on Automatic) rather than rewiring loaders every time you change GPU or want to compare quality tiers.
- **Graceful fallback** — if the selected/recommended profile has no model+CLIP pair configured (`(disabled)`), the node automatically falls back to the nearest configured profile instead of erroring.
- **Real, adaptive VRAM management** — routes model loading through [ComfyUI-H3-Multishot](https://github.com/seitanism/ComfyUI-H3-Motion-Context-MultiRef)'s `H3ModelLoaderAny`/H3AutoReserve system, which measures actual VRAM usage per render shape, tightens its estimate over repeat runs on your specific machine, and sweeps leftover VRAM before committing a new reservation. A plain model loader skips all of this — no per-shape measurement, no self-tightening, no cleanup sweep — and runs much closer to the edge of your card's VRAM as a result.
- **First/Last-Frame model support** — an optional `model_fl2va` slot and output, for workflows that also need MiniMax H3's First/Last-Frame checkpoint (e.g. Hybrid Continuation mode on the Director).
- **Three independent LoRA slots**, each with its own strength and target (reference model, First/Last-frame model, or both).
- **Attention & memory patches** — optional core attention backend selection, SageAttention, low-VRAM attention, and chunked feed-forward, applied consistently to both the reference model and the First/Last-frame model.
- **Status output** — a plain-text summary of what was actually selected/applied on this run (profile, detected VRAM, LoRAs, patches) — useful for confirming what a workflow actually did without digging through the console.

---

## Outputs

Connect `model`, `clip`, `vae`, `audio_vae`, and `model_fl2va` directly to the matching inputs on [Muse Minimax Director](https://github.com/muse-collective-26/MiniMaxH3-Director-V1.2). `prompt_override` (if you use it) remains a separate text input on the Director node itself — this loader doesn't touch prompt text at all.

If you'd rather use a different attention setup than what this node applies, its `model`/`model_fl2va` outputs are plain `MODEL` sockets — wire your own attention-patch node in between this loader and the Director instead (see [Requirements](#requirements) below for what this node applies by default, and turn those off first if you want a clean model to build on).

---

## Requirements

- **[ComfyUI-H3-Multishot](https://github.com/seitanism/ComfyUI-H3-Motion-Context-MultiRef)** — required. Provides the combined safetensors/GGUF H3 model loader (`H3ModelLoaderAny`) and CLIP loader this node routes through, including the adaptive VRAM reservation system described above.
- **[ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)** — required only if you select a `.gguf` model file in any profile.
- **[KJNodes](https://github.com/kijai/ComfyUI-KJNodes)** — required for the SageAttention, low-VRAM attention, and chunked feed-forward options. Leave those toggled off if you don't want this dependency.

### Python packages

No additional Python packages beyond what the dependencies above already require.

---

## Installation

### Via ComfyUI Manager
Search for **Muse MiniMax H3 Unified Loader** and click Install.

### Manual
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/muse-collective-26/Muse-MiniMax-H3-Unified-Loader
```

Restart ComfyUI after installing.

---

## Usage

1. Add a **Muse MiniMax H3 Unified Loader** node to your graph.
2. For each profile you plan to use (Low VRAM / Balanced / Maximum Quality), pick a model + CLIP (+ mmproj if your CLIP file needs one). Leave a profile's model/CLIP on `(disabled)` if you don't want that profile available at all.
3. Optionally configure `model_fl2va`, LoRAs, and attention/memory patches.
4. Leave `profile` on `Automatic` to let the node choose based on detected VRAM, or pin it to a specific profile directly.
5. Wire `model`, `clip`, `vae`, `audio_vae`, and (if used) `model_fl2va` into the matching Director inputs.
6. Check the `status` output text if you want to confirm exactly what was selected and applied on a given run.

This node is deliberately separate from the Director itself — it doesn't modify Muse Minimax Director's own code, only supplies the model stack it needs.

---

## Credits & Licensing

This repository's own original code (the profile-selection logic, LoRA/attention-patch wiring, and status reporting) is licensed under the **MIT License** — see [LICENSE](LICENSE). It contains no MiniMax H3 model weights and no code from the MiniMax H3 model itself — it only loads and configures models via the stock ComfyUI/ComfyUI-H3-Multishot loading pipeline. See the [Muse Minimax Director](https://github.com/muse-collective-26/MiniMaxH3-Director-V1.2) repository for MiniMax H3's own model license and attribution requirements.
