export type Coords = { lat: number; lng: number };

const ANY_NUM = '-?\\d+(?:\\.\\d+)?';
const DECIMAL_NUM = '-?\\d+\\.\\d+';
const PAREN_RE = new RegExp(`^\\(\\s*(${ANY_NUM})\\s*,\\s*(${ANY_NUM})\\s*\\)$`);
const BARE_RE  = new RegExp(`^(${DECIMAL_NUM})\\s*,\\s*(${DECIMAL_NUM})$`);

export function parseCoords(text: string): Coords | null {
  const trimmed = text.trim();
  const match = trimmed.match(PAREN_RE) ?? trimmed.match(BARE_RE);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
