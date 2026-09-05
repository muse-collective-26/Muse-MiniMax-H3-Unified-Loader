import importlib.util
import sys
import types
from pathlib import Path


def _load_module():
    folder_paths = types.ModuleType("folder_paths")
    folder_paths.get_filename_list = lambda kind: {
        "diffusion_models": ["q4.gguf", "q6.gguf", "full.safetensors", "fl2va.safetensors"],
        "text_encoders": ["q4-clip.gguf", "full-clip.safetensors"],
        "vae": ["video.safetensors", "audio.safetensors"],
        "loras": ["turbo.safetensors"],
    }.get(kind, [])
    folder_paths.get_folder_paths = lambda kind: []
    sys.modules["folder_paths"] = folder_paths
    fake_nodes = types.ModuleType("nodes")
    fake_nodes.NODE_CLASS_MAPPINGS = {}
    fake_nodes.LoraLoaderModelOnly = object
    fake_nodes.VAELoader = object
    sys.modules["nodes"] = fake_nodes
    fake_torch = types.ModuleType("torch")
    fake_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    sys.modules["torch"] = fake_torch
    path = Path(__file__).parents[1] / "nodes.py"
    spec = importlib.util.spec_from_file_location("muse_unified_nodes", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_automatic_profile_and_fallback():
    module = _load_module()
    cls = module.MuseMiniMaxH3UnifiedLoader
    values = {
        "low_vram_model": "q4.gguf", "low_vram_clip": "q4-clip.gguf",
        "balanced_model": "q6.gguf", "balanced_clip": "q4-clip.gguf",
        "maximum_quality_model": module.OFF, "maximum_quality_clip": module.OFF,
    }
    assert cls._select_profile("Automatic", 12.0, values)[0] == "Low VRAM"
    assert cls._select_profile("Automatic", 16.0, values)[0] == "Balanced"
    assert cls._select_profile("Automatic", 32.0, values) == ("Balanced", "Maximum Quality")


def test_dropdowns_are_dynamic_and_allow_disabled_profiles():
    module = _load_module()
    required = module.MuseMiniMaxH3UnifiedLoader.INPUT_TYPES()["required"]
    assert "q6.gguf" in required["balanced_model"][0]
    assert module.OFF in required["maximum_quality_model"][0]
    assert module.OFF in required["lora_1"][0]
