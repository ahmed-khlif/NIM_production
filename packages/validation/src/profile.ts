export const profileFamilies = ["IPE", "HEA", "UPN", "L", "ROND", "OTHER"] as const;
export type ProfileFamily = (typeof profileFamilies)[number];

/**
 * Classifies only detailed profiles that start with a supported family syntax.
 * Values such as DEMI-IPE400 are deliberately kept in OTHER.
 */
export function classifyProfile(profile: string): ProfileFamily {
  const value = profile.trim().toUpperCase();
  if (/^IPE\s*\d/.test(value)) return "IPE";
  if (/^HEA\s*\d/.test(value)) return "HEA";
  if (/^UPN\s*\d/.test(value)) return "UPN";
  if (/^L\s*\d/.test(value)) return "L";
  if (/^ROND\s*\d/.test(value)) return "ROND";
  return "OTHER";
}

export function normalizeProfile(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function calculateTotalWeightKg(unitWeightKg: number | undefined, quantity: number): number | undefined {
  if (unitWeightKg === undefined) return undefined;
  return Number((unitWeightKg * quantity).toFixed(3));
}

export function calculatePieceWeightKg(kgPerMeter: number, lengthMm: number): number {
  return Number(((kgPerMeter * lengthMm) / 1000).toFixed(3));
}
