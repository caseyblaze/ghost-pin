function validateCoords(latInput, lngInput) {
  const lat = Number(latInput);
  if (latInput === undefined || latInput === null || latInput === '' || Number.isNaN(lat)) {
    return { ok: false, message: 'lat 不是有效數字' };
  }
  const lng = Number(lngInput);
  if (lngInput === undefined || lngInput === null || lngInput === '' || Number.isNaN(lng)) {
    return { ok: false, message: 'lng 不是有效數字' };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, message: 'lat 超出範圍 [-90, 90]' };
  }
  if (lng < -180 || lng > 180) {
    return { ok: false, message: 'lng 超出範圍 [-180, 180]' };
  }
  return { ok: true, lat, lng };
}

module.exports = { validateCoords };
