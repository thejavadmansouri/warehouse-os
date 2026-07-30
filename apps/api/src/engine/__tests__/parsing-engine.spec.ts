import { ParsingEngineCore } from '../parsing-engine.core';
import { normalizePersian } from '../utils/persian-normalize';

// In-memory dictionary (no DB) mirroring DictionaryLoaderService output, including
// the family / family+number vehicle aliases.
function buildDict(): any {
  return {
    products: [
      { id: 'p1', name: 'لنت ترمز جلو', category: 'قطعه', aliases: ['لنت ترمز جلو', 'لنت جلو', 'لنت'] },
      { id: 'p2', name: 'فیلتر روغن', category: 'قطعه', aliases: ['فیلتر روغن'] },
    ],
    vehicles: [
      { family: 'پراید 111', variant: 'پراید 111', engine: '', gearbox: '', aliases: ['پراید 111', 'پراید'] },
      { family: 'پراید 131', variant: 'پراید 131', engine: '', gearbox: '', aliases: ['پراید 131', 'پراید'] },
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

describe('ParsingEngineCore — never invent a vehicle model', () => {
  const engine = new ParsingEngineCore(buildDict());

  it('family-only mention keeps model null (پراید → not Pride 131)', () => {
    const r: any = engine.parse('سه تا لنت جلو تکستار پراید');
    expect(r.data.vehicleFamily).toBe('پراید');
    expect(r.data.vehicleModel).toBeNull();
    expect(r.data.quantity).toBe(3);
    expect(r.data.brand).toBe('تکستار');
  });

  it('explicit model sets vehicleModel (پراید 131)', () => {
    const r: any = engine.parse('سه تا لنت جلو تکستار پراید 131');
    expect(r.data.vehicleFamily).toBe('پراید');
    expect(r.data.vehicleModel).toBe('پراید 131');
  });

  it('family + model number is a model, not family-only (پژو 206, Persian digits)', () => {
    const r: any = engine.parse('فیلتر روغن پژو ۲۰۶ سرکان');
    expect(r.data.vehicleFamily).toBe('پژو');
    expect(r.data.vehicleModel).toBe('پژو 206');
    expect(r.data.brand).toBe('سرکان');
  });

  it('bare family does not guess a model (پژو → null)', () => {
    const r: any = engine.parse('فیلتر روغن پژو');
    expect(r.data.vehicleFamily).toBe('پژو');
    expect(r.data.vehicleModel).toBeNull();
  });
});
