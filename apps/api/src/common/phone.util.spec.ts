import { normalizePhone, isMobile, formatPhone } from './phone.util';
describe('normalizePhone', () => {
  it('unifies every way the same mobile can be written', () => {
    const forms = ['۰۹۱۲۱۱۱۲۲۳۳','09121112233','+989121112233','0098 912 111 2233','0912-111-2233','٠٩١٢١١١٢٢٣٣','989121112233','9121112233'];
    const out = forms.map(normalizePhone);
    expect(new Set(out).size).toBe(1);
    expect(out[0]).toBe('09121112233');
  });
  it('keeps landlines', () => { expect(normalizePhone('۰۲۱-۳۳۴۴۵۵۶۶')).toBe('02133445566'); });
  it('rejects junk', () => { expect(normalizePhone('سلام')).toBeNull(); expect(normalizePhone('')).toBeNull(); });
  it('is idempotent', () => { const a = normalizePhone('+98 912 111 2233')!; expect(normalizePhone(a)).toBe(a); });
  it('knows mobile vs landline', () => { expect(isMobile('09121112233')).toBe(true); expect(isMobile('02133445566')).toBe(false); });
  it('formats for display', () => { expect(formatPhone('09121112233')).toBe('0912 111 2233'); });
});
