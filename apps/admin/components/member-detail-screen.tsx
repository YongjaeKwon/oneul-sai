'use client';

import { MemberIdSchema, type MemberDetail } from '@oneul-sai/contracts';
import { Badge } from '@oneul-sai/ui';
import { useState } from 'react';

import { useAuth, useEndSessionOn401 } from '@/lib/auth-provider';
import { describeError } from '@/lib/errors';
import {
  EMPTY,
  GENDER_LABELS,
  ROLE_LABELS,
  formatDateTime,
  formatPhone,
} from '@/lib/format';
import { useMember } from '@/lib/queries';
import { BackLink } from './back-link';
import { DetailList } from './detail-list';
import { MemberStatusForm } from './member-status-form';
import { Notice } from './notice';
import { Section } from './section';
import { StatusBadge } from './status-badge';

const UPDATED_MESSAGES: Record<MemberDetail['status'], string> = {
  ACTIVE: '정지를 해제했습니다. 이 회원은 다시 로그인할 수 있습니다.',
  SUSPENDED: '계정을 정지했습니다. 이 회원의 모든 세션이 끊겼습니다.',
  WITHDRAWN: '상태를 바꿨습니다.',
};

/** A3 회원 상세 — 프로필 전체, 동의 시각, 로그인 실패 카운터(읽기 전용), 현재 상태와 사유, 상태 변경. */
export function MemberDetailScreen({ id }: { id: string }) {
  const validId = MemberIdSchema.safeParse(id).success;
  const { me } = useAuth();
  const { data: member, error } = useMember(id, validId);
  useEndSessionOn401(error);
  const [updatedMessage, setUpdatedMessage] = useState<string | null>(null);

  if (!validId) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/members">회원 목록</BackLink>
        <Notice tone="danger">회원 ID 형식이 아닙니다.</Notice>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/members">회원 목록</BackLink>
        <Notice tone="danger">{describeError(error)}</Notice>
      </div>
    );
  }

  if (member === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/members">회원 목록</BackLink>
        <p className="py-12 text-center text-sm text-ink-soft" role="status">
          불러오고 있습니다…
        </p>
      </div>
    );
  }

  const withdrawn = member.status === 'WITHDRAWN';
  const isSelf = me !== null && me.id === member.id;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/members">회원 목록</BackLink>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">
            {member.name ?? (withdrawn ? '탈퇴한 회원' : EMPTY)}
          </h1>
          <StatusBadge status={member.status} />
          <Badge tone={member.role === 'ADMIN' ? 'mauve' : 'neutral'}>
            {ROLE_LABELS[member.role]}
          </Badge>
        </div>
        <p className="text-sm text-ink-soft">{member.email}</p>
      </header>

      {withdrawn ? (
        <Notice>
          탈퇴한 회원입니다. 개인정보는 탈퇴 즉시 익명화되어 이름 · 성별 ·
          출생연도 · 휴대폰이 보이지 않습니다. 탈퇴일{' '}
          {formatDateTime(member.withdrawnAt)}
        </Notice>
      ) : null}

      {updatedMessage !== null ? (
        <Notice tone="success">{updatedMessage}</Notice>
      ) : null}

      <Section title="프로필">
        <DetailList
          items={[
            { label: '이메일', value: member.email },
            { label: '이름', value: member.name ?? EMPTY },
            {
              label: '성별',
              value:
                member.gender === null ? EMPTY : GENDER_LABELS[member.gender],
            },
            { label: '출생연도', value: member.birthYear ?? EMPTY },
            { label: '휴대폰', value: formatPhone(member.phone) },
            { label: '역할', value: ROLE_LABELS[member.role] },
            { label: '가입일', value: formatDateTime(member.createdAt) },
            { label: '마지막 수정', value: formatDateTime(member.updatedAt) },
          ]}
        />
      </Section>

      <Section title="계정 상태">
        <DetailList
          items={[
            { label: '상태', value: <StatusBadge status={member.status} /> },
            { label: '사유', value: member.statusReason ?? EMPTY },
            ...(withdrawn
              ? [
                  {
                    label: '탈퇴일',
                    value: formatDateTime(member.withdrawnAt),
                  },
                ]
              : []),
          ]}
        />
        <div className="mt-4 border-t border-line pt-5">
          <h3 className="text-base font-semibold text-ink">계정 상태 변경</h3>
          <div className="mt-3">
            {member.status === 'WITHDRAWN' ? (
              <p className="text-sm text-ink-soft">
                탈퇴한 회원의 상태는 바꿀 수 없습니다.
              </p>
            ) : isSelf ? (
              <p className="text-sm text-ink-soft">
                자기 계정의 상태는 바꿀 수 없습니다.
              </p>
            ) : (
              <MemberStatusForm
                key={member.status}
                memberId={member.id}
                currentStatus={member.status}
                onUpdated={(detail) =>
                  setUpdatedMessage(UPDATED_MESSAGES[detail.status])
                }
              />
            )}
          </div>
        </div>
      </Section>

      <Section title="동의 기록">
        <DetailList
          items={[
            {
              label: '개인정보 수집 · 이용 동의',
              value: formatDateTime(member.privacyAgreedAt),
            },
            {
              label: '마케팅 수신 동의',
              value: formatDateTime(member.marketingAgreedAt),
            },
            {
              label: '마케팅 수신 철회',
              value: formatDateTime(member.marketingWithdrawnAt),
            },
          ]}
        />
      </Section>

      <Section title="로그인 실패 (읽기 전용)">
        <DetailList
          items={[
            {
              label: '실패 횟수',
              value: `${member.failedLoginCount}회`,
            },
            {
              label: '마지막 실패 시각',
              value: formatDateTime(member.lastFailedLoginAt),
            },
          ]}
        />
        <p className="mt-3 text-xs text-ink-soft">
          15분 안에 4회 틀린 뒤로는 다섯 번째 시도부터 확인이 늦어집니다. 계정은
          잠기지 않으므로 운영자가 풀어 줄 것은 없습니다.
        </p>
      </Section>
    </div>
  );
}
