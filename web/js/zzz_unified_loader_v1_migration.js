import { app } from "../../../scripts/app.js";

const NODE_NAME = "MuseMiniMaxH3UnifiedLoader";
const OLD_WIDGET_COUNT = 32;

app.registerExtension({
  name: "Muse.MiniMaxH3UnifiedLoader.V1ProfileMigration",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      // V1 had one model_fl2va value at index 10. V2 replaces that value
      // with Low/Balanced/Maximum fields. Preserve the old choice as Low VRAM
      // and insert two disabled slots, keeping every later VAE/LoRA/attention
      // value at its original index rather than allowing positional drift.
      if (Array.isArray(info?.widgets_values) && info.widgets_values.length === OLD_WIDGET_COUNT) {
        const migrated = [...info.widgets_values];
        migrated.splice(11, 0, "(disabled)", "(disabled)");
        info = { ...info, widgets_values: migrated };
      }
      return configured?.call(this, info);
    };
  },
});
