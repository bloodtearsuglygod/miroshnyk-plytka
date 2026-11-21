export const tiles = [
  { id: 'calacatta', name: 'Калакатта', finish: 'Мрамор · сатин', size: [60, 60], price: 2490, fallbackColor: '#e1e5eb' },
  { id: 'beton', name: 'Серый бетон', finish: 'Бетон · матовая', size: [60, 60], price: 1890, fallbackColor: '#89939e' },
  { id: 'travertine', name: 'Травертин', finish: 'Камень · матовая', size: [30, 60], price: 2290, fallbackColor: '#c2a78a' },
  { id: 'navy', name: 'Синий сланец', finish: 'Камень · рельеф', size: [20, 60], price: 2890, fallbackColor: '#4c6380' },
];

export const currency = 'UAH';
export const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 });
export const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const areaLimits = { min: 0.1, max: 10000 };
export const minimumSide = 0.1;

export function parseArea(value) {
  const input = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return null;
  const area = Number(input);
  return area >= areaLimits.min && area <= areaLimits.max ? area : null;
}

export function calculate(tile, area, reserve) {
  const billedHundredths = Math.round(Math.round(area * 100) * (reserve ? 1.1 : 1));
  const pieceArea = tile.size[0] * tile.size[1] / 10000;
  return {
    billedArea: billedHundredths / 100,
    total: Math.round(billedHundredths * tile.price / 100),
    pieces: Math.ceil((billedHundredths / 100 - 1e-8) / pieceArea),
  };
}

export function layoutDimensions(area, aspect = 1.25) {
  const width = Math.max(minimumSide, Math.min(area / minimumSide, Math.sqrt(area * aspect)));
  return { width, depth: area / width };
}
