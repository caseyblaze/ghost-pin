import { parseCoords } from '../parseCoords';

describe('parseCoords', () => {
  it('parses (lat, lng) with parentheses', () => {
    expect(parseCoords('(25.0330, 121.5654)')).toEqual({ lat: 25.033, lng: 121.5654 });
  });

  it('parses lat, lng without parentheses', () => {
    expect(parseCoords('25.0330, 121.5654')).toEqual({ lat: 25.033, lng: 121.5654 });
  });

  it('parses negative coordinates', () => {
    expect(parseCoords('(-33.8688, 151.2093)')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it('returns null for lat out of range', () => {
    expect(parseCoords('(91, 0)')).toBeNull();
  });

  it('returns null for lng out of range', () => {
    expect(parseCoords('(0, 181)')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseCoords('hello world')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCoords('')).toBeNull();
  });

  it('returns null for single number', () => {
    expect(parseCoords('25.0330')).toBeNull();
  });

  it('handles extra whitespace', () => {
    expect(parseCoords('(  25.0330 ,  121.5654  )')).toEqual({ lat: 25.033, lng: 121.5654 });
  });
});
