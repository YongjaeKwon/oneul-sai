import { z } from 'zod';

// SPEC-001 7절 "요청 · 응답 필드"의 필드 단위 규칙. 요청 스키마(requests.ts)가 조합해 쓴다.
// 에러 message에는 입력값을 되돌려 주지 않는다(12절). 화면(react-hook-form)도 이 문구를 그대로 쓸 수 있다.

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
export const NAME_MAX_LENGTH = 50;
export const BIRTH_YEAR_MIN = 1900;
/** 가입 가능 연령(만, ★B). 상한 `birthYear ≤ 현재 연도 − SIGNUP_MIN_AGE`는 서비스가 판정해 400 `AGE_NOT_ALLOWED`를 낸다. */
export const SIGNUP_MIN_AGE = 19;
/** 하이픈 · 공백을 제거한 뒤의 휴대폰 형식. 저장도 숫자만. */
export const PHONE_REGEX = /^01[016789]\d{7,8}$/;

/** trim + 소문자 정규화 뒤 형식 검사. 로그인 · 가입이 같은 정규화를 거쳐야 같은 회원을 찾는다. */
export const EmailSchema = z
  .string({ error: '이메일을 입력해 주세요.' })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: '이메일 형식이 아닙니다.' })
      .max(EMAIL_MAX_LENGTH, { error: '이메일이 너무 깁니다.' }),
  );

/** 새 비밀번호 규칙(가입 · 비밀번호 변경): 8~64자, 공백만 금지. NFKC 정규화는 서버가 해시 직전에 한다(12절). */
export const PasswordSchema = z
  .string({ error: '비밀번호를 입력해 주세요.' })
  .min(PASSWORD_MIN_LENGTH, {
    error: `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상 ${PASSWORD_MAX_LENGTH}자 이하로 입력해 주세요.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상 ${PASSWORD_MAX_LENGTH}자 이하로 입력해 주세요.`,
  })
  .refine((value) => value.trim().length > 0, {
    error: '비밀번호는 공백만으로 만들 수 없습니다.',
  });

/** 확인용 비밀번호(로그인 · 현재 비밀번호): 비어 있지만 않으면 된다. 맞는지는 서비스가 판정한다. */
export const PasswordInputSchema = z
  .string({ error: '비밀번호를 입력해 주세요.' })
  .min(1, { error: '비밀번호를 입력해 주세요.' })
  .max(PASSWORD_MAX_LENGTH, { error: '비밀번호가 너무 깁니다.' });

/** 실명. trim 후 1~50자. */
export const NameSchema = z
  .string({ error: '이름을 입력해 주세요.' })
  .trim()
  .min(1, { error: '이름을 입력해 주세요.' })
  .max(NAME_MAX_LENGTH, { error: '이름이 너무 깁니다.' });

/** 출생연도. 하한만 여기서 검사한다(상한은 `AGE_NOT_ALLOWED`, 서비스). */
export const BirthYearSchema = z
  .number({ error: '출생연도를 입력해 주세요.' })
  .int({ error: '출생연도는 네 자리 숫자로 입력해 주세요.' })
  .min(BIRTH_YEAR_MIN, { error: '출생연도를 확인해 주세요.' });

/** 하이픈 · 공백 제거 후 형식 검사. 파싱 결과는 숫자만 남는다. */
export const PhoneSchema = z
  .string({ error: '휴대폰 번호를 입력해 주세요.' })
  .overwrite((value) => value.replace(/[\s-]/g, ''))
  .regex(PHONE_REGEX, { error: '휴대폰 번호 형식이 아닙니다.' });

/** 회원 ID(UUID). 운영자 API의 `:id`에도 쓴다. */
export const MemberIdSchema = z.uuid({ error: '회원 ID 형식이 아닙니다.' });
