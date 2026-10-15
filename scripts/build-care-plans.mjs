#!/usr/bin/env node
/*
 * AI구독 케어 — 방문케어 프리미엄 / 라이트 / 셀프케어 요금제 자료를 만든다.
 *
 *   원문 : scripts/fixtures/care-subs.json  (삼성닷컴 구독 지면을 렌더해 뽑은 것 — 2026-10-15)
 *   정의 : scripts/fixtures/care-kinds.mjs  (케어 종류 → 항목, 원문 정의 문단 그대로)
 *   결과 : public/care-app.html 의 CARE-PLANS 표식 사이를 갈아 끼운다
 *
 * 손으로 회차표를 옮겨 적지 않는다 — 삼성 표를 칸 단위로 해석한다. 표 칸은 이런 꼴이다:
 *   "종합점검/케어 연 1회 1, 2년차"     → 1·2년차
 *   "전문세척 1회"                      → 그 칸의 해
 *   "종합점검/필터 교체 연 2회 총 6회"   → 해마다 2회 (6개월 주기)
 *   "종합점검/케어 연 1회 총 3회상판교체 3년차 총 1회" → 해마다 점검 + 3년차 상판교체
 *   "종합점검/케어 & 상판교체 1회"       → 그 칸의 해에 둘 다
 * 정의(care-kinds)에 없는 케어 이름이 나오면 **멈춘다** — 정의 없는 케어를 화면에 띄우지 않는다.
 *
 * 쓰기: node scripts/build-care-plans.mjs        검사: --check (커밋본 == 재생성)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CARE_KINDS } from './fixtures/care-kinds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/care-subs.json'), 'utf8'));
const APP = path.join(ROOT, 'public/care-app.html');
const BEGIN = '/* CARE-PLANS:BEGIN — scripts/build-care-plans.mjs 가 만든다. 손으로 고치지 말 것 */';
const END = '/* CARE-PLANS:END */';

const norm = (s) => String(s).replace(/\s+/g, '');
const TYPE_OF = { '방문케어 프리미엄': 'premium', '방문케어 라이트': 'lite', '셀프케어': 'self' };
const TYPE_KEY = { premium: 'P', lite: 'L', self: 'S' };
/* 세척·교체처럼 「그 회차에만 오는」 케어 — 회차 칩을 다른 색으로 칠한다 */
const SPECIAL = /세척|교체(?!\s*$)|상판|배터리/;

function kindLookup(key, raw) {
  const def = CARE_KINDS[key];
  const n = norm(raw);
  const hit = Object.keys(def.kinds).find(k => norm(k) === n);
  if (!hit) throw new Error(`[${key}] 정의 없는 케어 이름: 「${raw}」 — scripts/fixtures/care-kinds.mjs 에 원문 정의를 넣을 것`);
  return hit;
}

/* 표 한 칸을 [{kind, years:[…], perYear}] 로 */
function parseCell(key, text, year) {
  const out = [];
  if (!text) return out;
  let t = text;
  /* 「* 3년차: 배터리 교체 (총 1회에 한함)」 — 로봇청소기 표의 꼬리 */
  const star = /\*\s*(\d)년차\s*:\s*([^()]+?)\s*\(총 1회에 한함\)/.exec(t);
  if (star) {
    out.push({ kind: kindLookup(key, star[2]), years: [+star[1]], perYear: 1 });
    t = t.slice(0, star.index).trim();
  }
  /* 「…총 3회상판교체 3년차 총 1회」 처럼 붙어 있으면 「회」 뒤에서 가른다 · 「A & B 1회」 는 & 로 */
  const segs = t.split(/(?<=회)(?=[가-힣])/).map(s => s.trim()).filter(Boolean);
  for (const seg of segs) {
    let m;
    if ((m = /^(.+?)\s*&\s*(.+?)\s*(\d)회$/.exec(seg))) {
      out.push({ kind: kindLookup(key, m[1]), years: [year], perYear: 1 });
      out.push({ kind: kindLookup(key, m[2]), years: [year], perYear: 1 });
    } else if ((m = /^(.+?)\s*연\s*(\d)회\s*([\d,\s]+)년차$/.exec(seg))) {
      out.push({ kind: kindLookup(key, m[1]), years: m[3].split(',').map(x => +x.trim()), perYear: +m[2] });
    } else if ((m = /^(.+?)\s*연\s*(\d)회\s*총\s*(\d+)회$/.exec(seg))) {
      const per = +m[2], tot = +m[3];
      out.push({ kind: kindLookup(key, m[1]), years: Array.from({ length: tot / per }, (_, i) => i + 1), perYear: per });
    } else if ((m = /^(.+?)\s*(\d)년차\s*총\s*1회$/.exec(seg))) {
      out.push({ kind: kindLookup(key, m[1]), years: [+m[2]], perYear: 1 });
    } else if ((m = /^(.+?)\s*(\d)회$/.exec(seg))) {
      out.push({ kind: kindLookup(key, m[1]), years: [year], perYear: 1 });
    } else {
      throw new Error(`[${key}] 표 칸을 읽지 못했다: 「${seg}」`);
    }
  }
  return out;
}

function buildProduct(key, P) {
  const def = CARE_KINDS[key];
  if (!def) throw new Error('정의 없음: ' + key);
  const plans = {};
  for (const tb of P.tables) {
    const type = TYPE_OF[tb.h];
    if (!type) throw new Error(`[${key}] 표 머리를 모름: ${tb.h}`);
    for (const row of tb.rows) {
      const lab = row[0] && row[0].x;
      const m = /^(\d)년형\s*(\d+)개월$/.exec(lab || '');
      if (!m) continue;
      const term = +m[1], cycle = +m[2];
      const pk = TYPE_KEY[type] + cycle;
      const plan = plans[pk] || (plans[pk] = { type, cycle, terms: [], sched: {} });
      plan.terms.push(term);
      /* 해마다 무엇이 오는가 — {year: [{kind, n}]} */
      const yrs = {};
      row.slice(1, 7).forEach((c, i) => {
        for (const e of parseCell(key, c.x, i + 1)) for (const y of e.years) {
          (yrs[y] = yrs[y] || []).push({ kind: e.kind, n: e.perYear });
        }
      });
      plan.sched[term] = yrs;
    }
  }
  /* 회차 — 가장 긴 계약(6년형, 로봇청소기는 5년형) 기준으로 펼친다 */
  for (const [pk, plan] of Object.entries(plans)) {
    const maxT = Math.max(...plan.terms);
    const yrs = plan.sched[maxT];
    const rounds = [];
    for (let y = 1; y <= maxT; y++) {
      const es = yrs[y]; if (!es) continue;
      const per = Math.max(...es.map(e => e.n));
      for (let v = 1; v <= per; v++) {
        const kinds = es.filter(e => e.n >= v).map(e => e.kind);
        const month = per === 2 ? (v === 1 ? y * 12 - 6 : y * 12) : y * 12;
        const special = kinds.some(k => SPECIAL.test(k) && !/^종합점검/.test(k));
        rounds.push({
          label: per === 2 ? (rounds.length + 1) + '회차' : y + '년차',
          month: month + '개월차',
          kinds,
          badge: kinds.map(k => def.kindNm?.[k] || k).join(' + '),
          bc: special ? 'btl' : 'bbl',
        });
      }
    }
    plan.rounds = rounds;
    plan.total = '총 ' + rounds.length + '회';
    plan.maxTerm = maxT;
    plan.terms.sort();
  }
  /* 사진 — 탭(유형)마다 삼성이 보여 주는 것만. 원문에서 주석으로 빠진 것은 담지 않는다 */
  const imgs = [];
  const hidden = [];
  for (const tab of P.tabs) {
    const type = TYPE_OF[tab.label]; if (!type) continue;
    for (const s of tab.slides) {
      const src = s.src.startsWith('//') ? 'https:' + s.src : s.src;
      if (s.hidden) { hidden.push({ type, l: s.dt }); continue; }
      let e = imgs.find(x => x.s === src);
      if (!e) imgs.push(e = { s: src, l: s.dt, t: [] });
      if (!e.t.includes(type)) e.t.push(type);
    }
  }
  const heads = {};
  for (const tab of P.tabs) { const type = TYPE_OF[tab.label]; if (type) heads[type] = tab.h4.replace(/!\s*/, '! '); }
  return {
    title: def.title,
    kinds: def.kinds,
    kindNm: def.kindNm || {},
    deliver: def.deliver || [],
    reinstall: !!def.reinstall,
    plans,
    imgs, hiddenImgs: hidden, heads,
    notes: P.notes.filter(n => !/^\* 가입하신 요금제의 유형/.test(n)),
    url: P.url,
  };
}

const out = {};
for (const [key, P] of Object.entries(SRC.products)) out[key] = buildProduct(key, P);

/* 회차표의 sched 는 화면이 「계약기간별 구성」을 그릴 때 쓴다 — 그대로 싣는다 */
const literal = `${BEGIN}
/* 원문 ${SRC._collectedAt} · ${SRC._source} */
const CARE_PLANS = ${JSON.stringify(out)};
${END}`;

const app = fs.readFileSync(APP, 'utf8');
const a = app.indexOf(BEGIN), b = app.indexOf(END);
if (a < 0 || b < 0) throw new Error('care-app.html 에 CARE-PLANS 표식이 없다');
const next = app.slice(0, a) + literal + app.slice(b + END.length);
if (process.argv.includes('--check')) {
  if (next !== app) { console.error('✗ care-app.html 의 CARE-PLANS 가 낡았다 — node scripts/build-care-plans.mjs'); process.exit(1); }
  console.log('✓ CARE-PLANS 최신'); process.exit(0);
}
fs.writeFileSync(APP, next);
for (const [k, v] of Object.entries(out)) {
  console.log(k.padEnd(16), Object.entries(v.plans).map(([pk, p]) => `${pk}(${p.terms.join('')}년·${p.total})`).join(' '), '· 사진', v.imgs.length, v.hiddenImgs.length ? '(숨김 ' + v.hiddenImgs.length + ')' : '');
}
