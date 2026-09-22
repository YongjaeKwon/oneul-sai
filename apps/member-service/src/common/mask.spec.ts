import { maskEmail, maskPhone } from './mask.js';

describe('mask', () => {
  it('masks the local part of an email keeping two characters', () => {
    expect(maskEmail('yongjae@gmail.com')).toBe('yo***@gmail.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('no-at-sign')).toBe('***');
  });

  it('masks the middle of a phone number', () => {
    expect(maskPhone('01012345678')).toBe('010****5678');
    expect(maskPhone('010-1234-5678')).toBe('010****5678');
    expect(maskPhone('1234')).toBe('***');
  });
});
