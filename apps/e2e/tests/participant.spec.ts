import { expect, test } from '@playwright/test';

import { env } from '../env.js';
import { adminToken, openSchedule, signupMember } from './api.js';

// SPEC-003 13절 e2e — 참가자 흐름(web): 로그인 → 같은 일정으로 돌아와 신청 → 내 신청 → 본인 취소.
test('participant applies after logging in and cancels from 내 신청', async ({
  page,
}) => {
  const { schedule } = await openSchedule(await adminToken());
  const member = await signupMember('FEMALE');

  await page.goto(`${env.E2E_WEB_URL}/events/${schedule.id}`);
  const area = page.getByRole('region', { name: '참가 신청' });
  await expect(
    area.getByText('참가 신청은 로그인한 뒤 할 수 있습니다.'),
  ).toBeVisible();

  await area.getByRole('link', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('이메일').fill(member.email);
  await page.getByLabel('비밀번호').fill(member.password);
  await page.getByRole('button', { name: '로그인' }).click();

  // 로그인 뒤 같은 일정으로 돌아온다(D12)
  await expect(page).toHaveURL(`${env.E2E_WEB_URL}/events/${schedule.id}`);
  await area.getByRole('button', { name: '참가 신청' }).click();
  const applyDialog = page.getByRole('dialog', { name: '참가 신청' });
  await expect(applyDialog).toContainText('참가비는 25,000원입니다.');
  await applyDialog.getByRole('button', { name: '신청' }).click();

  await expect(area.getByText('참가 신청이 접수되었습니다.')).toBeVisible();
  await expect(area.getByText('입금 대기')).toBeVisible();
  await expect(area.getByText('참가비 25,000원')).toBeVisible();

  await page.goto(`${env.E2E_WEB_URL}/me/applications`);
  const card = page.getByRole('article').filter({ hasText: schedule.title });
  await expect(card.getByText('입금 대기')).toBeVisible();
  await card.getByRole('button', { name: '신청 취소' }).click();
  const cancelDialog = page.getByRole('dialog', { name: '신청 취소' });
  await cancelDialog.getByRole('button', { name: '신청 취소' }).click();

  await expect(card.getByText('직접 취소했습니다.')).toBeVisible();
  await expect(card.getByText('취소', { exact: true })).toBeVisible();
});
