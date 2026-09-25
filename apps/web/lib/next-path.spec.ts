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
    // 백슬래시는 String.raw로 — 보통 템플릿 리터럴에서 `\e`는 `e`가 된다
    String.raw`/\evil.example/events/${ID}`,
    `/events/\\${ID}`,
    `/events/%2F${ID}`,
    // `/events/` 접두 검사가 빠지면 통과하는 모양 — 앞 8글자만 다르고 나머지는 UUID
    `/Events/${ID}`,
    `/eventsX${ID}`,
    `//x.io/?${ID}`,
    `https:/${ID}`,
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
    // 호출자가 검사하지 않은 값을 넘겨도 붙이지 않는다
    expect(withNext('/login', '//evil.example')).toBe('/login');
  });
});
