import { BrandMark, Card } from '@oneul-sai/ui';

const sections = [
  { title: '회원 관리', description: '회원 조회 및 계정 상태 관리 (준비 중)' },
  { title: '일정 · 신청 관리', description: '일요일 모임 일정, 참가 신청, 입금 확인 (준비 중)' },
  { title: '현장 진행', description: '체크인, 라운드 로테이션 진행 (준비 중)' },
  { title: '매칭 · 재소개', description: '상호 선택, ONE MORE, AFTER 관리 (준비 중)' },
  { title: '알림', description: '알림톡 · 푸시 발송 이력 (준비 중)' },
  { title: '결제', description: '결제 및 정산 내역 (준비 중)' },
];

export default function AdminHomePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <header className="flex items-center gap-3">
        <BrandMark size={28} />
        <h1 className="text-2xl font-semibold text-ink">오늘사이 관리자</h1>
      </header>
      <p className="mt-2 text-sm text-ink-soft">
        서비스 운영을 위한 관리자 콘솔입니다.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} title={section.title}>
            <p className="text-sm text-ink-soft">{section.description}</p>
          </Card>
        ))}
      </div>
    </main>
  );
}
