/*
 * UserPromptSubmit 훅 — 매 질문마다 **현재상황을 맥락에 넣는다.**
 *   node .claude/status-context.mjs
 *
 * 상태줄은 사용자가 보는 것이고, 이쪽은 **내(에이전트)가 빼먹지 못하게** 하는 장치다.
 * "응답 맨 위에 진행 상태를 적는다"를 기억에만 맡기면 긴 세션에서 결국 빠진다.
 *
 * 지켜야 할 둘:
 *  ① 짧아야 한다 — 매 질문마다 붙으므로 길면 그 자체가 비용이다.
 *  ② **절대 실패하지 않는다** — 같은 UserPromptSubmit 에 작업 자물쇠 훅이 함께 걸려 있다.
 *     여기서 죽어도 그쪽이 막히면 안 되므로 무슨 일이 있어도 exit 0 이다.
 */
try {
  const { status, ageText, DEPLOY_AT } = await import('./statusline.mjs');
  const s = status();

  const bits = [`브랜치 ${s.branch}`];
  bits.push(s.ahead == null ? '미배포 ?' : `미배포 ${s.ahead}/${DEPLOY_AT}커밋`);
  if (s.versionMismatch) bits.push(`⚠ 화면 ${s.version} ≠ 캐시 ${s.cache} (두 곳을 함께 고칠 것)`);
  else if (s.version) bits.push(`버전 ${s.version}`);
  if (s.lock) bits.push(`자물쇠 ${s.lock}`);

  const out = [`[현재상황] ${bits.join(' · ')}`];
  out.push(s.now ? `[지금 하는 일] ${s.now}${ageText(s.nowAgeMin)}` : '[지금 하는 일] 미지정 — 작업을 시작하면 .claude/now.txt 에 한 줄로 적을 것');
  if (s.ahead != null && s.ahead >= DEPLOY_AT) {
    out.push('[배포] 미푸시가 기준(10커밋)을 넘었다 — 테스트를 돌리고 묻지 말고 올릴 것.');
  }
  out.push('[표시 규칙] 응답 맨 위에 🟢진행중/🔴막힘 · n/m(%) 막대 · 끝난 것 / 다음 것을 적는다.');

  process.stdout.write(out.join('\n'));
} catch { /* 현재상황을 못 만들어도 사용자의 질문은 그대로 가야 한다 */ }
process.exit(0);
