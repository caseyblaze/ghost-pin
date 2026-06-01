export type Coords = { lat: number; lng: number };

export function parseCoords(text: string): Coords | null {
  const NUM = '-?\\d+(?:\\.\\d+)?';
  const match =
    text.trim().match(new RegExp(`^\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)$`)) ||
    text.trim().match(new RegExp(`^(${NUM})\\s*,\\s*(${NUM})$`));
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
