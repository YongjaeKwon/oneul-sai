import { eventNextPath, withNext } from './next-path';

// SPEC-003 13절 단위 "web 로그인 뒤 돌아갈 주소" — `/events/<UUID>`와 글자 그대로 맞을 때만(D12).

const ID = '1b2c3d4e-5f60-4718-9a0b-1c2d3e4f5a6b';

describe('eventNextPath (D12)', () => {
  it('accepts exactly an event detail path', () => {
    expect(eventNextPath(`/events/${ID}`)).toBe(`/events/${ID}`);
  });

  it.each([
    null,
    undefined,
    '',
    '/me',
    '/events',
    `/events/${ID}/`,
    `/events/${ID}?x=1`,
    `/events/${ID}#top`,
    `/events/${ID}/../../me`,
    `//evil.example/events/${ID}`,
    `/\evil.example/events/${ID}`,
    `https://evil.example/events/${ID}`,
    `/events/not-a-uuid`,
    ` /events/${ID}`,
  ])('rejects %j', (next) => {
    expect(eventNextPath(next)).toBeNull();
  });
});

describe('withNext', () => {
  it('carries a checked next between login and signup, and nothing otherwise', () => {
    expect(withNext('/signup', `/events/${ID}`)).toBe(
      `/signup?next=/events/${ID}`,
    );
    expect(withNext('/login', null)).toBe('/login');
  });
});
