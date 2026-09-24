// 공용 `Input`(packages/ui)이 없는 select · textarea의 스타일 — docs/design/design-foundation.md 5절 "폼 입력":
// ivory 배경, 포커스 시 rose 2px 외곽선, 오류는 danger 테두리. `Input`과 같은 값이라 한 폼 안에서 높이 · 색이 맞는다.

const controlClasses =
  'block w-full rounded-control border border-line bg-ivory px-4 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-rose disabled:cursor-not-allowed disabled:opacity-50';

export const selectClasses = `${controlClasses} pr-9`;

export const textareaClasses = `${controlClasses} min-h-24 resize-y placeholder:text-ink-soft aria-invalid:border-danger`;
