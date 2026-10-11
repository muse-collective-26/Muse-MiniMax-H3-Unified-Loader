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
    serialize: false,
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

function booleanValue(value, name) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["true", "on", "enabled", "1"].includes(text)) return true;
    if (["false", "off", "disabled", "0"].includes(text)) return false;
  } else if (value === 0 || value === 1) return value === 1;
  throw new Error(`Muse Unified Loader: ${name} must be ON or OFF; got ${JSON.stringify(value)}`);
}

function normalizeBooleans(node) {
  for (const widget of node.widgets || []) {
    if (node._museBooleanNames?.has(widget.name)) {
      widget.value = booleanValue(widget.value, widget.name);
    }
  }
}

function install(node, booleanNames) {
  if (node._museFinalUIInstalled) return;
  node._museFinalUIInstalled = true;
  node.properties ||= {};
  node.properties.muse_loader_final_collapsed ||= {
    profile: false, pinned: false, reference: false, fl2va: false, clip: false,
    vae: false, loras: false, attention: false, advanced: true,
  };
  const native = [...(node.widgets || [])];
  node._museBooleanNames = booleanNames;
  for (const widget of native) {
    if (!booleanNames.has(widget.name)) continue;
    const serializeValue = widget.serializeValue;
    widget.serializeValue = async function (...args) {
      this.value = booleanValue(this.value, this.name);
      const value = serializeValue ? await serializeValue.apply(this, args) : this.value;
      return booleanValue(value, this.name);
    };
  }
  node._museInputDefaults = Object.fromEntries(native.map(widget => [widget.name, widget.value]));
  const byName = new Map(native.map((widget) => [widget.name, widget]));
  for (const [name, label] of Object.entries(LABELS)) {
    if (byName.get(name)) byName.get(name).label = label;
  }
  const groups = node._museFinalGroups = GROUPS.map(group => ({ ...group, names: [...group.names] }));
  const groupedNames = new Set(groups.flatMap((group) => group.names));
  const rebuilt = native.filter((widget) => !groupedNames.has(widget.name) && widget.name !== "extra_loras");
  for (const group of groups) {
    group.widgets = group.names.map((name) => byName.get(name)).filter(Boolean);
    rebuilt.push(makeHeader(node, group), ...group.widgets);
    if (node.properties.muse_loader_final_collapsed[group.id]) group.widgets.forEach(hide);
  }
  node.widgets = rebuilt;
  const extra = byName.get("extra_loras");
  if (extra) {
    // Keep this serialized payload LAST, not among the visually inserted rows.
    node.widgets.push(extra);
    hide(extra);
    node._museExtraLoraWidget = extra;
    rebuildExtraLoras(node);
  }
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
    rebuildExtraLoras(node);
    for (const group of node._museFinalGroups || []) {
      const collapsed = !!node.properties?.muse_loader_final_collapsed?.[group.id];
      group.widgets?.forEach((widget) => collapsed ? hide(widget) : show(widget));
    }
    applyAttentionState(node);
    resize(node);
  }, 2);
}

function rebuildExtraLoras(node, rows = null) {
  const payload = node._museExtraLoraWidget;
  const group = node._museFinalGroups?.find(group => group.id === "loras");
  if (!payload || !group) return;
  if (rows === null) {
    try {
      rows = JSON.parse(payload.value || "[]");
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object")) throw new Error("Invalid rows");
    } catch (error) {
      console.error("[Muse Unified Loader] Cannot restore additional LoRAs", error);
      return; // Never overwrite an unreadable saved payload silently.
    }
  }
  node.widgets = node.widgets.filter(widget => !widget._museExtraLoraControl);
  group.widgets = group.widgets.filter(widget => !widget._museExtraLoraControl);
  const controls = [];
  const commit = () => {
    payload.value = JSON.stringify(rows);
    node.graph?.change?.();
    app.graph?.setDirtyCanvas?.(true, true);
  };
  const addControl = (type, name, value, callback, options = {}) => {
    const widget = node.addWidget(type, name, value, callback, { ...options, serialize: false });
    widget.serialize = false; // LiteGraph's positional save/restore checks this property.
    widget._museExtraLoraControl = true;
    controls.push(widget);
    return widget;
  };
  const first = node.widgets.find(widget => widget.name === "lora_1");
  const values = first?.options?.values || ["(disabled)"];
  rows.forEach((row, index) => {
    const label = `LoRA ${index + 4}`;
    addControl("combo", `${label} name`, row.name ?? "(disabled)", value => { row.name = value; commit(); }, { values });
    addControl("number", `${label} strength`, row.strength ?? 1, value => { row.strength = value; commit(); }, { min: -10, max: 10, step: 0.5, precision: 2 });
    addControl("combo", `${label} target`, row.target ?? "Both models", value => { row.target = value; commit(); }, { values: ["Both models", "Reference model", "First/Last model"] });
    addControl("button", `Remove ${label}`, null, () => {
      rows.splice(index, 1); commit(); rebuildExtraLoras(node, rows); resize(node);
    });
  });
  addControl("button", "+ Add LoRA", null, () => {
    rows.push({ name: "(disabled)", strength: 1, target: "Both models" });
    commit(); rebuildExtraLoras(node, rows); resize(node);
  });
  // addWidget appends; move only these nonserialized controls into the LoRA section.
  node.widgets = node.widgets.filter(widget => !widget._museExtraLoraControl);
  const anchor = node.widgets.indexOf(group.widgets[group.widgets.length - 1]);
  node.widgets.splice(anchor + 1, 0, ...controls);
  group.widgets.push(...controls);
  if (node.properties.muse_loader_final_collapsed.loras) controls.forEach(hide);
}

function restoreSavedValues(node, info) {
  // Older workflows saved decorative headings among positional values. Adding
  // High-Res Stability inside that visual section shifted every later setting.
  // Restore by name even when the frontend's named-restore feature is disabled.
  let named = info?.widgets_values_named;
  if (!named || typeof named !== "object" || Array.isArray(named)) {
    const values = info?.widgets_values;
    if (!Array.isArray(values) || !values.includes("ATTENTION & MEMORY")) return;
    named = {};
    const titles = new Set(GROUPS.map(group => group.title));
    for (const group of GROUPS) {
      const start = values.indexOf(group.title);
      if (start < 0) continue;
      let end = start + 1;
      while (end < values.length && !titles.has(values[end])) end++;
      const saved = values.slice(start + 1, end);
      let names = group.names.filter(name => name in node._museInputDefaults);
      if (group.id === "attention" && saved.length === names.length - 1) {
        names = names.filter(name => name !== "high_res_stability");
      }
      if (saved.length !== names.length) {
        console.warn(`[Muse Unified Loader] Unrecognised legacy ${group.title} layout; not guessing its values.`);
        continue;
      }
      names.forEach((name, index) => { named[name] = saved[index]; });
    }
  }
  for (const widget of node.widgets || []) {
    if (!(widget.name in (node._museInputDefaults || {}))) continue;
    if (Object.hasOwn(named, widget.name)) widget.value = named[widget.name];
    else if (widget.name === "high_res_stability" || widget.name === "extra_loras") {
      widget.value = node._museInputDefaults[widget.name];
    }
  }
}

app.registerExtension({
  name: "Muse.MiniMaxH3UnifiedLoader.FinalUI",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;
    const booleanNames = new Set(Object.entries({
      ...nodeData.input?.required, ...nodeData.input?.optional,
    }).filter(([, spec]) => spec[0] === "BOOLEAN").map(([name]) => name));
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = created?.apply(this, arguments);
      install(this, booleanNames);
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      const result = configured?.apply(this, arguments);
      restoreSavedValues(this, info);
      normalizeBooleans(this);
      restore(this);
      return result;
    };
    const serialized = nodeType.prototype.onSerialize;
    nodeType.prototype.onSerialize = function (info) {
      normalizeBooleans(this);
      const result = serialized?.apply(this, arguments);
      info.widgets_values_named = Object.fromEntries((this.widgets || [])
        .filter(widget => widget.name in (this._museInputDefaults || {}))
        .map(widget => [widget.name, widget.value]));
      return result;
    };
  },
});
