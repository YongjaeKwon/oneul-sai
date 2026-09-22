import type { ReactNode } from 'react';

export interface CardProps {
  title?: string;
  children?: ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <div className="rounded-xl border border-rose-100 bg-white p-6 shadow-sm">
      {title ? (
        <h3 className="mb-3 text-base font-semibold text-gray-900">{title}</h3>
      ) : null}
      {children}
    </div>
  );
}
