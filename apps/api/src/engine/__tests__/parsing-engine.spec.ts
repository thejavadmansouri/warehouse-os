import { ParsingEngineCore } from '../parsing-engine.core';
import { normalizePersian } from '../utils/persian-normalize';

// Minimal in-memory dictionary (no DB) mirroring what DictionaryLoaderService
// produces, including the family / family+number vehicle aliases.
function buildDict(): any {
  return {
    products: [
      { id: 'p1', name: 'لنت ترمز جلو', category: 'قطعه', aliases: ['لنت ترمز جلو', 'لنت جلو', 'لنت'] },
      { id: 'p2', name: 'فیلتر روغن', category: 'قطعه', aliases: ['فیلتر روغن'] },
    ],
    vehicles: [
      { family: 'پراید 111', variant: 'پراید 111', engine: '', gearbox: '', aliases: ['پراید 111', 'پراید'] },
      { family: 'پژو 206 تیپ 5', variant: 'پژو 206 تیپ 5', engine: '', gearbox: '', aliases: ['پژو 206 تیپ 5', 'پژو', 'پژو 206'] },
    ],
    brands: { تکستار: 'تکستار', textar: 'تکستار', سرکان: 'سرکان' },
    engines: {},
    gearboxes: {},
    units: { عدد: 'عدد', تا: 'عدد' },
    colors: {},
    sides: {},
    positions: {},
    conditions: { سالم: 'سالم', خراب: 'خراب' },
    actions: {},
    locations: {},
    packaging: {},
    speechErrors: {},
  };
}

describe('normalizePersian', () => {
  it('unifies Persian and ASCII digits', () => {
    expect(normalizePersian('پژو ۲۰۶')).toBe(normalizePersian('پژو 206'));
  });

  it('is idempotent', () => {
    const x = 'لنت ﺟﻠﻮ ﻛﺴﺘﺎﺭ ۵ عدد';
    expect(normalizePersian(normalizePersian(x))).toBe(normalizePersian(x));
  });
});

describe('ParsingEngineCore — vehicle family resolution', () => {
  const engine = new ParsingEngineCore(buildDict());

  it('resolves a bare family mention («پراید») and word-number quantity', () => {
    const r: any = engine.parse('سی تا لنت جلو تکستار پراید');
    expect(r.data.vehicleFamily).toBe('پراید');
    expect(r.data.quantity).toBe(30);
    expect(r.data.brand).toBe('تکستار');
  });

  it('resolves family + model number («پژو 206») from Persian digits, not a wrong variant', () => {
    const r: any = engine.parse('فیلتر روغن پژو ۲۰۶ سرکان');
    expect(r.data.vehicleFamily).toBe('پژو 206');
    expect(r.data.brand).toBe('سرکان');
  });
});
