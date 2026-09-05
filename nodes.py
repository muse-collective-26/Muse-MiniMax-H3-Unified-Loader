"""Unified, hardware-aware MiniMax H3 model stack for Muse Director workflows."""

from __future__ import annotations

import logging
import os

import folder_paths
import nodes
import torch

LOGGER = logging.getLogger(__name__)
OFF = "(disabled)"


def _recursive_files(folder: str, extensions=None, reject=None):
    try:
        found = set(folder_paths.get_filename_list(folder))
    except Exception:
        found = set()
    try:
        roots = folder_paths.get_folder_paths(folder)
    except Exception:
        roots = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        for current, _dirs, files in os.walk(root):
            for filename in files:
                lower = filename.lower()
                if extensions and not lower.endswith(extensions):
                    continue
                if reject and reject(lower):
                    continue
                found.add(os.path.relpath(os.path.join(current, filename), root))
    return sorted(found)


def _models():
    return _recursive_files("diffusion_models", (".safetensors", ".gguf", ".ckpt", ".pt", ".pth"))


def _clips():
    return _recursive_files(
        "text_encoders",
        (".safetensors", ".gguf", ".ckpt", ".pt", ".pth"),
        reject=lambda name: "mmproj" in name,
    )


def _mmprojs():
    return ["(auto)"] + _recursive_files(
        "text_encoders", (".gguf",), reject=lambda name: "mmproj" not in name
    )


def _choices(items, allow_off=False):
    values = ([OFF] if allow_off else []) + list(items)
    return values or [OFF]


def _unwrap(value):
    if hasattr(value, "result"):
        value = value.result
    if isinstance(value, (tuple, list)):
        return value[0]
    return value


class MuseMiniMaxH3UnifiedLoader:
    """Load one selected H3 profile and build the complete Director model stack."""

    PROFILES = ("Automatic", "Low VRAM", "Balanced", "Maximum Quality")
    ORDER = ("Low VRAM", "Balanced", "Maximum Quality")

    @classmethod
    def INPUT_TYPES(cls):
        models = _models()
        clips = _clips()
        mmprojs = _mmprojs()
        vaes = folder_paths.get_filename_list("vae") or [OFF]
        loras = _choices(folder_paths.get_filename_list("loras"), allow_off=True)
        model_profiles = _choices(models, allow_off=True)
        clip_profiles = _choices(clips, allow_off=True)
        return {
            "required": {
                "profile": (cls.PROFILES, {"default": "Automatic"}),
                "low_vram_model": (model_profiles,),
                "low_vram_clip": (clip_profiles,),
                "low_vram_mmproj": (mmprojs,),
                "balanced_model": (model_profiles,),
                "balanced_clip": (clip_profiles,),
                "balanced_mmproj": (mmprojs,),
                "maximum_quality_model": (model_profiles,),
                "maximum_quality_clip": (clip_profiles,),
                "maximum_quality_mmproj": (mmprojs,),
                "model_fl2va": (_choices(models, allow_off=True),),
                "video_vae": (vaes,),
                "audio_vae": (vaes,),
                "lora_1": (loras,),
                "lora_1_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}),
                "lora_1_target": (("Both models", "Reference model", "First/Last model"),),
                "lora_2": (loras,),
                "lora_2_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}),
                "lora_2_target": (("Both models", "Reference model", "First/Last model"),),
                "lora_3": (loras,),
                "lora_3_strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05}),
                "lora_3_target": (("Both models", "Reference model", "First/Last model"),),
                "attention_backend": (("Off", "comfy kitchen attention", "pytorch attention"), {"default": "Off"}),
                "sage_attention": ("BOOLEAN", {"default": True}),
                "low_vram_attention": ("BOOLEAN", {"default": True}),
                "attention_head_chunks": ("INT", {"default": 4, "min": 1, "max": 56}),
                "chunk_feed_forward": ("BOOLEAN", {"default": True}),
                "feed_forward_chunks": ("INT", {"default": 2, "min": 1, "max": 64}),
                "feed_forward_threshold": ("INT", {"default": 4096, "min": 256, "max": 262144, "step": 256}),
                "activation_reserve_gb": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 128.0, "step": 0.5}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "VAE", "MODEL", "STRING", "FLOAT", "STRING")
    RETURN_NAMES = (
        "model", "clip", "vae", "audio_vae", "model_fl2va",
        "selected_profile", "detected_vram_gb", "status",
    )
    FUNCTION = "load"
    CATEGORY = "Muse Collective/MiniMax H3"
    DESCRIPTION = (
        "One configurable loader for the complete Muse MiniMax H3 Director model stack. "
        "It selects only one MODEL/CLIP profile, then applies optional LoRAs and attention patches."
    )

    def __init__(self):
        self._lora_loaders = {}

    @staticmethod
    def _vram_gb():
        try:
            if not torch.cuda.is_available():
                return 0.0
            props = torch.cuda.get_device_properties(torch.cuda.current_device())
            return round(float(props.total_memory) / (1024.0 ** 3), 2)
        except Exception as exc:
            LOGGER.warning("[Muse Unified Loader] VRAM detection failed: %s", exc)
            return 0.0

    @staticmethod
    def _recommended(vram_gb):
        if vram_gb <= 12.5:
            return "Low VRAM"
        if vram_gb <= 20.5:
            return "Balanced"
        return "Maximum Quality"

    @staticmethod
    def _prefix(profile):
        return {
            "Low VRAM": "low_vram",
            "Balanced": "balanced",
            "Maximum Quality": "maximum_quality",
        }[profile]

    @classmethod
    def _select_profile(cls, requested, vram_gb, values):
        preferred = cls._recommended(vram_gb) if requested == "Automatic" else requested
        available = []
        for profile in cls.ORDER:
            prefix = cls._prefix(profile)
            if values[f"{prefix}_model"] != OFF and values[f"{prefix}_clip"] != OFF:
                available.append(profile)
        if not available:
            raise RuntimeError("Configure at least one complete MODEL/CLIP profile pair.")
        if preferred in available:
            return preferred, preferred
        index = cls.ORDER.index(preferred)
        lower = [p for p in available if cls.ORDER.index(p) < index]
        if lower:
            return max(lower, key=cls.ORDER.index), preferred
        higher = [p for p in available if cls.ORDER.index(p) > index]
        return min(higher, key=cls.ORDER.index), preferred

    # [2026-09-05] Added: these nodes are looked up dynamically at runtime, not
    # wired as their own nodes in the saved workflow graph — so when one is
    # missing, ComfyUI Manager's "install missing custom nodes" scanner (which
    # only reads node types actually present in the workflow JSON) has no way
    # to know it's needed. Confirmed directly: a fresh install with this
    # loader's dependencies not yet installed gets no such prompt at all, just
    # a bare RuntimeError - someone who downloads this without also watching a
    # setup video would be stuck. Naming the exact required package and where
    # to get it, per node, so the error is self-explanatory on its own.
    _REQUIRED_NODE_SOURCES = {
        "H3ModelLoaderAny": "ComfyUI-H3-Multishot (https://github.com/jlucasmcrell/ComfyUI-H3-Multishot)",
        "H3ClipLoaderAny": "ComfyUI-H3-Multishot (https://github.com/jlucasmcrell/ComfyUI-H3-Multishot)",
        "ModelAttentionBackend": "ComfyUI-KJNodes (https://github.com/kijai/ComfyUI-KJNodes)",
        "MiniMaxH3MemoryEfficientSageAttentionPatch": "ComfyUI-KJNodes (https://github.com/kijai/ComfyUI-KJNodes)",
        "MiniMaxLowVRAMAttention": "ComfyUI-KJNodes (https://github.com/kijai/ComfyUI-KJNodes)",
        "MiniMaxChunkFeedForward": "ComfyUI-KJNodes (https://github.com/kijai/ComfyUI-KJNodes)",
    }

    @classmethod
    def _registry_class(cls, name):
        node_class = nodes.NODE_CLASS_MAPPINGS.get(name)
        if node_class is None:
            source = cls._REQUIRED_NODE_SOURCES.get(name, "a required custom node package")
            raise RuntimeError(
                f"Required node '{name}' is not installed or did not load. "
                f"Install {source} into your ComfyUI/custom_nodes folder and restart ComfyUI. "
                f"This dependency won't show up in ComfyUI Manager's 'install missing custom "
                f"nodes' prompt, since it isn't a node placed directly in the workflow graph — "
                f"it has to be installed manually."
            )
        return node_class

    def _load_model(self, filename, reserve):
        loader = self._registry_class("H3ModelLoaderAny")()
        return _unwrap(loader.load(filename, reserve))

    def _load_clip(self, filename, mmproj):
        loader = self._registry_class("H3ClipLoaderAny")()
        return _unwrap(loader.load(filename, "minimax", mmproj))

    def _apply_lora(self, model, filename, strength):
        if filename == OFF or strength == 0:
            return model
        loader = self._lora_loaders.setdefault(filename, nodes.LoraLoaderModelOnly())
        return loader.load_lora_model_only(model, filename, strength)[0]

    @staticmethod
    def _run_v3(name, model, **kwargs):
        node_class = MuseMiniMaxH3UnifiedLoader._registry_class(name)
        return _unwrap(node_class.execute(model=model, **kwargs))

    def _patch_attention(self, model, values):
        backend = values["attention_backend"]
        if backend != "Off":
            model = _unwrap(self._registry_class("ModelAttentionBackend")().patch(model, backend))
        # Sol-Attn removed 2026-09-04: confirmed via a controlled A/B test (same
        # GGUF Low-VRAM run, only this toggle changed) to cause an unload to free
        # almost nothing at a chunk-transition point and stall the render there.
        # Every other attention option here has run clean in every render since
        # this node existed; this was the only one that ever produced that failure.
        if values["sage_attention"]:
            model = self._run_v3("MiniMaxH3MemoryEfficientSageAttentionPatch", model)
        if values["low_vram_attention"]:
            model = self._run_v3(
                "MiniMaxLowVRAMAttention", model,
                head_chunks=values["attention_head_chunks"],
            )
        if values["chunk_feed_forward"]:
            model = self._run_v3(
                "MiniMaxChunkFeedForward", model,
                chunks=values["feed_forward_chunks"],
                seq_threshold=values["feed_forward_threshold"],
            )
        return model

    def load(self, **values):
        vram_gb = self._vram_gb()
        selected, preferred = self._select_profile(values["profile"], vram_gb, values)
        prefix = self._prefix(selected)
        model = self._load_model(values[f"{prefix}_model"], values["activation_reserve_gb"])
        clip = self._load_clip(values[f"{prefix}_clip"], values[f"{prefix}_mmproj"])
        fl2va = None
        if values["model_fl2va"] != OFF:
            fl2va = self._load_model(values["model_fl2va"], values["activation_reserve_gb"])

        for index in range(1, 4):
            filename = values[f"lora_{index}"]
            strength = values[f"lora_{index}_strength"]
            target = values[f"lora_{index}_target"]
            if target in ("Both models", "Reference model"):
                model = self._apply_lora(model, filename, strength)
            if fl2va is not None and target in ("Both models", "First/Last model"):
                fl2va = self._apply_lora(fl2va, filename, strength)

        model = self._patch_attention(model, values)
        if fl2va is not None:
            fl2va = self._patch_attention(fl2va, values)

        video_vae = nodes.VAELoader().load_vae(values["video_vae"])[0]
        audio_vae = nodes.VAELoader().load_vae(values["audio_vae"])[0]
        source = "automatically" if values["profile"] == "Automatic" else "manually"
        enabled_loras = [values[f"lora_{i}"] for i in range(1, 4) if values[f"lora_{i}"] != OFF]
        patches = []
        if values["attention_backend"] != "Off": patches.append(values["attention_backend"])
        if values["sage_attention"]: patches.append("SageAttention")
        if values["low_vram_attention"]: patches.append("Low-VRAM attention")
        if values["chunk_feed_forward"]: patches.append("chunked feed-forward")
        status = (
            f"{selected} was {source} selected. Detected VRAM: {vram_gb:.2f} GB. "
            f"LoRAs: {', '.join(enabled_loras) if enabled_loras else 'none'}. "
            f"Patches: {', '.join(patches) if patches else 'none'}."
        )
        if selected != preferred:
            status += f" {preferred} was requested/recommended but disabled; using {selected}."
        if fl2va is None:
            status += " First/Last-frame model is disabled."
        LOGGER.info("[Muse Unified Loader] %s", status)
        return {
            "ui": {"text": [status]},
            "result": (model, clip, video_vae, audio_vae, fl2va, selected, vram_gb, status),
        }


NODE_CLASS_MAPPINGS = {"MuseMiniMaxH3UnifiedLoader": MuseMiniMaxH3UnifiedLoader}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MuseMiniMaxH3UnifiedLoader": "Muse MiniMax H3 Unified Loader (POC)"
}
