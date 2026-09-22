'use client';

import { Button, Divider } from '@oneul-sai/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormAlert } from '@/components/form-alert';
import { LoadingBlock } from '@/components/loading-block';
import { LogoutAllDialog } from '@/components/logout-all-dialog';
import { ProfileEditForm } from '@/components/profile-edit-form';
import { WithdrawDialog } from '@/components/withdraw-dialog';
import { useAuth, useEndSessionOn401 } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import {
  EMPTY,
  formatBirthYear,
  formatPhone,
  GENDER_LABELS,
} from '@/lib/format';
import { useMe } from '@/lib/queries';

type DialogKind = 'none' | 'logout-all' | 'withdraw';

/** W3 내 프로필 + W4 편집 모드 + 로그아웃 · 모든 기기 로그아웃 · W6 탈퇴(SPEC-001 4절). */
export function ProfileScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { data: me, error } = useMe();
  useEndSessionOn401(error);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>('none');
  const [notice, setNotice] = useState<string | null>(null);

  if (error !== null) {
    // 403 ACCOUNT_SUSPENDED 등. 401은 useEndSessionOn401이 세션을 끝내고 RequireAuth가 안내한다.
    return (
      <div className="flex flex-col items-center gap-6">
        <FormAlert>{describeError(error)}</FormAlert>
        <Button variant="secondary" onClick={() => void logout()}>
          로그아웃
        </Button>
      </div>
    );
  }

  if (me === undefined) {
    return <LoadingBlock />;
  }

  if (editing) {
    return (
      <ProfileEditForm
        profile={me}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          setNotice('저장했습니다.');
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {notice !== null ? <FormAlert tone="success">{notice}</FormAlert> : null}

      <dl className="divide-y divide-line rounded-card border border-line bg-surface">
        <Row label="이메일" value={me.email} />
        <Row label="이름" value={me.name} />
        <Row
          label="성별"
          value={me.gender === null ? EMPTY : GENDER_LABELS[me.gender]}
        />
        <Row label="출생연도" value={formatBirthYear(me.birthYear)} />
        <Row label="휴대폰" value={formatPhone(me.phone)} />
        <Row
          label="마케팅 수신"
          value={me.marketingConsent ? '동의' : '거부'}
        />
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={() => {
            setNotice(null);
            setEditing(true);
          }}
        >
          수정
        </Button>
        <Button variant="secondary" onClick={() => router.push('/me/password')}>
          비밀번호 변경
        </Button>
      </div>

      <Divider />

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => void logout()}>
          로그아웃
        </Button>
        <Button variant="secondary" onClick={() => setDialog('logout-all')}>
          모든 기기에서 로그아웃
        </Button>
        <Button variant="ghost" onClick={() => setDialog('withdraw')}>
          탈퇴
        </Button>
      </div>

      <LogoutAllDialog
        open={dialog === 'logout-all'}
        onClose={() => setDialog('none')}
      />
      <WithdrawDialog
        open={dialog === 'withdraw'}
        onClose={() => setDialog('none')}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className="shrink-0 text-sm text-ink-soft">{label}</dt>
      <dd className="text-right text-base text-ink tabular-nums break-all">
        {value}
      </dd>
    </div>
  );
}
