import { shelfDisplayNumber } from './shelf-display-number';

describe('shelfDisplayNumber', () => {
  it('takes the last digits from the Persian name', () => {
    expect(shelfDisplayNumber('باکس ۵', 'LOC-1')).toBe('5');
    expect(shelfDisplayNumber('باکس 12', 'x')).toBe('12');
  });

  it('falls back to a numeric code', () => {
    expect(shelfDisplayNumber('قفسه', '07')).toBe('07');
  });

  it('falls back to digits inside the code', () => {
    expect(shelfDisplayNumber('قفسه', 'A-03-B')).toBe('03');
  });
});
