'use client';

import { BrandMark } from '@oneul-sai/ui';
import Link from 'next/link';

import { useAuth } from '@/lib/auth';

const navItemClasses =
  'rounded-control px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-rose-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose';

/** 모든 화면 위의 얇은 머리글. 로그인 여부에 따라 로그인 · 가입 / 내 정보 · 로그아웃을 보여 준다. */
export function SiteHeader() {
  const { state, logout } = useAuth();

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-control text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
        >
          <BrandMark size={20} />
          <span className="font-display text-base font-semibold">오늘사이</span>
        </Link>

        <nav
          aria-label="계정"
          aria-busy={state.status === 'loading'}
          className="flex items-center gap-1"
        >
          {state.status === 'anonymous' ? (
            <>
              <Link href="/login" className={navItemClasses}>
                로그인
              </Link>
              <Link href="/signup" className={navItemClasses}>
                가입하기
              </Link>
            </>
          ) : null}
          {state.status === 'authenticated' ? (
            <>
              <Link href="/me" className={navItemClasses}>
                내 정보
              </Link>
              <button
                type="button"
                className={navItemClasses}
                onClick={() => void logout()}
              >
                로그아웃
              </button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
