import { Card } from '@oneul-sai/ui';

const sections = [
  { title: '회원 관리', description: '회원 조회 및 상태 관리 (준비 중)' },
  { title: '이벤트 관리', description: '오프라인 이벤트 운영 (준비 중)' },
  { title: '매칭 관리', description: '로테이션 매칭 현황 (준비 중)' },
  { title: '결제 관리', description: '결제 및 정산 내역 (준비 중)' },
];

export default function AdminHomePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">오늘 사이 관리자</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        서비스 운영을 위한 관리자 콘솔입니다.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title}>
            <h2 className="text-lg font-medium">{section.title}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {section.description}
            </p>
          </Card>
        ))}
      </div>
    </main>
  );
}
