import { BrandMark, Button } from '@oneul-sai/ui';

// 팜플렛의 네 가지 개념 — 화면 카피는 마케팅 문구를 그대로 따른다.
const concepts = [
  { key: 'TODAY', label: '오늘, 직접 만나보세요.' },
  { key: 'ONE MORE', label: '아쉬운 사람이 있었다면, 한 번 더.' },
  { key: 'AFTER', label: '오늘 없었다면, 다음 인연까지.' },
  { key: 'NEXT', label: '새로운 만남으로, 다시 한 번.' },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <BrandMark size={44} />
        <h1 className="text-5xl font-semibold text-ink">오늘사이</h1>
        <p className="font-latin-display text-sm tracking-[0.35em] text-ink-muted">
          ONULSAI
        </p>
        <p className="text-base text-ink-soft">오늘, 우리 사이의 시작.</p>
      </div>

      <div className="h-px w-16 bg-line-strong" aria-hidden="true" />

      <p className="max-w-md text-lg leading-relaxed text-ink">
        일요일의 편안한 카페에서 7명의 새로운 사람과
        <br />한 사람씩 1:1로 대화합니다.
      </p>

      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        {concepts.map((concept) => (
          <li key={concept.key} className="flex items-baseline gap-2">
            <span className="font-latin-display text-sm tracking-[0.2em] text-rose-deep">
              {concept.key}
            </span>
            <span className="text-sm text-ink-soft">{concept.label}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button>다가오는 일요일 보기</Button>
        <Button variant="secondary">오늘사이 소개</Button>
      </div>

      <p className="text-xs text-ink-muted">서로 선택한 경우에만 연결됩니다.</p>
    </main>
  );
}
