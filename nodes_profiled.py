"""Profile-matched reference and First/Last model branches."""

from .nodes import (
    MuseMiniMaxH3UnifiedLoader as _BaseLoader,
    OFF,
    _choices,
    _models,
)


class MuseMiniMaxH3UnifiedLoader(_BaseLoader):
    """Use one VRAM tier to select both H3 diffusion-model branches."""

    @classmethod
    def INPUT_TYPES(cls):
        schema = super().INPUT_TYPES()
        original = schema["required"]
        fl2va_choices = _choices(_models(), allow_off=True)
        rebuilt = {}
        for name, definition in original.items():
            if name == "model_fl2va":
                rebuilt["low_vram_fl2va"] = (fl2va_choices,)
                rebuilt["balanced_fl2va"] = (fl2va_choices,)
                rebuilt["maximum_quality_fl2va"] = (fl2va_choices,)
            else:
                rebuilt[name] = definition
        schema["required"] = rebuilt
        return schema

    def load(self, **values):
        vram_gb = self._vram_gb()
        selected, _preferred = self._select_profile(values["profile"], vram_gb, values)
        prefix = self._prefix(selected)
        values["model_fl2va"] = values[f"{prefix}_fl2va"]
        result = super().load(**values)
        status = result["result"][-1]
        selected_fl2va = values["model_fl2va"]
        if selected_fl2va != OFF and values.get("models_to_load", "Both / Mixed") != "Reference only":
            status += f" First/Last-frame branch uses the {selected} model: {selected_fl2va}."
        result["result"] = (*result["result"][:-1], status)
        result["ui"] = {"text": [status]}
        return result


NODE_CLASS_MAPPINGS = {"MuseMiniMaxH3UnifiedLoader": MuseMiniMaxH3UnifiedLoader}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MuseMiniMaxH3UnifiedLoader": "Muse MiniMax H3 Unified Loader (POC)"
}
