import type { AccountStatus } from '@oneul-sai/contracts';
import { Badge, type BadgeTone } from '@oneul-sai/ui';

import { STATUS_LABELS } from '@/lib/format';

const STATUS_TONES: Record<AccountStatus, BadgeTone> = {
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  WITHDRAWN: 'neutral',
};

/** 계정 상태 배지. 글자(활성 · 정지 · 탈퇴)가 뜻을 전하고 색은 보조한다. */
export function StatusBadge({ status }: { status: AccountStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
