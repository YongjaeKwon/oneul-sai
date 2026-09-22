import { vi } from 'vitest';
import { fakeResponse } from '../testing/fakes.js';
import { MembersController } from './members.controller.js';
import type { MembersService } from './members.service.js';

const user = {
  id: '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01',
  role: 'MEMBER' as const,
};

describe('MembersController', () => {
  it('withdraw: 204 path clears both refresh cookies with Max-Age=0 on /api/v1/auth', async () => {
    const members = { withdraw: vi.fn(async () => undefined) };
    const controller = new MembersController(
      members as unknown as MembersService,
      {
        COOKIE_SECURE: false,
        REFRESH_TTL: 60,
      },
    );
    const res = fakeResponse();

    await controller.withdraw(user, { password: 'pw' }, 'req-1', res.res);

    expect(members.withdraw).toHaveBeenCalledWith(
      user,
      { password: 'pw' },
      'req-1',
    );
    expect(
      res.cookies.map((cookie) => [
        cookie.name,
        cookie.value,
        cookie.options.maxAge,
        cookie.options.path,
      ]),
    ).toEqual([
      ['onulsai_rt_web', '', 0, '/api/v1/auth'],
      ['onulsai_rt_admin', '', 0, '/api/v1/auth'],
    ]);
  });

  it('delegates the admin endpoints with the caller and request id', async () => {
    const members = {
      list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
      detail: vi.fn(async () => ({})),
      updateStatus: vi.fn(async () => ({})),
    };
    const controller = new MembersController(
      members as unknown as MembersService,
      {
        COOKIE_SECURE: false,
        REFRESH_TTL: 60,
      },
    );
    const admin = { id: user.id, role: 'ADMIN' as const };

    await controller.list(admin, { page: 1, pageSize: 20 }, 'r');
    await controller.detail(admin, user.id, 'r');
    await controller.updateStatus(
      admin,
      user.id,
      { status: 'SUSPENDED', reason: 'x' },
      'r',
    );

    expect(members.list).toHaveBeenCalledWith(
      admin,
      { page: 1, pageSize: 20 },
      'r',
    );
    expect(members.detail).toHaveBeenCalledWith(admin, user.id, 'r');
    expect(members.updateStatus).toHaveBeenCalledWith(
      admin,
      user.id,
      { status: 'SUSPENDED', reason: 'x' },
      'r',
    );
  });
});
