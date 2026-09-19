import { app } from "../../../scripts/app.js";

const NODE_NAME = "MuseMiniMaxH3UnifiedLoader";
const GROUPS = [
  { id: "profile", title: "VRAM QUALITY PROFILE", subtitle: "Automatic detects GPU VRAM and selects one tier for every branch", color: "#8fa5bd", fill: "rgba(55,70,88,.30)", names: ["profile"] },
  { id: "pinned", title: "PINNED MEMORY POOL", subtitle: "Page-locked RAM buffer (ComfyUI default ~40% of RAM) — lower it to free system RAM; may slow CPU-GPU transfers", color: "#6fbf73", fill: "rgba(34,88,40,.26)", names: ["pinned_memory_cap"] },
  { id: "reference", title: "REFERENCE MODEL", subtitle: "Ref2VA checkpoints — selected tier feeds the Director model socket", color: "#a970ff", fill: "rgba(75,42,112,.28)", names: ["low_vram_model", "balanced_model", "maximum_quality_model"] },
  { id: "fl2va", title: "FIRST / LAST-FRAME MODEL", subtitle: "FL2VA checkpoints — selected tier feeds the model_fl2va socket", color: "#668cff", fill: "rgba(36,55,116,.28)", names: ["low_vram_fl2va", "balanced_fl2va", "maximum_quality_fl2va"] },
  { id: "clip", title: "SHARED CLIP ENCODER", subtitle: "Used by both modes; leave the GGUF vision projector on Auto", color: "#e5cf55", fill: "rgba(112,96,24,.26)", names: ["low_vram_clip", "low_vram_mmproj", "balanced_clip", "balanced_mmproj", "maximum_quality_clip", "maximum_quality_mmproj"] },
  { id: "vae", title: "VAE MODELS", subtitle: "MiniMax H3 video and audio decoders", color: "#ef6477", fill: "rgba(116,39,55,.25)", names: ["video_vae", "audio_vae"] },
  { id: "loras", title: "LoRAs", subtitle: "Optional acceleration or style LoRAs", color: "#e9ae51", fill: "rgba(119,78,21,.25)", names: ["lora_1", "lora_1_strength", "lora_1_target", "lora_2", "lora_2_strength", "lora_2_target", "lora_3", "lora_3_strength", "lora_3_target"] },
  { id: "attention", title: "ATTENTION & MEMORY", subtitle: "Master bypass and MiniMax H3 memory optimisations", color: "#45d7c4", fill: "rgba(17,91,83,.25)", names: ["attention_enabled", "attention_backend", "sol_attention", "sol_tau", "sage_attention", "low_vram_attention", "attention_head_chunks", "chunk_feed_forward", "feed_forward_chunks", "feed_forward_threshold"] },
  { id: "advanced", title: "ADVANCED", subtitle: "Normally leave activation reserve on Automatic (0)", color: "#7f91aa", fill: "rgba(51,63,79,.30)", names: ["activation_reserve_gb"] },
];

GROUPS.push({ id: "model_selection", title: "MODELS TO LOAD", subtitle: "Match the Director mode; skips unused transformer weights and patches", color: "#8fa5bd", fill: "rgba(55,70,88,.30)", names: ["models_to_load"] });
GROUPS.find(group => group.id === "attention").names.splice(5, 0, "high_res_stability");

const LABELS = {
  high_res_stability: "High-Res Stability",
  models_to_load: "Models to Load",
  pinned_memory_cap: "Pinned memory cap",
  profile: "VRAM quality profile",
  low_vram_model: "Low VRAM — Reference model",
  balanced_model: "Balanced — Reference model",
  maximum_quality_model: "Maximum Quality — Reference model",
  low_vram_fl2va: "Low VRAM — First/Last-frame model",
  balanced_fl2va: "Balanced — First/Last-frame model",
  maximum_quality_fl2va: "Maximum Quality — First/Last-frame model",
  low_vram_clip: "Low VRAM — Shared H3 CLIP encoder",
  balanced_clip: "Balanced — Shared H3 CLIP encoder",
  maximum_quality_clip: "Maximum Quality — Shared H3 CLIP encoder",
  low_vram_mmproj: "Low VRAM — GGUF vision projector (Auto recommended)",
  balanced_mmproj: "Balanced — GGUF vision projector (Auto recommended)",
  maximum_quality_mmproj: "Maximum Quality — GGUF vision projector (Auto recommended)",
  video_vae: "MiniMax H3 Video VAE",
  audio_vae: "MiniMax H3 Audio VAE",
  attention_enabled: "Enable MiniMax H3 attention optimisations",
  attention_backend: "ComfyUI Model Attention Backend",
  sol_attention: "Sol-Attn (experimental)",
  sol_tau: "Sol-Attn threshold (tau)",
  sage_attention: "MiniMax H3 Memory-Efficient Sage Attention",
  low_vram_attention: "MiniMax H3 Low-VRAM Attention",
  attention_head_chunks: "MiniMax H3 Low-VRAM head chunks",
  chunk_feed_forward: "MiniMax H3 Chunk Feed-Forward",
  feed_forward_chunks: "MiniMax H3 feed-forward chunks",
  feed_forward_threshold: "MiniMax H3 feed-forward threshold",
  activation_reserve_gb: "H3 activation reserve GB (0 = Automatic)",
};

const ATTENTION_CHILDREN = new Set([
  "high_res_stability",
  "attention_backend", "sol_attention", "sol_tau", "sage_attention",
  "low_vram_attention", "attention_head_chunks", "chunk_feed_forward",
  "feed_forward_chunks", "feed_forward_threshold",
]);

function show(widget) {
  if (!widget?._museFinalHidden) return;
  widget._museFinalHidden = false;
  if (widget._museFinalCompute === undefined) delete widget.computeSize;
  else widget.computeSize = widget._museFinalCompute;
  if (widget._museFinalDraw === undefined) delete widget.draw;
  else widget.draw = widget._museFinalDraw;
}

function hide(widget) {
  if (!widget || widget._museFinalHidden) return;
  widget._museFinalHidden = true;
  widget._museFinalCompute = widget.computeSize;
  widget._museFinalDraw = widget.draw;
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
}

function resize(node) {
  const width = Math.max(node.size?.[0] || 450, 450);
  const computed = node.computeSize?.() || [width, 300];
  node.setSize?.([width, Math.max(120, computed[1])]);
  app.graph?.setDirtyCanvas?.(true, true);
}

function applyAttentionState(node) {
  const master = node.widgets?.find((widget) => widget.name === "attention_enabled");
  const enabled = master?.value !== false;
  for (const widget of node.widgets || []) {
    if (!ATTENTION_CHILDREN.has(widget.name)) continue;
    widget.disabled = !enabled;
    widget.options ||= {};
    widget.options.disabled = !enabled;
  }
  app.graph?.setDirtyCanvas?.(true, true);
}

function makeHeader(node, group) {
  return {
    name: `muse_final_section_${group.id}`,
    type: "muse_loader_final_section",
    value: group.title,
    options: { serialize: false },
    computeSize: (width) => [width, 44],
    draw(ctx, _drawNode, _cachedWidth, y) {
      const width = Math.max(180, node.size?.[0] || 450);
      const collapsed = !!node.properties?.muse_loader_final_collapsed?.[group.id];
      ctx.save();
      ctx.fillStyle = group.fill; ctx.strokeStyle = group.color; ctx.lineWidth = 1.3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(7, y + 2, width - 14, 38, 7);
      else ctx.rect(7, y + 2, width - 14, 38);
      ctx.fill(); ctx.stroke();
      ctx.textAlign = "left"; ctx.fillStyle = group.color; ctx.font = "bold 12px sans-serif";
      ctx.fillText(group.title, 18, y + 16);
      ctx.fillStyle = "#9ba8b9"; ctx.font = "10px sans-serif";
      ctx.fillText(group.subtitle, 18, y + 31);
      ctx.textAlign = "right"; ctx.fillStyle = group.color; ctx.font = "bold 17px sans-serif";
      ctx.fillText(collapsed ? "▸" : "▾", width - 18, y + 25);
      ctx.restore();
    },
    mouse(event) {
      if (event.type !== "pointerdown" && event.type !== "mousedown") return false;
      const collapsed = !node.properties.muse_loader_final_collapsed[group.id];
      node.properties.muse_loader_final_collapsed[group.id] = collapsed;
      group.widgets.forEach((widget) => collapsed ? hide(widget) : show(widget));
      resize(node);
      return true;
    },
  };
}

function install(node) {
  if (node._museFinalUIInstalled) return;
  node._museFinalUIInstalled = true;
  node.properties ||= {};
  node.properties.muse_loader_final_collapsed ||= {
    profile: false, pinned: false, reference: false, fl2va: false, clip: false,
    vae: false, loras: false, attention: false, advanced: true,
  };
  const native = [...(node.widgets || [])];
  const byName = new Map(native.map((widget) => [widget.name, widget]));
  for (const [name, label] of Object.entries(LABELS)) {
    if (byName.get(name)) byName.get(name).label = label;
  }
  const groupedNames = new Set(GROUPS.flatMap((group) => group.names));
  const rebuilt = native.filter((widget) => !groupedNames.has(widget.name));
  for (const group of GROUPS) {
    group.widgets = group.names.map((name) => byName.get(name)).filter(Boolean);
    rebuilt.push(makeHeader(node, group), ...group.widgets);
    if (node.properties.muse_loader_final_collapsed[group.id]) group.widgets.forEach(hide);
  }
  node.widgets = rebuilt;
  const master = byName.get("attention_enabled");
  if (master) {
    const callback = master.callback;
    master.callback = function () {
      const result = callback?.apply(this, arguments);
      applyAttentionState(node);
      return result;
    };
  }
  applyAttentionState(node);
  node.size[0] = Math.max(node.size[0], 450);
  setTimeout(() => resize(node), 0);
}

function restore(node) {
  setTimeout(() => {
    for (const group of GROUPS) {
      const collapsed = !!node.properties?.muse_loader_final_collapsed?.[group.id];
      group.widgets?.forEach((widget) => collapsed ? hide(widget) : show(widget));
    }
    applyAttentionState(node);
    resize(node);
  }, 2);
}

app.registerExtension({
  name: "Muse.MiniMaxH3UnifiedLoader.FinalUI",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = created?.apply(this, arguments);
      install(this);
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = configured?.apply(this, arguments);
      restore(this);
      return result;
    };
  },
});
