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
  };
  return conditionMap[c] || c;
}
