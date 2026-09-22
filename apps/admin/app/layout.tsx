import type * as React from 'react';
import type { Metadata } from 'next';
import { Noto_Sans_KR, Noto_Serif_KR } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// 관리자 콘솔은 본문 중심이라 라틴 디스플레이 글꼴은 싣지 않는다.
const notoSans = Noto_Sans_KR({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-noto-sans-kr',
  display: 'swap',
});
const notoSerif = Noto_Serif_KR({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-noto-serif-kr',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '오늘사이 관리자',
  description: '오늘사이 오프라인 로테이션 소개팅 서비스 관리자 콘솔',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className={`${notoSans.variable} ${notoSerif.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
