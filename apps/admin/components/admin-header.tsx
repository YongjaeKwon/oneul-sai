'use client';

import { BrandMark, Button } from '@oneul-sai/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/lib/auth-provider';

// "모임 상품" 아래에 상품마다 회차(운영자가 말하는 "모임")가 있다(SPEC-002 4절 운영자 웹).
const NAV_ITEMS = [
  { href: '/members', label: '회원' },
  { href: '/meetups', label: '모임 상품' },
] as const;

/** 보호 화면 공통 헤더 — 브랜드, 메뉴, 로그인한 운영자, 로그아웃(SPEC-001 4절 운영자 웹). */
export function AdminHeader() {
  const { me, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      // 서비스가 실패해도 메모리의 토큰은 지워지므로 로그인 화면으로 보낸다.
      await logout().catch(() => undefined);
    } finally {
      router.replace('/login');
    }
  };

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link href="/members" className="flex items-center gap-2">
          <BrandMark size={24} />
          <span className="font-display text-base font-semibold text-ink">
            오늘사이 관리자
          </span>
        </Link>
        <nav aria-label="주 메뉴" className="flex items-center gap-4">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'text-sm transition-colors hover:text-ink',
                  active ? 'font-medium text-ink' : 'text-ink-soft',
                ].join(' ')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {me !== null ? (
            <span className="hidden text-sm text-ink-soft sm:inline">
              {me.email}
            </span>
          ) : null}
          <Button
            variant="secondary"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            로그아웃
          </Button>
        </div>
      </div>
    </header>
  );
}
