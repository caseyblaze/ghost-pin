const { validateCoords } = require('../src/validate');

describe('validateCoords', () => {
  test('accepts valid coordinates', () => {
    expect(validateCoords(25.0330, 121.5654)).toEqual({ ok: true, lat: 25.0330, lng: 121.5654 });
  });

  test('accepts numeric strings and coerces them', () => {
    expect(validateCoords('25.0330', '121.5654')).toEqual({ ok: true, lat: 25.0330, lng: 121.5654 });
  });

  test('accepts boundary values', () => {
    expect(validateCoords(-90, -180).ok).toBe(true);
    expect(validateCoords(90, 180).ok).toBe(true);
  });

  test('rejects lat out of range', () => {
    expect(validateCoords(91, 0)).toEqual({ ok: false, message: 'lat 超出範圍 [-90, 90]' });
  });

  test('rejects lng out of range', () => {
    expect(validateCoords(0, 181)).toEqual({ ok: false, message: 'lng 超出範圍 [-180, 180]' });
  });

  test('rejects non-numeric input', () => {
    expect(validateCoords('abc', 0)).toEqual({ ok: false, message: 'lat 不是有效數字' });
    expect(validateCoords(0, 'xyz')).toEqual({ ok: false, message: 'lng 不是有效數字' });
  });

  test('rejects missing input', () => {
    expect(validateCoords(undefined, undefined)).toEqual({ ok: false, message: 'lat 不是有效數字' });
  });
});
