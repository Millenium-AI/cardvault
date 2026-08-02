// Standardize condition names across frontend and backend
export function standardizeCondition(condition: string | null | undefined): string {
  if (!condition) return '';
  const c = condition.toLowerCase().trim();
  const conditionMap: Record<string, string> = {
    'nm': 'near mint',
    'lp': 'lightly played',
    'mp': 'moderately played',
    'hp': 'heavily played',
    'dmg': 'damaged',
    'unopened': 'unopened',
    'sealed': 'unopened',
    'sld': 'unopened',
    'sealed - sld': 'unopened',
  };
  return conditionMap[c] || c;
}

// Convert backend condition to frontend UI display
export function getDisplayCondition(condition: string | null | undefined): string {
  if (!condition) return '';
  const c = condition.toLowerCase().trim();
  if (c === 'unopened') return 'Sealed - SLD';
  if (c === 'near mint') return 'Near Mint (NM)';
  if (c === 'lightly played') return 'Lightly Played (LP)';
  if (c === 'moderately played') return 'Moderately Played (MP)';
  if (c === 'heavily played') return 'Heavily Played (HP)';
  if (c === 'damaged') return 'Damaged (DMG)';
  return condition;
}

// Convert frontend UI condition to backend condition
// Preserves Title Case for all conditions; special-cases sealed aliases to "Unopened"
export function getBackendCondition(uiCondition: string | null | undefined): string {
  if (!uiCondition) return '';
  const trimmed = uiCondition.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'sealed - sld' || lower === 'sld' || lower === 'sealed' || lower === 'unopened') {
    return 'Unopened';
  }
  return trimmed;
}

// List of all available conditions for UI dropdowns
export const UI_CONDITIONS = [
  { value: 'Near Mint', label: 'Near Mint (NM)' },
  { value: 'Lightly Played', label: 'Lightly Played (LP)' },
  { value: 'Moderately Played', label: 'Moderately Played (MP)' },
  { value: 'Heavily Played', label: 'Heavily Played (HP)' },
  { value: 'Damaged', label: 'Damaged (DMG)' },
  { value: 'Sealed - SLD', label: 'Sealed - SLD' },
];
