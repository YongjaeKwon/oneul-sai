import type { Metadata } from 'next';

import { BackLink } from '@/components/back-link';
import { MeetupForm } from '@/components/meetup-form';
import { PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';

export const metadata: Metadata = { title: '상품 등록' };

/** A5 상품 등록 — 제목 · 설명 → `POST /api/v1/meetups` → A6. */
export default function NewMeetupPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/meetups">모임 상품</BackLink>
      <PageHeader title="상품 등록">
        <p>같은 상품으로 여러 회차를 엽니다. 회차는 등록한 뒤 만듭니다.</p>
      </PageHeader>
      <Section title="상품 정보">
        <MeetupForm />
      </Section>
    </div>
  );
}
