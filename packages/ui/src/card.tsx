import type { ReactNode } from 'react';

export interface CardProps {
  title?: string;
  children?: ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <div className="rounded-card border border-line bg-surface p-6">
      {title ? (
        <h3 className="mb-3 text-base font-semibold text-ink">{title}</h3>
      ) : null}
      {children}
    </div>
  );
}
