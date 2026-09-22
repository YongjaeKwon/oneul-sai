import { Button } from '@oneul-sai/ui';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">오늘사이</h1>
      <p className="text-lg text-foreground/70">오프라인 로테이션 소개팅</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button>이벤트 둘러보기</Button>
        <Button>시작하기</Button>
      </div>
    </main>
  );
}
