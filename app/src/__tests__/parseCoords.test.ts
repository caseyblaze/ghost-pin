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

  it('returns null for negative lat out of range', () => {
    expect(parseCoords('(-91, 0)')).toBeNull();
  });

  it('accepts boundary lat/lng values', () => {
    expect(parseCoords('(90, 180)')).toEqual({ lat: 90, lng: 180 });
    expect(parseCoords('(-90, -180)')).toEqual({ lat: -90, lng: -180 });
  });

  it('returns null for mismatched parentheses', () => {
    expect(parseCoords('(25.0330, 121.5654')).toBeNull();
    expect(parseCoords('25.0330, 121.5654)')).toBeNull();
  });

  it('returns null for bare format without decimals', () => {
    expect(parseCoords('25, 121')).toBeNull();
    expect(parseCoords('0, 0')).toBeNull();
  });

  it('accepts bare format with decimals', () => {
    expect(parseCoords('25.0, 121.0')).toEqual({ lat: 25, lng: 121 });
  });

  it('preserves 7 decimal places', () => {
    expect(parseCoords('25.1234567, 121.9876543')).toEqual({ lat: 25.1234567, lng: 121.9876543 });
    expect(parseCoords('(25.1234567, 121.9876543)')).toEqual({ lat: 25.1234567, lng: 121.9876543 });
  });
});
