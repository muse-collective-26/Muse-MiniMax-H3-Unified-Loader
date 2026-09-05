"""Master attention switch for the Muse MiniMax H3 unified loader."""

from .nodes_userfriendly import MuseMiniMaxH3UnifiedLoader as _FriendlyLoader


class MuseMiniMaxH3UnifiedLoader(_FriendlyLoader):
    @classmethod
    def INPUT_TYPES(cls):
        schema = super().INPUT_TYPES()
        # Append for saved-workflow compatibility. The fascia repositions this
        # control visually at the top of the Attention & Memory card.
        schema["required"]["attention_enabled"] = (
            "BOOLEAN",
            {
                "default": True,
                "label_on": "Attention optimisations ON",
                "label_off": "Attention optimisations OFF",
                "tooltip": "Master bypass for every attention and feed-forward patch in this loader.",
            },
        )
        return schema

    def _patch_attention(self, model, values):
        if not values.get("attention_enabled", True):
            return model
        return super()._patch_attention(model, values)


NODE_CLASS_MAPPINGS = {"MuseMiniMaxH3UnifiedLoader": MuseMiniMaxH3UnifiedLoader}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MuseMiniMaxH3UnifiedLoader": "Muse MiniMax H3 Unified Loader (POC)"
}
