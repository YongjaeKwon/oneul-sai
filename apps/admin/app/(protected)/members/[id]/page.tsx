import type { Metadata } from 'next';

import { MemberDetailScreen } from '@/components/member-detail-screen';

export const metadata: Metadata = { title: '회원 상세' };

/** A3 회원 상세. 경로의 `id`만 서버에서 읽고, 조회 · 상태 변경은 클라이언트 화면이 한다. */
export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MemberDetailScreen id={id} />;
}
