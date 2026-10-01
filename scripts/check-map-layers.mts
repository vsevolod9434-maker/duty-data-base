import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mapLayers = require("../src/lib/map-layers") as typeof import("../src/lib/map-layers");

const { DEFAULT_MAP_LAYER, normalizeMapLayerKey, validateMapLayerInput } = mapLayers;

assert.equal(validateMapLayerInput({ name: "" }).ok, false);
assert.equal(validateMapLayerInput({ name: "x".repeat(81) }).ok, false);
assert.equal(validateMapLayerInput({ name: DEFAULT_MAP_LAYER }).ok, false);
assert.equal(validateMapLayerInput({ name: "  ОСНОВНОЙ   СЛОЙ  " }).ok, false);

const valid = validateMapLayerInput({ name: "  Северный   сектор  " });
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.data.name, "Северный сектор");
  assert.equal(valid.data.normalizedName, normalizeMapLayerKey("Северный сектор"));
}

console.log("Map layer checks passed.");
