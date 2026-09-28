import { expect, test } from '@playwright/test';

import { env } from '../env.js';
import { adminToken, applyAs, openSchedule, signupMember } from './api.js';

// SPEC-003 13절 e2e — 운영자 흐름(admin): 회차 상세의 신청 요약 → 신청 목록 → 운영자 취소 → 취소 필터,
// 이어서 그 회원의 web 화면에 운영자 취소 · 다시 신청 막기(F)가 보인다.
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

  // 이름 · 휴대폰은 member-service에서 합친 값이다(D11)
  const row = page.getByRole('row').filter({ hasText: member.name });
  const phone = `${member.phone.slice(0, 3)}-${member.phone.slice(3, 7)}-${member.phone.slice(7)}`;
  await expect(row.getByText(phone)).toBeVisible();
  await expect(row.getByText('입금 대기')).toBeVisible();
  await row.getByRole('button', { name: `${member.name}의 신청 취소` }).click();
  const dialog = page.getByRole('dialog', { name: '신청 취소' });
  await expect(dialog).toContainText(`${member.name}님의 신청을 취소할까요?`);
  await dialog.getByRole('button', { name: '신청 취소' }).click();

  // 입금 대기 필터에서 빠지고, 취소 필터에 운영자 취소로 보인다
  await expect(row).toHaveCount(0);
  await page.getByRole('link', { name: '취소', exact: true }).click();
  const cancelledRow = page.getByRole('row').filter({ hasText: member.name });
  await expect(cancelledRow.getByText('취소', { exact: true })).toBeVisible();
  await expect(cancelledRow.getByText('운영자')).toBeVisible();
  // 취소 시각 열(9번째) — "10/4(일) 14:00"
  await expect(cancelledRow.getByRole('cell').nth(8)).toHaveText(
    /^\d{1,2}\/\d{1,2}\(.\) \d{2}:\d{2}$/,
  );

  // 같은 브라우저의 web(다른 origin)에서 그 회원으로 로그인한다 — 운영자 세션과 섞이지 않는다(SPEC-001)
  await page.goto(`${env.E2E_WEB_URL}/events/${schedule.id}`);
  const area = page.getByRole('region', { name: '참가 신청' });
  await area.getByRole('link', { name: '로그인' }).click();
  await page.getByLabel('이메일').fill(member.email);
  await page.getByLabel('비밀번호').fill(member.password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(`${env.E2E_WEB_URL}/events/${schedule.id}`);
  await expect(
    area.getByText(
      '이 일정은 다시 신청할 수 없습니다. 오늘사이에 문의해 주세요.',
    ),
  ).toBeVisible();
  await expect(area.getByRole('button', { name: '참가 신청' })).toHaveCount(0);

  await page.goto(`${env.E2E_WEB_URL}/me/applications`);
  const card = page.getByRole('article').filter({ hasText: schedule.title });
  await expect(card.getByText('오늘사이에서 취소했습니다.')).toBeVisible();
  await expect(card.getByText('취소', { exact: true })).toBeVisible();
});
