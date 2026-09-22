import type * as React from 'react';
import type { Metadata } from 'next';
import { Noto_Sans_KR, Noto_Serif_KR, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// 글꼴 변수 이름은 @oneul-sai/ui/theme.css 의 --font-* 정의와 맞춘다.
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
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: 'variable',
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '오늘사이',
  description: '오늘, 우리 사이의 시작. 오프라인 로테이션 소개팅 오늘사이',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className={`${notoSans.variable} ${notoSerif.variable} ${playfair.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
