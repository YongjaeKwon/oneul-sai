import { expect, test } from '@playwright/test';

import { env } from '../env.js';
import { adminToken, applyAs, openSchedule, signupMember } from './api.js';

// SPEC-003 13절 e2e (개정 2026-10-14) — 운영자 흐름(admin): 회차 상세의 신청 요약(접수 수) → 신청 목록(기본 필터 "전체")
// → 참가 가능 안내(접수 → 입금 대기, 자리 +1) → 운영자 취소 → 같은 줄이 "취소" · "운영자"로 남는다,
// 이어서 그 회원의 web 화면에 운영자 취소 · 다시 신청 막기(F · S4)가 보인다.
test('operator invites an application and then cancels it', async ({
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

  // 접수는 자리를 잡지 않는다 — 자리 잡은 수 0/7, 접수 수 1(D14 · D17)
  await page.goto(
    `${env.E2E_ADMIN_URL}/meetups/${meetup.id}/schedules/${schedule.id}`,
  );
  await expect(
    page.getByText('신청 남 0/7 · 여 0/7 · 접수 남 0 · 여 1'),
  ).toBeVisible();
  await page.getByRole('link', { name: '신청 목록 보기' }).click();
  // 기본 필터는 "전체"(SPEC-004 K-1 앞당김) — 주소에 ?status= 가 없다
  await expect(page).toHaveURL(/\/applications$/);

  // 이름 · 휴대폰은 member-service에서 합친 값이다(D11)
  const row = page.getByRole('row').filter({ hasText: member.name });
  const phone = `${member.phone.slice(0, 3)}-${member.phone.slice(3, 7)}-${member.phone.slice(7)}`;
  await expect(row.getByText(phone)).toBeVisible();
  await expect(row.getByText('접수', { exact: true })).toBeVisible();

  // 참가 가능 안내(D16): 접수 → 입금 대기, 그 성별 자리 하나를 잡는다
  await row
    .getByRole('button', { name: `${member.name}에게 참가 가능 안내` })
    .click();
  const inviteDialog = page.getByRole('dialog', { name: '참가 가능 안내' });
  await expect(inviteDialog).toContainText(
    `${member.name}님께 참가 가능 안내를 할까요?`,
  );
  await inviteDialog.getByRole('button', { name: '참가 가능 안내' }).click();
  await expect(row.getByText('입금 대기')).toBeVisible();
  await expect(
    page.getByText('신청 남 0/7 · 여 1/7 · 접수 남 0 · 여 0'),
  ).toBeVisible();

  await row.getByRole('button', { name: `${member.name}의 신청 취소` }).click();
  const cancelDialog = page.getByRole('dialog', { name: '신청 취소' });
  await expect(cancelDialog).toContainText(
    `${member.name}님의 신청을 취소할까요?`,
  );
  await cancelDialog.getByRole('button', { name: '신청 취소' }).click();

  // 기본 필터가 "전체"라 줄이 사라지지 않고 운영자 취소로 바뀐다(버튼 없음 · 배지 "취소" · "운영자")
  await expect(
    row.getByRole('button', { name: `${member.name}의 신청 취소` }),
  ).toHaveCount(0);
  await expect(row.getByText('취소', { exact: true })).toBeVisible();
  await expect(row.getByText('운영자')).toBeVisible();
  // 취소 시각 열(9번째) — "10/4(일) 14:00"
  await expect(row.getByRole('cell').nth(8)).toHaveText(
    /^\d{1,2}\/\d{1,2}\(.\) \d{2}:\d{2}$/,
  );
  await expect(
    page.getByText('신청 남 0/7 · 여 0/7 · 접수 남 0 · 여 0'),
  ).toBeVisible();

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
