/*
 * 벽 벡터화 — 칸 지도(벽·문·창 픽셀)를 **벽 선분과 문·창 물체**로 바꾼다.
 *
 * 배치 시뮬레이터는 지금까지 벽을 픽셀로 들고 있었다(3D 는 픽셀을 그대로 압출).
 * 픽셀은 고칠 수도, 길이를 잴 수도, 넓이를 셀 수도 없다. 선분이면 셋 다 산수가 된다.
 *
 *   입력  wall  Uint8Array(w*h)  1 = 벽        (모델이든 규칙이든 상관없다)
 *         door, win  Uint8Array(w*h) 또는 null (모델만 준다)
 *   출력  { walls:[{o,c,a,b,t}], openings:[{type,o,c,a,b,t,wall}] }
 *         o = 'h'(가로) | 'v'(세로) · c = 중심선 좌표 · a..b = 길이 방향 구간 · t = 두께 (전부 px)
 *
 * 아파트 도면의 벽은 거의 전부 가로·세로다. 그래서 일반 선 검출(Hough) 대신
 * **열(가로 벽)·행(세로 벽)을 한 번씩 훑으며 두께가 일정한 띠를 이어 간다** — O(w·h) 한 번.
 * 대각선 벽은 이 방식에서 빠진다(규칙 인식의 keepBands 와 같은 한계, 코퍼스에서 드물다).
 *
 * 전역 WallVec 로 내놓는다 — place-app 은 고전 스크립트라 import 를 못 쓰고, Node 검사는 vm 으로 싣는다.
 */
(function (G) {
  'use strict';

  /** 한 방향 띠 뽑기. 가로 벽이면 열을 따라(x 증가) 세로 런을 이어 간다. */
  function tracks(mask, w, h, horiz, P) {
    const L = horiz ? w : h, N = horiz ? h : w;           // L: 진행 방향 길이, N: 가로지르는 방향
    const at = horiz ? (i, j) => mask[j * w + i] : (i, j) => mask[i * w + j];
    const live = [], done = [];
    for (let i = 0; i < L; i++) {
      // 이 줄에서 가로지르는 방향의 런들
      const runs = [];
      for (let j = 0; j < N; ) {
        if (!at(i, j)) { j++; continue; }
        let k = j; while (k < N && at(i, k)) k++;
        if (k - j <= P.maxT) runs.push([j, k]);
        j = k;
      }
      const used = new Uint8Array(runs.length);
      for (const tr of live) {
        if (tr.end) continue;
        let best = -1, bd = 1e9;
        for (let r = 0; r < runs.length; r++) {
          if (used[r]) continue;
          const c = (runs[r][0] + runs[r][1]) / 2, d = Math.abs(c - tr.lc);
          if (d <= P.tol && d < bd) { bd = d; best = r; }
        }
        if (best >= 0) {
          used[best] = 1;
          const [j0, j1] = runs[best];
          tr.cs.push((j0 + j1) / 2); tr.ts.push(j1 - j0); tr.lc = (j0 + j1) / 2; tr.last = i;
        } else if (i - tr.last > P.gap) tr.end = true;
      }
      for (let r = 0; r < runs.length; r++) if (!used[r]) {
        const [j0, j1] = runs[r];
        live.push({ first: i, last: i, lc: (j0 + j1) / 2, cs: [(j0 + j1) / 2], ts: [j1 - j0] });
      }
      // 끝난 것 걷어내기(뒤에서부터)
      for (let t = live.length - 1; t >= 0; t--) if (live[t].end) done.push(live.splice(t, 1)[0]);
    }
    done.push(...live);
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    const out = [];
    for (const tr of done) {
      const len = tr.last - tr.first + 1, t = med(tr.ts);
      if (len < 4 || len < t * 0.5) continue;               // 두께의 절반도 안 되면 부스러기
      // 벽은 두께보다 길다. 못 미치는 것은 **토막(stub)** 으로 표시해 두고, 벽이나 문·창에 닿을 때만 살린다
      // — 창과 모서리 사이의 짧은 벽(창을 받치는 자리)이 여기 걸린다
      const stub = len < P.minLen || len < t * P.aspect;
      out.push({ o: horiz ? 'h' : 'v', c: med(tr.cs), a: tr.first, b: tr.last + 1, t, stub });
    }
    return out;
  }

  /** 같은 선 위에서 작은 틈으로 끊긴 조각을 잇는다(틈이 문 폭보다 작을 때만) */
  function mergeCollinear(ws, P) {
    // 길이 방향 시작점 순으로 훑는다. 중심선 순으로 정렬하면 c 가 조금 다른 두 조각의 순서가
    // 뒤바뀌어, 뒤 조각이 앞 조각 안으로 삼켜지며 **구간이 통째로 사라진다**(실측으로 300px 벽이 빠졌다).
    ws.sort((p, q) => p.a - q.a);
    const out = [];
    for (const s of ws) {
      const m = out.find((q) => q.o === s.o && Math.abs(q.c - s.c) <= P.tol && s.a - q.b <= P.join && q.a - s.b <= P.join);
      if (m) {
        const L1 = m.b - m.a, L2 = s.b - s.a;
        m.c = (m.c * L1 + s.c * L2) / (L1 + L2);
        m.t = Math.max(m.t, s.t);
        m.a = Math.min(m.a, s.a); m.b = Math.max(m.b, s.b);
      } else out.push({ ...s });
    }
    return out;
  }

  /** 모서리 잇기 — 가로 벽 끝이 세로 벽 근처면 그 중심선까지 늘리고, 반대도 같다 */
  function snapJunctions(ws, P) {
    const H = ws.filter((s) => s.o === 'h'), V = ws.filter((s) => s.o === 'v');
    const snap = (A, B) => {
      for (const s of A) for (const end of ['a', 'b']) {
        const p = s[end];
        let best = null, bd = 1e9;
        for (const q of B) {
          // q 는 수직 방향 선분: q.c 가 s 의 길이 방향 좌표, q.a..q.b 가 s.c 를 덮어야 한다
          // 여유에 s 의 두께 반을 더한다 — 교차점에서 상대 벽은 s 의 **면**에서 끊겨 있어 중심선까지 t/2 가 빈다
          const tol = P.snap + s.t / 2;
          if (s.c < q.a - tol || s.c > q.b + tol) continue;
          const d = Math.abs(q.c - p);
          if (d <= q.t / 2 + P.snap && d < bd) { bd = d; best = q; }
        }
        // 상대 벽의 **바깥 면**까지 — 중심선에서 멈추면 모서리에 두께 반만큼 홈이 남는다
        if (best) s[end] = end === 'a' ? best.c - best.t / 2 : best.c + best.t / 2;
      }
    };
    snap(H, V); snap(V, H);
    for (const s of ws) if (s.a > s.b) { const x = s.a; s.a = s.b; s.b = x; }
    return ws;
  }

  /** 문·창 픽셀 덩어리 → 물체. 같은 방향의 가까운 벽선(또는 그 틈)에 붙인다 */
  function openings(mask, type, w, h, walls, P) {
    if (!mask) return [];
    const seen = new Uint8Array(w * h), out = [], st = [];
    for (let s = 0; s < w * h; s++) {
      if (!mask[s] || seen[s]) continue;
      let x0 = w, x1 = 0, y0 = h, y1 = 0, n = 0;
      st.push(s); seen[s] = 1;
      while (st.length) {
        const k = st.pop(), x = k % w, y = (k / w) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; st.push(k - 1); }
        if (x < w - 1 && mask[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; st.push(k + 1); }
        if (y > 0 && mask[k - w] && !seen[k - w]) { seen[k - w] = 1; st.push(k - w); }
        if (y < h - 1 && mask[k + w] && !seen[k + w]) { seen[k + w] = 1; st.push(k + w); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (Math.max(bw, bh) < P.minOpen || n < P.minOpen) continue;       // 점 몇 개는 물체가 아니다
      const pick = placeOpening(x0, y0, x1 + 1, y1 + 1, type, walls, P);
      out.push({ type, ...pick });
    }
    return out;
  }

  /**
   * 문·창 덩어리가 **어느 벽선 위에** 있는가.
   * 창은 벽 위의 가는 띠라 긴 쪽이 곧 벽 방향이다. 문은 다르다 — AI Hub 는 문을 **여닫는 호까지 포함한
   * 상자**로 칠해서 덩어리가 거의 정사각형이고, 긴 쪽으로는 방향을 못 가른다. 그래서 상자의 네 변마다
   * 그 위를 지나는 벽선을 찾아 **문 폭만큼 끊겨 있고 양 끝에 벽이 붙은 변**을 고른다(문은 벽의 틈에 선다).
   */
  function placeOpening(x0, y0, x1, y1, type, walls, P) {
    const cand = [];
    const edges = type === 'door'
      ? [['h', y0, x0, x1], ['h', y1, x0, x1], ['v', x0, y0, y1], ['v', x1, y0, y1]]
      : [x1 - x0 >= y1 - y0 ? ['h', (y0 + y1) / 2, x0, x1] : ['v', (x0 + x1) / 2, y0, y1]];
    const near = Math.max(P.join * 3, 6);
    for (const [o, line, a, b] of edges) {
      // 같은 줄 위라도 **닿아 있는** 벽만 — 줄만 보면 방 건너편 먼 벽에 붙어 문이 방 한가운데 선다(실측)
      const on = walls.filter((s) => s.o === o && Math.abs(s.c - line) <= s.t / 2 + P.tol * 2 && s.b >= a - near && s.a <= b + near);
      if (!on.length) continue;
      let cover = 0, ends = 0, t = 0, c = 0, wi = -1;
      for (const s of on) {
        cover += Math.max(0, Math.min(b, s.b) - Math.max(a, s.a));
        if (Math.abs(s.b - a) <= near || (s.a < a && s.b > a && s.b < b)) ends |= 1;   // 앞 끝에 벽이 닿는다
        if (Math.abs(s.a - b) <= near || (s.b > b && s.a < b && s.a > a)) ends |= 2;   // 뒤 끝에 벽이 닿는다
        if (s.t > t) { t = s.t; c = s.c; wi = walls.indexOf(s); }
      }
      const adj = (ends & 1 ? 1 : 0) + (ends & 2 ? 1 : 0);
      cand.push({ o, c, a, b, t, wall: wi, adj, cover: cover / Math.max(1, b - a), d: Math.abs(c - line) });
    }
    if (!cand.length) {                       // 붙을 벽선이 없다 — 긴 쪽을 방향으로 두고 제자리에 둔다
      const o = x1 - x0 >= y1 - y0 ? 'h' : 'v';
      return o === 'h' ? { o, c: (y0 + y1) / 2, a: x0, b: x1, t: y1 - y0, wall: -1 }
                       : { o, c: (x0 + x1) / 2, a: y0, b: y1, t: x1 - x0, wall: -1 };
    }
    cand.sort((p, q) => q.adj - p.adj || p.cover - q.cover || p.d - q.d);
    const { adj, cover, d, ...best } = cand[0];
    if (!adj && !cover) best.wall = -1;       // 벽 끝에도 몸통에도 안 닿는다 — 벽 위의 문·창이 아니다
    return best;
  }

  function defaults(w, h, opt) {
    const S = Math.max(w, h);
    return Object.assign({
      maxT: Math.round(S * 0.05),      // 이보다 두꺼운 런은 벽이 아니다(계단·채움)
      minLen: Math.round(S * 0.015),   // 이보다 짧으면 벽 조각이 아니라 부스러기
      aspect: 2,                        // 길이 ≥ 두께×2
      tol: Math.max(2, Math.round(S * 0.004)),
      gap: 1,                           // 한 줄 끊긴 것까지는 같은 벽
      join: Math.round(S * 0.006),      // 이 폭 이하 틈은 잇는다(문은 이보다 넓다)
      snap: Math.round(S * 0.008),
      minOpen: Math.round(S * 0.006),
    }, opt || {});
  }

  function vectorize(inp, opt) {
    const { w, h } = inp, P = defaults(w, h, opt);
    const all = tracks(inp.wall, w, h, true, P).concat(tracks(inp.wall, w, h, false, P));
    let walls = mergeCollinear(all.filter((s) => !s.stub).map(({ stub, ...s }) => s), P);
    const box = (s, pad) => s.o === 'h'
      ? [s.a - pad, s.c - s.t / 2 - pad, s.b + pad, s.c + s.t / 2 + pad]
      : [s.c - s.t / 2 - pad, s.a - pad, s.c + s.t / 2 + pad, s.b + pad];
    const overlap = (p, q) => Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]));
    const hitPix = (r) => {                   // 테두리를 훑어 문·창 픽셀이 닿는지
      for (const m of [inp.door, inp.win]) if (m) {
        const X0 = Math.max(0, r[0] | 0), X1 = Math.min(w - 1, r[2] | 0), Y0 = Math.max(0, r[1] | 0), Y1 = Math.min(h - 1, r[3] | 0);
        for (let x = X0; x <= X1; x++) if (m[Y0 * w + x] || m[Y1 * w + x]) return true;
        for (let y = Y0; y <= Y1; y++) if (m[y * w + X0] || m[y * w + X1]) return true;
      }
      return false;
    };
    const main = walls.map((s) => box(s, 0));
    for (const s of all) {
      if (!s.stub) continue;
      const r0 = box(s, 0), area = (r0[2] - r0[0]) * (r0[3] - r0[1]);
      if (main.some((q) => overlap(r0, q) > area * 0.6)) continue;       // 이미 있는 벽 안이다
      const r = box(s, P.snap);
      if (main.some((q) => overlap(r, q) > 0) || hitPix(r)) { const { stub, ...keep } = s; walls.push(keep); }
    }
    walls = mergeCollinear(walls, P);
    walls = snapJunctions(walls, P);
    const ops = openings(inp.door, 'door', w, h, walls, P).concat(openings(inp.win, 'win', w, h, walls, P));
    return { walls, openings: ops, params: P };
  }

  /** 선분을 다시 픽셀로 — 검산용(원래 마스크와 견준다) */
  function rasterize(v, w, h) {
    const m = new Uint8Array(w * h);
    for (const s of v.walls) {
      const c0 = Math.round(s.c - s.t / 2), c1 = Math.round(s.c + s.t / 2);
      for (let i = Math.max(0, Math.floor(s.a)); i < Math.min(s.o === 'h' ? w : h, Math.ceil(s.b)); i++)
        for (let j = Math.max(0, c0); j < Math.min(s.o === 'h' ? h : w, c1); j++)
          m[s.o === 'h' ? j * w + i : i * w + j] = 1;
    }
    return m;
  }

  /*
   * ── 사람이 고친다 (2026-09-30) ─────────────────────────────────────────
   * 모델·규칙이 벽을 잘못 읽는 자리는 반드시 남는다(첨부 평면·범례가 벽이 되고, 창을 문으로 읽는다).
   * 여기는 **순수 함수**만 둔다 — 화면(place-app)은 누르고 끌기만 하고 계산은 전부 이쪽이 한다.
   * 그래야 브라우저 없이 검사할 수 있다(test-wallvec ⑧~⑫).
   *
   * 개구부의 `wall` 은 **벽 배열의 번호**다. 벽을 지우면 번호가 밀리므로 여기서 함께 고친다 —
   * 화면에서 splice 를 직접 하면 문이 엉뚱한 벽에 붙는다.
   */
  const sameWall = (p, q) => p.o === q.o && p.c === q.c && p.a === q.a && p.b === q.b && p.t === q.t;

  /** 누른 자리의 벽·개구부 — 개구부가 먼저다(벽 위에 얹혀 있어 벽을 먼저 보면 영영 못 고른다) */
  function hit(v, x, y, tol) {
    let best = null;
    const test = (kind, list) => list.forEach((s, i) => {
      if (kind === 'o' && s.wall < 0) return;
      const t = (s.t || 6) / 2;
      const along = s.o === 'h' ? x : y, across = s.o === 'h' ? y : x;
      const da = Math.max(0, s.a - along, along - s.b), dc = Math.max(0, Math.abs(across - s.c) - t);
      const d = Math.hypot(da, dc);
      if (d <= tol && (!best || (best.kind === kind && d < best.d))) best = { kind, i, d };
    });
    test('o', v.openings);
    if (!best) test('w', v.walls);
    return best;
  }

  /** 벽을 지운다 — 그 벽에 붙은 문·창도 함께 지우고 뒤 번호를 당긴다 */
  function removeWall(v, i) {
    v.walls.splice(i, 1);
    v.openings = v.openings.filter((o) => o.wall !== i);
    for (const o of v.openings) if (o.wall > i) o.wall--;
  }

  /** 벽을 법선 방향으로 옮긴다 — 붙은 문·창도 같이 간다(안 따라가면 3D 에서 창만 허공에 남는다) */
  function moveWall(v, i, c) {
    const s = v.walls[i], dc = c - s.c;
    s.c = c;
    for (const o of v.openings) if (o.wall === i) o.c += dc;
  }

  /**
   * 두 점으로 벽을 더한다. 방향은 긴 쪽이 정한다(이 앱의 벽은 가로·세로뿐이다).
   * 끝이 수직 벽 근처(snap 안)면 **그 벽의 바깥 면까지** 늘린다 — vectorize 가 모서리를
   * 잇는 방식과 같다. 중심선에서 멈추면 두께 반만큼 홈이 남는다(③ 과 같은 함정).
   */
  function addWall(v, x0, y0, x1, y1, t, snap) {
    const o = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? 'h' : 'v';
    const c = o === 'h' ? (y0 + y1) / 2 : (x0 + x1) / 2;
    let a = Math.min(o === 'h' ? x0 : y0, o === 'h' ? x1 : y1), b = Math.max(o === 'h' ? x0 : y0, o === 'h' ? x1 : y1);
    const perp = v.walls.filter((s) => s.o !== o && c >= s.a - snap && c <= s.b + snap);
    const near = (e) => perp.reduce((m, s) => (Math.abs(s.c - e) <= snap + s.t / 2 && (!m || Math.abs(s.c - e) < Math.abs(m.c - e))) ? s : m, null);
    const sa = near(a), sb = near(b);
    if (sa) a = sa.c - sa.t / 2;
    if (sb) b = sb.c + sb.t / 2;
    if (b - a < 1) return -1;
    v.walls.push({ o, c, a, b, t });
    return v.walls.length - 1;
  }

  /**
   * 네모 안에 **통째로 든** 벽·문·창을 지운다 — 첨부 평면·범례·배치도가 벽으로 선 것을 한 번에 치운다.
   * 걸치기만 한 벽은 남긴다: 네모를 조금 넓게 그려도 옆 방 바깥벽이 잘리지 않아야 한다.
   * 지운 벽 수를 돌려준다.
   */
  function removeInRect(v, x0, y0, x1, y1) {
    const X0 = Math.min(x0, x1), X1 = Math.max(x0, x1), Y0 = Math.min(y0, y1), Y1 = Math.max(y0, y1);
    const inside = (s) => { const t = (s.t || 6) / 2;
      const r = s.o === 'h' ? [s.a, s.c - t, s.b, s.c + t] : [s.c - t, s.a, s.c + t, s.b];
      return r[0] >= X0 && r[2] <= X1 && r[1] >= Y0 && r[3] <= Y1; };
    v.openings = v.openings.filter((o) => !inside(o));
    let n = 0;
    for (let i = v.walls.length - 1; i >= 0; i--) if (inside(v.walls[i])) { removeWall(v, i); n++; }
    return n;
  }

  /** 문 ↔ 창 */
  function toggleOpening(v, j) { const op = v.openings[j]; op.type = op.type === 'door' ? 'win' : 'door'; }
  function removeOpening(v, j) { v.openings.splice(j, 1); }

  /** 되돌리기용 사본 — 벽·개구부만(dark 같은 큰 배열은 담지 않는다) */
  const snapshot = (v) => JSON.stringify({ walls: v.walls, openings: v.openings });
  function restore(v, snap) { const s = JSON.parse(snap); v.walls = s.walls; v.openings = s.openings; }

  /**
   * 고친 뒤 **판정 마스크**(놓을 수 있는가 · 자동 배치 · 벽 붙이기가 읽는 것).
   * 3D 만 고치고 판정을 두면 "지운 벽 자리에 냉장고가 안 들어간다"가 된다.
   * 그렇다고 통째로 선분 그림으로 바꾸면 검증된 픽셀 마스크(재현 95.6%)를 버리게 된다 —
   * 원래 마스크에서 **사라진 벽만 지우고, 지금 벽을 칠한다.** 사라진 벽이 교차점에서
   * 남의 벽 칸까지 지우는 것은 지금 벽을 다시 칠하며 메워진다.
   */
  function editedMask(dark0, walls0, v, w, h) {
    const gone = walls0.filter((q) => !v.walls.some((p) => sameWall(p, q)));
    const out = dark0.slice();
    const cut = rasterize({ walls: gone }, w, h), now = rasterize(v, w, h);
    for (let i = 0; i < out.length; i++) { if (cut[i]) out[i] = 0; if (now[i]) out[i] = 1; }
    return out;
  }

  G.WallVec = { vectorize, rasterize, _tracks: tracks,
    edit: { hit, removeWall, removeInRect, moveWall, addWall, toggleOpening, removeOpening, snapshot, restore, editedMask } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
