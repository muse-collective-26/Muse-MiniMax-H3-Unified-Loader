"""User-facing defaults layered over the paired-profile loader."""

from .nodes_profiled import MuseMiniMaxH3UnifiedLoader as _ProfiledLoader


def _preferred(names, required_words):
    lowered = [(name, name.lower()) for name in names]
    for name, lower in lowered:
        if all(word in lower for word in required_words):
            return name
    return names[0]


class MuseMiniMaxH3UnifiedLoader(_ProfiledLoader):
    @classmethod
    def INPUT_TYPES(cls):
        schema = super().INPUT_TYPES()
        required = schema["required"]
        vaes = list(required["video_vae"][0])
        required["video_vae"] = (
            vaes,
            {"default": _preferred(vaes, ("minimax", "video", "vae"))},
        )
        required["audio_vae"] = (
            vaes,
            {"default": _preferred(vaes, ("minimax", "audio", "vae"))},
        )
        return schema


NODE_CLASS_MAPPINGS = {"MuseMiniMaxH3UnifiedLoader": MuseMiniMaxH3UnifiedLoader}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MuseMiniMaxH3UnifiedLoader": "Muse MiniMax H3 Unified Loader (POC)"
}
