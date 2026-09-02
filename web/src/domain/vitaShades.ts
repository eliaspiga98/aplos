export const VITA_SHADE_GROUPS = [
  { label: 'Bleach', values: ['BL1', 'BL2', 'BL3'] },
  { label: 'A', values: ['A1', 'A2', 'A3', 'A3.5', 'A4'] },
  { label: 'B', values: ['B1', 'B2', 'B3', 'B4'] },
  { label: 'C', values: ['C1', 'C2', 'C3', 'C4'] },
  { label: 'D', values: ['D2', 'D3', 'D4'] },
] as const;

export const VITA_SHADES = VITA_SHADE_GROUPS.flatMap((group) => group.values);
