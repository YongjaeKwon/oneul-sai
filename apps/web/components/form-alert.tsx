import type { ReactNode } from 'react';

export interface FormAlertProps {
  tone?: 'error' | 'success';
  children: ReactNode;
}

const toneClasses: Record<NonNullable<FormAlertProps['tone']>, string> = {
  error: 'border-danger text-danger',
  success: 'border-success text-success',
};

/** 폼 전체에 대한 결과 문구. 색만으로 뜻을 전하지 않도록 테두리 + 아이콘을 함께 쓴다(파운데이션 2절). */
export function FormAlert({ tone = 'error', children }: FormAlertProps) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-control border bg-surface px-4 py-3 text-sm ${toneClasses[tone]}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      >
        <circle
          cx="8"
          cy="8"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {tone === 'error' ? (
          <>
            <path
              d="M8 4.5v4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="8" cy="11.25" r="0.9" fill="currentColor" />
          </>
        ) : (
          <path
            d="M5 8.2l2 2 4-4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span className="text-ink">{children}</span>
    </p>
  );
}
