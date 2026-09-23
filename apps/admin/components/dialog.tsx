'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  title: string;
  /** Esc · 닫기 버튼 등으로 닫혔을 때. 부모가 `open`을 false로 바꾼다. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * 확인 · 입력 모달. 브라우저의 `<dialog>`(`showModal`)를 그대로 써서 포커스 가두기 · Esc 닫기를 얻는다.
 * 처음 포커스는 `showModal()`이 첫 포커스 가능 요소로 옮긴다. 다른 요소에서 시작하려면 그 요소에 `data-autofocus`를 단다
 * (React의 `autoFocus`는 창이 닫힌 채 마운트될 때 실행되어 `showModal()` 뒤에는 남지 않는다).
 * 표면은 카드와 같다(surface + line, 그림자 없음 — 디자인 파운데이션 4절 6).
 */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-surface p-6 text-ink backdrop:bg-ink-muted/40"
    >
      <h2 id={titleId} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-4 text-sm leading-relaxed">
        {children}
      </div>
    </dialog>
  );
}
