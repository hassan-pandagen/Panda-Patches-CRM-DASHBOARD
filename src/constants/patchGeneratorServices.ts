// src/constants/patchGeneratorServices.ts
// The automated mockup services offered by the Patch Generator page.
//
// `value` is the EXACT patch_type string the VPS engine expects — it must be a
// category key from the engine's categories.json (the engine also accepts labels/aliases,
// but keys are the safe canonical match). `label` is what the agent sees.
//
// Only engine-supported categories appear here. The CRM's full patch-type list has ~32
// entries, but the engine can only auto-mockup these; unsupported types (combos, transfers,
// coins, keychains, pins, sample boxes) stay manual — exactly as they are today.
export interface PatchService {
  value: string; // engine categories.json key
  label: string; // shown in the dropdown
  note?: string; // short producibility hint (shown under the picker)
}

export const PATCH_GENERATOR_SERVICES: PatchService[] = [
  { value: 'embroidery', label: 'Embroidery' },
  { value: 'puff_3d', label: '3D Puff', note: 'Max 2 colours, bold shapes only' },
  { value: 'pvc', label: 'PVC', note: 'Max 8 in' },
  { value: 'silicone', label: 'Silicone', note: 'Max 8 in' },
  { value: 'woven', label: 'Woven', note: 'Max 8 in — holds fine detail' },
  { value: 'printed', label: 'Printed', note: 'Unlimited colour, gradients OK' },
  { value: 'leather', label: 'Leather', note: 'Laser-engraved, 1–2 tones' },
  { value: 'chenille', label: 'Chenille', note: 'Bold shapes, min ~3 in' },
  { value: 'sequin', label: 'Sequin', note: 'Large bold designs, min ~3 in' },
];
