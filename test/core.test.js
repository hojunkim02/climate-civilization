'use strict';
const assert = require('assert');
const C = require('../core.js');

// --- 좌표 헬퍼 ---
assert.strictEqual(C.latOf(0), 36);
assert.strictEqual(C.latOf(3), -45);
assert.strictEqual(C.lonOf(5), 127);
assert.deepStrictEqual(C.KOREA, { row: 0, col: 5 });

// --- 라우트 존재 확인: 시작 2종 × 시나리오 2종 ---
for (const sk of ['A', 'B']) {
  for (const sc of ['elnino', 'lanina']) {
    const r = C.routeFor(sk, sc);
    assert.ok(r, `route missing: ${sk}:${sc}`);
    assert.ok(r.waypoints.length >= 4, `${sk}:${sc} waypoints too short`);
    const last = r.waypoints[r.waypoints.length - 1];
    assert.deepStrictEqual(last, [C.KOREA.row, C.KOREA.col], `${sk}:${sc} route must end at Korea`);
    const first = r.waypoints[0];
    const sp = C.START_POINTS[sk];
    assert.deepStrictEqual(first, [sp.row, sp.col], `${sk}:${sc} route must start at start point`);
    // 인접 이동 검증
    for (let i = 1; i < r.waypoints.length; i++) {
      const [fr, fc] = r.waypoints[i - 1];
      const [tr, tc] = r.waypoints[i];
      const dist = Math.max(Math.abs(tr - fr), Math.abs(tc - fc));
      assert.strictEqual(dist, 1, `${sk}:${sc} non-adjacent step at ${i}`);
    }
    // 노트 개수 = 이동 단계 수
    assert.strictEqual(r.notes.length, r.waypoints.length - 1, `${sk}:${sc} notes mismatch`);
  }
}

// --- 게임: A + 엘니뇨 전체 경로 진행 ---
let G = C.newGame('A', 'elnino');
assert.strictEqual(G.status, 'playing');
const route = C.ROUTES['A:elnino'];
let okCount = 0;
for (let i = 1; i < route.waypoints.length; i++) {
  const [fr, fc] = route.waypoints[i - 1];
  const [tr, tc] = route.waypoints[i];
  const d = C.dirFromDelta(tr - fr, tc - fc);
  const res = C.tryMove(G, d.key);
  assert.ok(res.ok, `step ${i} (${d.key}) failed`);
  okCount++;
}
assert.strictEqual(G.status, 'won');
assert.ok(C.reachedKorea(G.pos));
assert.strictEqual(G.failures.length, 0);
assert.ok(G.badges.includes('한반도 도달'));
assert.ok(G.badges.includes('무실패 예측'));
assert.strictEqual(G.score, 10 * okCount + 50);
assert.ok(G.finalImpact);

// 종료 후 이동 불가
const after = C.tryMove(G, 'N');
assert.ok(!after.ok);
assert.strictEqual(after.error, 'game_over');

// --- 오답 처리 및 힌트 ---
G = C.newGame('A', 'elnino');
// 첫 단계 예상: (3,1)→(2,1) = N. 틀린 방향 SE 시도 (S는 경계 밖)
let bad = C.tryMove(G, 'E');
assert.ok(!bad.ok);
assert.strictEqual(bad.error, 'invalid_move');
assert.strictEqual(G.failures.length, 1);
assert.strictEqual(G.pos.row, 3); // 위치 유지
assert.strictEqual(G.failStreak, 1);
// 힌트는 failStreak >= 2부터
bad = C.tryMove(G, 'W');
assert.ok(!bad.ok);
assert.strictEqual(G.failStreak, 2);
bad = C.tryMove(G, 'E');
assert.ok(!bad.ok);
const lastFail = G.failures[G.failures.length - 1];
assert.ok(lastFail.hint, 'hint should appear after 2 consecutive fails');
// 맞으면 성공
const good = C.tryMove(G, 'N');
assert.ok(good.ok);
assert.strictEqual(G.failStreak, 0);

// --- 경계 밖 ---
G = C.newGame('A', 'elnino');
const oob = C.tryMove(G, 'SW'); // (3,1)→(4,0) out of bounds
assert.ok(!oob.ok);
assert.strictEqual(oob.error, 'out_of_bounds');

// --- evaluateDir 무효 키 ---
G = C.newGame('A', 'elnino');
assert.strictEqual(C.evaluateDir(G, 'XX').valid, false);

// --- regionInfo: 바다 타일 ---
const ocean = C.regionInfo(1, 1, 'elnino');
assert.strictEqual(ocean.land, false);
assert.strictEqual(ocean.sst > 0, true);
assert.ok(ocean.obsText.includes('해수면 온도'));
// 엘니뇨 vs 라니냐 SST 편차 부호 반전
const oceanL = C.regionInfo(1, 1, 'lanina');
assert.strictEqual(ocean.sst > oceanL.sst, true);

// --- regionInfo: 육지 타일 ---
const korea = C.regionInfo(0, 5, 'elnino');
assert.strictEqual(korea.land, true);
assert.strictEqual(korea.name, '한반도');
assert.ok(korea.obsText.includes('고온') || korea.obsText.length > 0);
const koreaL = C.regionInfo(0, 5, 'lanina');
assert.ok(koreaL.obsText.includes('한파'));

// 잘못된 시나리오 키 → 기본값 폴백
const fallback = C.regionInfo(1, 1, 'nonsense');
assert.strictEqual(fallback.scenario, 'elnino');

// --- B 시작 라우트 정상 진행 (전체) ---
G = C.newGame('B', 'lanina');
const rb = C.ROUTES['B:lanina'];
for (let i = 1; i < rb.waypoints.length; i++) {
  const [fr, fc] = rb.waypoints[i - 1];
  const [tr, tc] = rb.waypoints[i];
  const d = C.dirFromDelta(tr - fr, tc - fc);
  const res = C.tryMove(G, d.key);
  assert.ok(res.ok);
}
assert.strictEqual(G.status, 'won');

// --- 무효 시작키/시나리오 → 폴백 ---
G = C.newGame('Z', 'nonsense');
assert.strictEqual(G.startKey, 'A');
assert.strictEqual(G.scenario, 'elnino');

console.log('✅ 모든 로직 테스트 통과');
