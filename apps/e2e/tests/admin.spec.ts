import { expect, test } from '@playwright/test';

import { env } from '../env.js';
import { adminToken, applyAs, openSchedule, signupMember } from './api.js';

// SPEC-003 13절 e2e — 운영자 흐름(admin): 회차 상세의 신청 요약 → 신청 목록 → 운영자 취소 → 취소 필터.
test('operator sees an application in the list and cancels it', async ({
  page,
}) => {
  const { meetup, schedule } = await openSchedule(await adminToken());
  const member = await signupMember('FEMALE');
  await applyAs(member, schedule.id);

  await page.goto(`${env.E2E_ADMIN_URL}/login`);
  await page.getByLabel('이메일').fill(env.E2E_ADMIN_EMAIL);
  await page.getByLabel('비밀번호').fill(env.E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/members/);

  await page.goto(
    `${env.E2E_ADMIN_URL}/meetups/${meetup.id}/schedules/${schedule.id}`,
  );
  await expect(page.getByText('신청 남 0/7 · 여 1/7')).toBeVisible();
  await page.getByRole('link', { name: '신청 목록 보기' }).click();
  await expect(page).toHaveURL(/\/applications$/);

  const row = page.getByRole('row').filter({ hasText: member.name });
  await expect(row.getByText('입금 대기')).toBeVisible();
  await row.getByRole('button', { name: `${member.name}의 신청 취소` }).click();
  const dialog = page.getByRole('dialog', { name: '신청 취소' });
  await expect(dialog).toContainText(`${member.name}님의 신청을 취소할까요?`);
  await dialog.getByRole('button', { name: '신청 취소' }).click();

  // 입금 대기 필터에서 빠지고, 취소 필터에 운영자 취소로 보인다
  await expect(row).toHaveCount(0);
  await page.getByRole('link', { name: '취소', exact: true }).click();
  const cancelledRow = page.getByRole('row').filter({ hasText: member.name });
  await expect(cancelledRow.getByText('운영자')).toBeVisible();
});
