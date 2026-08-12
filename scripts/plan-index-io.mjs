/*
 * `public/plan-index.json` 을 **쓰는 자리는 여기 하나다.**
 *
 * 색인을 쓰는 곳이 둘이다 — `build-plan-index.mjs`(새로 수집) 와
 * `patch-plan-axis.mjs`(기존 색인 따라잡기). 각자 쓰다가 두 가지가 어긋났다:
 *
 * ① **머리말 수치가 굳는다.** `patch-plan-axis` 가 근거 없는 축척을 지우면서
 *    `scaledCount` 를 다시 세지 않아, 데이터에는 11장인데 머리말은 **15** 였다.
 *    화면에 나가는 값은 아니지만, 다음 사람이 색인을 열어 처음 보는 숫자가 그것이다.
 *    (앱 화면에 "OOO종"을 손으로 박지 않는 것과 같은 이유 — 세어서 넣는다.)
 * ② **서식이 갈린다.** 축척을 걷어낸 임시 스크립트가 들여쓰기 없이 써서 색인이
 *    7,315줄 → 1줄로 눌렸는데, 커밋된 두 생성기는 그대로 들여쓰기로 쓴다.
 *    그 상태로 `build:plans` 를 한 번 돌리면 **7,300줄짜리 서식 소음이 진짜 변경을
 *    덮는다.** 눌러서 얻는 것도 거의 없다 — 실측 gzip 1.6KB · brotli 0.5KB 차이다
 *    (Vercel 이 압축해 보낸다). 그 정도로 diff 를 읽을 수 없게 만들 이유가 없다.
 */
import fs from 'fs';

/**
 * 머리말 수치를 데이터에서 다시 세어 넣고 한 가지 서식으로 쓴다.
 *
 * `complexes` 를 떼었다가 맨 뒤에 다시 붙이는 것은 **수치를 앞에 두기 위해서다** —
 * 객체에 나중에 넣은 키는 뒤에 붙으므로, 그냥 대입하면 7천 줄 끝에 가서야 총계가 나온다.
 * (이미 그 키가 있던 색인은 원래 자리를 지킨다 — 값만 바뀐다.)
 */
export function writePlanIndex(file, idx) {
  const { complexes = [], ...head } = idx;
  const plans = complexes.flatMap((c) => c.plans || []);
  const counts = {
    complexCount: complexes.length,
    planCount: plans.length,
    scaledCount: plans.filter((p) => p.mmPerPx).length,
  };
  fs.writeFileSync(file, JSON.stringify({ ...head, ...counts, complexes }, null, 1) + '\n', 'utf8');
  return { complexes: counts.complexCount, plans: counts.planCount, scaled: counts.scaledCount };
}
