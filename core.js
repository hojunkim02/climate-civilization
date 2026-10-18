(function (global) {
  'use strict';

  const GRID_COLS = 10;
  const GRID_ROWS = 6;

  // 타일 좌표: (row, col). row 0 = 북쪽.
  // 한국 타일 = (1, 7)
  const KOREA = { row: 1, col: 7 };
  const START_POINTS = {
    A: { row: 4, col: 1, name: '동태평양 (칠레 연안)', latitudeBand: '남반구 열대' },
    B: { row: 3, col: 3, name: '서태평양 (오스트레일리아 북동쪽)', latitudeBand: '남반구 열대' },
  };

  // 한 턴에 이동 가능한 최대 거리 (인접 8방향, 1타일)
  const MAX_STEP = 1;

  // 8방향 정의: key, 한국어 이름, delta
  const DIRECTIONS = [
    { key: 'N',  label: '북',   dr: -1, dc: 0 },
    { key: 'NE', label: '북동', dr: -1, dc: 1 },
    { key: 'E',  label: '동',   dr: 0,  dc: 1 },
    { key: 'SE', label: '남동', dr: 1,  dc: 1 },
    { key: 'S',  label: '남',   dr: 1,  dc: 0 },
    { key: 'SW', label: '남서', dr: 1,  dc: -1 },
    { key: 'W',  label: '서',   dr: 0,  dc: -1 },
    { key: 'NW', label: '북서', dr: -1, dc: -1 },
  ];

  // 지형 타일 (문명식: 바다/육지/산)
  const TILE_TYPES = [
    'ocean', 'land', 'mountain', 'korea', 'startA', 'startB',
  ];

  // 기후 예측 데이터: (대륙과 해양의 분포를 반영한 가중치 기반, 시나리오에 따라 부호 반전)
  const CLIMATE_PRESETS = {
    elnino: { pressure: +1, temp: +0.6, precip: -10, label: '엘니뇨' },
    lanina: { pressure: -1, temp: -0.5, precip: +15, label: '라니냬' },
    neutral: { pressure: 0, temp: 0, precip: 0, label: '중립' },
  };

  // 시작 지점에 따른 시나리오: 동태평양(칠레) = 라니냬 시작, 서태평양(호주) = 엘니뇨 시작
  const START_SCENARIO = { A: 'lanina', B: 'elnino' };

  // 턴(경로 단계)마다 관측 데이터 범위
  const OBS_RANGES = {
    pressure: { min: 995, max: 1025 },
    sst: { min: 16, max: 32 },
    ssh: { min: -25, max: 25 }, // 해수면 높이 이상(cm)
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function manhattan(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
  }

  function chebyshev(a, b) {
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
  }

  function dirFromDelta(dr, dc) {
    return DIRECTIONS.find(function (d) { return d.dr === dr && d.dc === dc; }) || null;
  }

  function isAdjacent(from, to) {
    var d = chebyshev(from, to);
    return d === 1;
  }

  function inBounds(pos) {
    return pos.row >= 0 && pos.row < GRID_ROWS && pos.col >= 0 && pos.col < GRID_COLS;
  }

  // 대륙 타일 (육지/산/한국) 지도: 실제 지리 감각을 흉내 낸 단순화된 배치
  // 10x6: col 0=동태평양(아메리카), col 4~5=인도네시아/호주, col 7~9=동아시아
  function tileTypeAt(row, col) {
    if (row === KOREA.row && col === KOREA.col) return 'korea';
    if (row === START_POINTS.A.row && col === START_POINTS.A.col) return 'startA';
    if (row === START_POINTS.B.row && col === START_POINTS.B.col) return 'startB';
    // 육지 근사
    if (row === 0 && (col === 0 || col === 9)) return 'land';    // 북미/북아시아
    if (row === 1 && col === 0) return 'mountain';               // 로키/안데스
    if (row === 4 && col === 5) return 'land';                    // 호주
    if (row === 3 && col === 5) return 'land';                    // 인도네시아
    if (row === 1 && col === 9) return 'land';                    // 동북아시아
    return 'ocean';
  }

  // 위도대 (row 기반, 북반구 0~2, 적도 2, 남반구 3~5 근사)
  function latitudeBandOf(row) {
    if (row <= 1) return '북반구 중위도';
    if (row === 2) return '적도';
    if (row === 3) return '남반구 열대';
    return '남반구 중위도';
  }

  // ===== 핵심: 화살표 방향 타당성 평가 (규칙 기반, LLM 교체 지점) =====
  //
  // 과학적 배경 (교육과정 [12지구01-02], [12지구01-05] 성취기준):
  // 1) 엘니뇨: 동태평양 수온 상승 → 대류 중심 동쪽 이동 → 해양 저기압/육상 고기압 재배치.
  //    동태평양 상공의 하강 기류 약화, 무역풍 약화 → 대기 순환이 "동쪽으로" 순환 완성.
  // 2) 라니냬: 동태평양 수온 하강 → 서태평양 대류 강화 → 무역풍 강화 → 서쪽으로 순환.
  //
  // 학생 입력: 관측 데이터 (기압, 수온, 해수면 높이)
  // 학생 조작: 다음 이동 방향 (8방향)
  //
  // 평가 로직:
  // - 수온/기압/해수면 높이가 지시하는 시나리오 식별 (elnino/lanina/neutral)
  // - 시나리오가 elnino면 동쪽(E/NE/SE) 이동이 타당, lanina면 서쪽(W/NW/SW) 이동이 타당
  // - 중립이면 북쪽(N/NE/NW) 이동(한국 향해 진행)만 타당
  // - 시나리오와 반대 방향이면 실패 (개념 피드백 제공)

  function classifyObservation(obs) {
    // obs: { pressure, sst, ssh }
    var score = 0;
    if (obs.sst >= 28) score += 1;        // 동태평양 수온 높음 → 엘니뇨
    else if (obs.sst <= 24) score -= 1;   // 동태평양 수온 낮음 → 라니냬

    if (obs.pressure <= 1008) score += 1;  // 저기압 → 대류 중심 → 엘니뇨
    else if (obs.pressure >= 1015) score -= 1; // 고기압 → 라니냬

    if (obs.ssh >= 10) score += 1;        // 해수면 높이 상승 → 동쪽 워치 스택 붕괴 → 엘니뇨
    else if (obs.ssh <= -10) score -= 1;  // 해수면 낮아짐 → 라니냬

    if (score >= 2) return 'elnino';
    if (score <= -2) return 'lanina';
    return 'neutral';
  }

  function validDirectionsForScenario(scenario) {
    if (scenario === 'elnino') return ['E', 'NE', 'SE'];
    if (scenario === 'lanina') return ['W', 'NW', 'SW'];
    return ['N', 'NE', 'NW'];
  }

  function oppositeDirections(valid) {
    var opp = { E: 'W', W: 'E', N: 'S', S: 'N', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' };
    return DIRECTIONS.filter(function (d) { return valid.indexOf(opp[d.key]) !== -1; })
      .map(function (d) { return d.key; });
  }

  // 규칙 기반 타당성 평가. LLM 피드백으로 교체 가능하도록 순수 함수 + JSON 결과.
  function evaluateArrow(obs, dirKey) {
    var scenario = classifyObservation(obs);
    var valid = validDirectionsForScenario(scenario);
    var dir = DIRECTIONS.find(function (d) { return d.key === dirKey; });
    if (!dir) return { valid: false, scenario: scenario, reason: 'invalid_dir' };

    var ok = valid.indexOf(dirKey) !== -1;
    var feedback;
    if (ok) {
      feedback = {
        title: '타당합니다',
        body: '관측 데이터(수온 ' + obs.sst + '°C, 기압 ' + obs.pressure + 'hPa, 해수면 높이 ' +
          (obs.ssh > 0 ? '+' : '') + obs.ssh + 'cm)가 가리키는 대기·해양 상태는 \'' +
          CLIMATE_PRESETS[scenario].label + '\'입니다. 이 상태에서 대기 순환의 이동 방향은 \'' +
          dir.label + '\' 방향이 교육과정 개념(무역풍, 해수 순환, 기압 배치)과 일치합니다.',
      };
    } else {
      var opposite = oppositeDirections(valid);
      var isOpposite = opposite.indexOf(dirKey) !== -1;
      feedback = {
        title: isOpposite ? '방향이 반대입니다' : '근거가 부족합니다',
        body: '관측 데이터는 \'' + CLIMATE_PRESETS[scenario].label + '\' 상태를 가리킵니다. 이 경우 대기 순환은 ' +
          (scenario === 'elnino' ? '동쪽(워커 순환의 약화와 동진)' : scenario === 'lanina' ? '서쪽(강화된 무역풍을 따라)' : '한국을 향한 북쪽') +
          '으로 이동하는 것이 타당합니다. \'' + dir.label + '\' 방향은 ' +
          (isOpposite ? '순환 방향과 정반대입니다. 기압 경도력과 코리올리 효과를 다시 생각해 보세요.' :
            '이 시나리오의 순환 방향과 일치하지 않습니다. 수온·기압·해수면 높이가 방향을 어떻게 결정하는지 다시 확인하세요.') +
          ' 실패한 이유를 학습지에 기록하세요.',
      };
    }
    return { valid: ok, scenario: scenario, feedback: feedback };
  }

  // 기후 예측 데이터 (다음 타일 C의 평년 대비 변화)
  function forecastNextTile(scenario, turn, pos) {
    var preset = CLIMATE_PRESETS[scenario];
    var band = latitudeBandOf(pos.row);
    // 턴이 진행될수록(한국에 가까울수록) 영향 증폭
    var ramp = 1 + 0.15 * turn;
    var noise = function (base) { return base * ramp; };
    return {
      pressureAnomaly: +(noise(preset.pressure)).toFixed(1),
      tempAnomaly: +(noise(preset.temp)).toFixed(2),
      precipAnomaly: Math.round(noise(preset.precip)),
      band: band,
      scenario: scenario,
    };
  }

  // 도달 여부
  function reachedKorea(pos) {
    return pos.row === KOREA.row && pos.col === KOREA.col;
  }

  // ===== 게임 상태 =====
  function newGame(startKey) {
    var start = START_POINTS[startKey] || START_POINTS.A;
    return {
      startKey: startKey || 'A',
      pos: { row: start.row, col: start.col },
      turn: 0,
      score: 0,
      badges: [],
      path: [{ row: start.row, col: start.col }],
      pressureMarks: [],
      observations: [],
      failures: [],
      hypotheses: '',
      log: [],
      status: 'playing', // playing | won
    };
  }

  function tryMove(state, obs, dirKey) {
    var dir = DIRECTIONS.find(function (d) { return d.key === dirKey; });
    if (!dir) return { ok: false, error: 'invalid_dir' };
    if (state.status !== 'playing') return { ok: false, error: 'game_over' };

    var target = { row: state.pos.row + dir.dr, col: state.pos.col + dir.dc };
    if (!inBounds(target)) return { ok: false, error: 'out_of_bounds' };

    var evalRes = evaluateArrow(obs, dirKey);
    var entry = {
      turn: state.turn,
      obs: obs,
      dir: dirKey,
      valid: evalRes.valid,
      scenario: evalRes.scenario,
      feedback: evalRes.feedback,
      at: { row: state.pos.row, col: state.pos.col },
    };
    state.observations.push(entry);

    if (!evalRes.valid) {
      state.failures.push({
        turn: state.turn,
        dir: dirKey,
        reason: evalRes.feedback.title,
        lesson: evalRes.feedback.body,
      });
      state.turn += 1;
      state.score = Math.max(0, state.score - 1);
      state.log.push({
        turn: state.turn, type: 'fail', dir: dirKey,
        msg: evalRes.feedback.title,
      });
      return { ok: false, error: 'invalid_move', evaluation: evalRes };
    }

    // 이동 성공
    state.pos = target;
    state.turn += 1;
    state.score += 10;
    state.path.push({ row: target.row, col: target.col });

    var scenario = evalRes.scenario;
    var forecast = forecastNextTile(scenario, state.turn, target);
    state.pressureMarks.push({
      row: target.row, col: target.col,
      color: forecast.pressureAnomaly > 0 ? 'red' : forecast.pressureAnomaly < 0 ? 'blue' : 'gray',
      value: forecast.pressureAnomaly,
    });
    state.log.push({
      turn: state.turn, type: 'move', dir: dirKey,
      to: target, forecast: forecast, scenario: scenario,
    });

    if (reachedKorea(target)) {
      state.status = 'won';
      state.score += 50;
      state.badges.push('한반도 도달');
      state.finalImpact = finalImpact(state);
    } else if (state.turn >= 20) {
      state.badges.push('탐구왕');
    }
    if (state.failures.length === 0 && state.status === 'won') {
      state.badges.push('무실패 예측');
    }
    return { ok: true, evaluation: evalRes, forecast: forecast, state: state };
  }

  function finalImpact(state) {
    var scen = state.observations.length ?
      state.observations[state.observations.length - 1].scenario : 'neutral';
    return forecastNextTile(scen, state.turn, KOREA);
  }

  var core = {
    GRID_COLS: GRID_COLS,
    GRID_ROWS: GRID_ROWS,
    KOREA: KOREA,
    START_POINTS: START_POINTS,
    DIRECTIONS: DIRECTIONS,
    TILE_TYPES: TILE_TYPES,
    CLIMATE_PRESETS: CLIMATE_PRESETS,
    OBS_RANGES: OBS_RANGES,
    classifyObservation: classifyObservation,
    evaluateArrow: evaluateArrow,
    validDirectionsForScenario: validDirectionsForScenario,
    forecastNextTile: forecastNextTile,
    tileTypeAt: tileTypeAt,
    latitudeBandOf: latitudeBandOf,
    newGame: newGame,
    tryMove: tryMove,
    finalImpact: finalImpact,
    reachedKorea: reachedKorea,
    isAdjacent: isAdjacent,
    inBounds: inBounds,
    dirFromDelta: dirFromDelta,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  global.ClimateCore = core;
})(typeof window !== 'undefined' ? window : globalThis);
