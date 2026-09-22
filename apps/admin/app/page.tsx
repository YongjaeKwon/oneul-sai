import { redirect } from 'next/navigation';

/** 운영자 웹의 첫 화면은 회원 목록이다. 로그인 여부는 보호 레이아웃(`RequireAdmin`)이 판정한다. */
export default function AdminHomePage() {
  redirect('/members');
}
