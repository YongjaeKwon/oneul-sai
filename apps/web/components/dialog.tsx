'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  /** 닫힐 때(취소 버튼 · Esc · 완료 뒤). 부모가 `open`을 false로 바꾼다. */
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * 확인 모달 — 네이티브 `<dialog>`의 모달 모드를 쓴다(포커스 가둠 · Esc 닫기 · 배경 차단은 브라우저가 한다).
 * 표면은 `surface` + `line` 테두리, 그림자 없음(파운데이션 4절 6).
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-card border border-line bg-surface p-6 text-ink backdrop:bg-ink/40"
    >
      <h2 id={titleId} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </dialog>
  );
}
