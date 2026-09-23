import type { Metadata } from 'next';

import { MeetupListScreen } from '@/components/meetup-list-screen';

export const metadata: Metadata = { title: '모임 상품' };

/** A4 모임 상품 목록(SPEC-002 4절). */
export default function MeetupsPage() {
  return <MeetupListScreen />;
}
