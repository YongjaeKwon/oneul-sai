import type { MemberSummary } from '@oneul-sai/contracts';
import Link from 'next/link';

import {
  EMPTY,
  GENDER_LABELS,
  ROLE_LABELS,
  formatDate,
  formatPhone,
} from '@/lib/format';
import { StatusBadge } from './status-badge';

const COLUMNS = [
  '이름',
  '이메일',
  '휴대폰',
  '성별',
  '출생연도',
  '역할',
  '상태',
  '가입일',
  '',
] as const;

export interface MemberTableProps {
  items: MemberSummary[];
  /** 페이지를 넘기는 동안 이전 결과를 흐리게 보여 준다. */
  busy?: boolean;
}

/** A2 회원 목록 표. 한 줄에 이름 · 이메일 · 휴대폰 · 성별 · 출생연도 · 상태 · 가입일(SPEC-001 4절). */
export function MemberTable({ items, busy = false }: MemberTableProps) {
  return (
    <div
      aria-busy={busy}
      className={[
        'overflow-x-auto rounded-card border border-line bg-surface transition-opacity',
        busy ? 'opacity-60' : '',
      ].join(' ')}
    >
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-line text-xs text-ink-soft">
          <tr>
            {COLUMNS.map((column, index) => (
              <th
                key={index}
                scope="col"
                className="px-4 py-3 font-medium whitespace-nowrap"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-4 py-12 text-center text-ink-soft"
              >
                조건에 맞는 회원이 없습니다.
              </td>
            </tr>
          ) : (
            items.map((member) => (
              <tr key={member.id} className="hover:bg-ivory">
                <td className="px-4 py-3 font-medium text-ink">
                  {member.name ?? EMPTY}
                </td>
                <td className="px-4 py-3 text-ink">{member.email}</td>
                <td className="px-4 py-3 text-ink tabular-nums">
                  {formatPhone(member.phone)}
                </td>
                <td className="px-4 py-3 text-ink">
                  {member.gender === null
                    ? EMPTY
                    : GENDER_LABELS[member.gender]}
                </td>
                <td className="px-4 py-3 text-ink tabular-nums">
                  {member.birthYear ?? EMPTY}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {ROLE_LABELS[member.role]}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={member.status} />
                </td>
                <td className="px-4 py-3 text-ink-soft tabular-nums">
                  {formatDate(member.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/members/${member.id}`}
                    className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-rose"
                    aria-label={`${member.name ?? member.email} 상세`}
                  >
                    상세
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
