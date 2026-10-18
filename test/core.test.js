'use strict';
const assert = require('assert');
const C = require('../core.js');

// --- classifyObservation ---
assert.strictEqual(C.classifyObservation({ pressure: 1005, sst: 29, ssh: 15 }), 'elnino');
assert.strictEqual(C.classifyObservation({ pressure: 1018, sst: 23, ssh: -15 }), 'lanina');
assert.strictEqual(C.classifyObservation({ pressure: 1013, sst: 26, ssh: 0 }), 'neutral');

// --- evaluateArrow: 엘니뇨 데이터로 동쪽 이동은 타당, 서쪽은 실패 ---
const elninoObs = { pressure: 1005, sst: 29, ssh: 15 };
assert.strictEqual(C.evaluateArrow(elninoObs, 'E').valid, true);
assert.strictEqual(C.evaluateArrow(elninoObs, 'W').valid, false);
assert.strictEqual(C.evaluateArrow(elninoObs, 'W').feedback.title, '방향이 반대입니다');

// --- evaluateArrow: 라니냬 데이터로 서쪽 이동은 타당 ---
const laninaObs = { pressure: 1018, sst: 23, ssh: -15 };
assert.strictEqual(C.evaluateArrow(laninaObs, 'W').valid, true);
assert.strictEqual(C.evaluateArrow(laninaObs, 'SW').valid, true);
assert.strictEqual(C.evaluateArrow(laninaObs, 'E').valid, false);

// --- evaluateArrow: 중립 데이터로 북쪽 계열 타당 ---
const neutralObs = { pressure: 1013, sst: 26, ssh: 0 };
assert.strictEqual(C.evaluateArrow(neutralObs, 'N').valid, true);
assert.strictEqual(C.evaluateArrow(neutralObs, 'NE').valid, true);
assert.strictEqual(C.evaluateArrow(neutralObs, 'E').valid, false);

// --- 무효 방향 키 ---
assert.strictEqual(C.evaluateArrow(elninoObs, 'XX').valid, false);
assert.strictEqual(C.evaluateArrow(elninoObs, 'XX').reason, 'invalid_dir');

// --- tryMove: 게임 상태 전이 ---
let G = C.newGame('A');
assert.deepStrictEqual(G.pos, { row: 4, col: 1 });
assert.strictEqual(G.status, 'playing');

// 라니냬 데이터로 서쪽 이동 → 성공
let res = C.tryMove(G, laninaObs, 'W');
assert.ok(res.ok);
assert.deepStrictEqual(G.pos, { row: 4, col: 0 });
assert.strictEqual(G.turn, 1);
assert.strictEqual(G.score, 10);
assert.strictEqual(G.path.length, 2);
assert.strictEqual(G.pressureMarks.length, 1);
assert.strictEqual(G.pressureMarks[0].color, 'blue'); // 라니냬 pressure -1

// 틀린 방향 → 실패, 위치 유지, 실패 기록
res = C.tryMove(G, laninaObs, 'E');
assert.ok(!res.ok);
assert.strictEqual(res.error, 'invalid_move');
assert.deepStrictEqual(G.pos, { row: 4, col: 0 });
assert.strictEqual(G.failures.length, 1);
assert.strictEqual(G.score, 9);

// 경계 밖 이동
res = C.tryMove(G, laninaObs, 'W');
assert.ok(!res.ok);
assert.strictEqual(res.error, 'out_of_bounds');

// --- 전체 경로: 시작 A(4,1)에서 한국(1,7)까지 시나리오를 바꿔가며 진행 ---
G = C.newGame('A');
// 북동쪽으로 진행하려면 중립 관측이 필요하다.
const steps = ['NE','NE','NE','NE','NE','E'];
// 중립 관측 → N/NE/NW 타당. 경로: (4,1)→(3,2)→(2,3)→(1,4)... 하지만 (1,4)에서 한국(1,7)까지 NE로는 row 0으로 빗나감.
// 순서를 재설계: N/NE/NW 조합으로 (4,1)→한국(1,7) 도달 경로
// (4,1) NE→(3,2) NE→(2,3) NE→(1,4) E는 중립에서 불가 → 관측을 엘니뇨로 바꾸면 E/NE/SE 타당.
const plan = [
  { obs: neutralObs, dir: 'NE' }, // (3,2)
  { obs: neutralObs, dir: 'NE' }, // (2,3)
  { obs: neutralObs, dir: 'NE' }, // (1,4)
  { obs: elninoObs, dir: 'E'  },  // (1,5)
  { obs: elninoObs, dir: 'E'  },  // (1,6)
  { obs: elninoObs, dir: 'E'  },  // (1,7) = KOREA
];
let last;
for (const step of plan) {
  last = C.tryMove(G, step.obs, step.dir);
  assert.ok(last.ok, 'step failed: ' + JSON.stringify(step));
}
assert.strictEqual(G.status, 'won');
assert.ok(C.reachedKorea(G.pos));
assert.strictEqual(G.score, 10 * 6 + 50);
assert.ok(G.badges.includes('한반도 도달'));
assert.ok(G.badges.includes('무실패 예측'));
assert.ok(G.finalImpact);

// 게임 종료 후 이동 시도 불가
res = C.tryMove(G, neutralObs, 'N');
assert.ok(!res.ok);
assert.strictEqual(res.error, 'game_over');

// --- forecastNextTile ---
const f = C.forecastNextTile('elnino', 3, C.KOREA);
assert.strictEqual(f.scenario, 'elnino');
assert.strictEqual(f.pressureAnomaly > 0, true);
assert.strictEqual(f.tempAnomaly > 0, true);
assert.strictEqual(f.precipAnomaly < 0, true);

// --- 지도 헬퍼 ---
assert.strictEqual(C.tileTypeAt(1, 7), 'korea');
assert.strictEqual(C.tileTypeAt(4, 1), 'startA');
assert.strictEqual(C.tileTypeAt(3, 3), 'startB');
assert.strictEqual(C.tileTypeAt(1, 0), 'mountain');
assert.strictEqual(C.tileTypeAt(0, 0), 'land');
assert.strictEqual(C.tileTypeAt(2, 2), 'ocean');
assert.strictEqual(C.inBounds({ row: 0, col: 0 }), true);
assert.strictEqual(C.inBounds({ row: 6, col: 0 }), false);
assert.strictEqual(C.dirFromDelta(-1, 1).key, 'NE');
assert.strictEqual(C.isAdjacent({ row: 4, col: 1 }, { row: 3, col: 2 }), true);

// --- 시작 B 확인 ---
const GB = C.newGame('B');
assert.deepStrictEqual(GB.pos, { row: 3, col: 3 });

console.log('✅ 모든 로직 테스트 통과 (' + new Date().toISOString() + ')');
