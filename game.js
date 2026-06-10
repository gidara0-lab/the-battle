"use strict";

const ROW_COUNTS = [5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5];
const MAX_STONES = 36;
const RED = "R";
const BLUE = "B";
const EMPTY = null;
const INF = 1_000_000_000;
const DRAW = "D";
const GAME_TIME_MS = 10 * 60 * 1000;
const FIRST_PLAYERS = [RED, BLUE];
const MAX_SEARCH_BRANCH = 38;

const boardEl = document.getElementById("board");
const messageEl = document.getElementById("message");
const turnLabelEl = document.getElementById("turnLabel");
const turnPlayerEl = document.getElementById("turnPlayer");
const redCountEl = document.getElementById("redCount");
const blueCountEl = document.getElementById("blueCount");
const roundLabelEl = document.getElementById("roundLabel");
const gameLabelEl = document.getElementById("gameLabel");
const firstPlayerLabelEl = document.getElementById("firstPlayerLabel");
const redTimerEl = document.getElementById("redTimer");
const blueTimerEl = document.getElementById("blueTimer");
const redClockCardEl = document.getElementById("redClockCard");
const blueClockCardEl = document.getElementById("blueClockCard");
const mobileGameLabelEl = document.getElementById("mobileGameLabel");
const mobileFirstPlayerLabelEl = document.getElementById("mobileFirstPlayerLabel");
const mobileRedTimerEl = document.getElementById("mobileRedTimer");
const mobileBlueTimerEl = document.getElementById("mobileBlueTimer");
const mobileRedClockCardEl = document.getElementById("mobileRedClockCard");
const mobileBlueClockCardEl = document.getElementById("mobileBlueClockCard");
const logEl = document.getElementById("log");
const newGameBtn = document.getElementById("newGame");
const nextGameBtn = document.getElementById("nextGame");
const playBlueBtn = document.getElementById("playBlue");
const playRedBtn = document.getElementById("playRed");

const cells = [];
const cellByKey = new Map();
const buttons = [];
let lineIdsCache = null;
const directions = [
  [0, 1],
  [1, 0],
  [1, 1],
];

let state;
let humanColor = BLUE;
let aiColor = RED;
let pendingCapture = null;
let aiTimer = null;
let clockTimer = null;
let lastTickAt = null;
let round = {
  number: 1,
  gameIndex: 0,
  score: { [RED]: 0, [BLUE]: 0, [DRAW]: 0 },
};

function setupGeometry() {
  ROW_COUNTS.forEach((count, row) => {
    for (let col = 0; col < count; col += 1) {
      const id = cells.length;
      const cell = { id, row, col };
      cells.push(cell);
      cellByKey.set(`${row}:${col}`, id);
    }
  });
  lineIdsCache = null;
}

function makeInitialState(firstPlayer = RED) {
  return {
    board: Array(cells.length).fill(EMPTY),
    current: firstPlayer,
    firstPlayer,
    remaining: { [RED]: MAX_STONES, [BLUE]: MAX_STONES },
    forbidden: { [RED]: null, [BLUE]: null },
    timeLeft: { [RED]: GAME_TIME_MS, [BLUE]: GAME_TIME_MS },
    winner: null,
    resultRecorded: false,
    lastMove: null,
    winningLine: [],
    log: [],
    moveNumber: 1,
    turnCount: 0,
  };
}

function renderBoardShell() {
  boardEl.innerHTML = "";
  ROW_COUNTS.forEach((count, row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "board-row";
    for (let col = 0; col < count; col += 1) {
      const id = cellByKey.get(`${row}:${col}`);
      const button = document.createElement("button");
      button.className = "cell";
      button.type = "button";
      button.dataset.id = String(id);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `${row + 1}행 ${col + 1}열`);
      button.addEventListener("click", () => handleCellClick(id));
      buttons[id] = button;
      rowEl.appendChild(button);
    }
    boardEl.appendChild(rowEl);
  });
}

function render() {
  buttons.forEach((button, id) => {
    const value = state.board[id];
    button.className = "cell";
    button.disabled = Boolean(state.winner);
    if (value === RED) button.classList.add("red");
    if (value === BLUE) button.classList.add("blue");
    if (state.forbidden[state.current] === id) button.classList.add("forbidden");
    if (state.lastMove === id) button.classList.add("last-move");
    if (state.winningLine.includes(id)) button.classList.add("win");
    if (pendingCapture?.choices.includes(id)) {
      button.classList.add("capture-choice");
      button.disabled = false;
    }
  });

  redCountEl.textContent = String(state.remaining[RED]);
  blueCountEl.textContent = String(state.remaining[BLUE]);
  roundLabelEl.textContent = String(round.number);
  gameLabelEl.textContent = `${round.gameIndex + 1} / 2`;
  firstPlayerLabelEl.textContent = labelOf(state.firstPlayer);
  mobileGameLabelEl.textContent = `${round.gameIndex + 1} / 2`;
  mobileFirstPlayerLabelEl.textContent = labelOf(state.firstPlayer);
  redTimerEl.textContent = formatTime(state.timeLeft[RED]);
  blueTimerEl.textContent = formatTime(state.timeLeft[BLUE]);
  mobileRedTimerEl.textContent = formatTime(state.timeLeft[RED]);
  mobileBlueTimerEl.textContent = formatTime(state.timeLeft[BLUE]);
  redClockCardEl.classList.toggle("active", state.current === RED && !state.winner);
  blueClockCardEl.classList.toggle("active", state.current === BLUE && !state.winner);
  mobileRedClockCardEl.classList.toggle("active", state.current === RED && !state.winner);
  mobileBlueClockCardEl.classList.toggle("active", state.current === BLUE && !state.winner);
  redClockCardEl.classList.toggle("low", state.timeLeft[RED] <= 60_000);
  blueClockCardEl.classList.toggle("low", state.timeLeft[BLUE] <= 60_000);
  mobileRedClockCardEl.classList.toggle("low", state.timeLeft[RED] <= 60_000);
  mobileBlueClockCardEl.classList.toggle("low", state.timeLeft[BLUE] <= 60_000);
  nextGameBtn.hidden = !(state.winner && round.gameIndex === 0);
  playRedBtn.disabled = !state.winner && state.turnCount > 0;
  playBlueBtn.disabled = !state.winner && state.turnCount > 0;

  if (state.winner) {
    turnLabelEl.textContent = "게임 종료";
    turnPlayerEl.textContent = state.winner === DRAW ? "무승부" : `${labelOf(state.winner)} 승리`;
  } else if (pendingCapture) {
    turnLabelEl.textContent = "샌드위치";
    turnPlayerEl.textContent = "제거 선택";
  } else {
    turnLabelEl.textContent = state.current === humanColor ? "내 차례" : "AI 차례";
    turnPlayerEl.textContent = labelOf(state.current);
  }

  logEl.innerHTML = "";
  state.log.slice(-12).forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry;
    logEl.appendChild(li);
  });
  logEl.scrollTop = logEl.scrollHeight;
}

function labelOf(color) {
  if (color === DRAW) return "무승부";
  return color === RED ? "레드" : "블루";
}

function formatTime(ms) {
  const safeMs = Math.max(0, Math.ceil(ms / 1000) * 1000);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function opponentOf(color) {
  return color === RED ? BLUE : RED;
}

function idAt(row, col) {
  return cellByKey.get(`${row}:${col}`) ?? null;
}

function step(id, dir, sign = 1) {
  const cell = cells[id];
  if (dir[0] === 0) {
    return idAt(cell.row, cell.col + sign);
  }

  const nextRow = cell.row + sign;
  const currentCount = ROW_COUNTS[cell.row];
  const nextCount = ROW_COUNTS[nextRow];
  if (!nextCount) return null;

  const nextRowIsWider = nextCount > currentCount;
  const isRightDiagonal = dir[1] === 1;
  let nextCol = cell.col;

  if (sign > 0) {
    if (isRightDiagonal && nextRowIsWider) nextCol += 1;
    if (!isRightDiagonal && !nextRowIsWider) nextCol -= 1;
  } else {
    if (isRightDiagonal && !nextRowIsWider) nextCol -= 1;
    if (!isRightDiagonal && nextRowIsWider) nextCol += 1;
  }

  return idAt(nextRow, nextCol);
}

function collectLine(board, startId, color, dir) {
  const line = [startId];

  for (const sign of [-1, 1]) {
    let cursor = startId;
    while (true) {
      const next = step(cursor, dir, sign);
      if (next === null || board[next] !== color) break;
      if (sign < 0) line.unshift(next);
      else line.push(next);
      cursor = next;
    }
  }

  return line;
}

function winningLineFrom(board, startId, color) {
  for (const dir of directions) {
    const line = collectLine(board, startId, color, dir);
    if (line.length >= 5) return line;
  }
  return [];
}

function detectSandwiches(board, startId, color) {
  const opponent = opponentOf(color);
  const found = [];
  const keys = new Set();

  for (const dir of directions) {
    for (const sign of [-1, 1]) {
      const one = step(startId, dir, sign);
      const two = one === null ? null : step(one, dir, sign);
      const three = two === null ? null : step(two, dir, sign);
      if (
        one !== null &&
        two !== null &&
        three !== null &&
        board[one] === opponent &&
        board[two] === opponent &&
        board[three] === color
      ) {
        const pair = [one, two].sort((a, b) => a - b);
        const key = pair.join(":");
        if (!keys.has(key)) {
          keys.add(key);
          found.push({ pair });
        }
      }
    }
  }

  return found;
}

function handleCellClick(id) {
  if (state.winner) return;

  if (pendingCapture) {
    if (pendingCapture.choices.includes(id)) {
      finishCapture(id);
    }
    return;
  }

  if (state.current !== humanColor) return;
  const result = placeStone(id, humanColor, { interactive: true });
  if (result) render();
}

function placeStone(id, color, options = {}) {
  if (!isLegalMove(state, id, color)) {
    if (options.interactive) {
      messageEl.textContent =
        state.forbidden[color] === id
          ? "직전에 제거된 칸은 이번 차례에 바로 사용할 수 없습니다."
          : "돌을 놓을 수 없는 칸입니다.";
    }
    return false;
  }

  state.board[id] = color;
  state.remaining[color] -= 1;
  state.forbidden[color] = null;
  state.lastMove = id;
  state.log.push(`${state.moveNumber}. ${labelOf(color)}: ${coordLabel(id)}`);

  const win = winningLineFrom(state.board, id, color);
  if (win.length) {
    state.winningLine = win;
    finishGame(color, `${labelOf(color)}가 돌 5개를 빈칸 없이 연결했습니다.`);
    return true;
  }

  const sandwiches = detectSandwiches(state.board, id, color);
  if (sandwiches.length) {
    const choices = captureChoicesFromSandwiches(sandwiches);
    if (sandwiches.length > 1) {
      state.log.push("더블 샌드위치: 잡힌 돌 중 하나를 선택합니다.");
    }

    if (color === humanColor) {
      pendingCapture = {
        color,
        victimColor: opponentOf(color),
        choices,
      };
      messageEl.textContent =
        sandwiches.length > 1
          ? "더블 샌드위치 성공. 강조된 상대 돌 중 하나를 제거하세요."
          : "샌드위치 성공. 강조된 상대 돌 중 하나를 제거하세요.";
      render();
      return true;
    }

    const captureId = chooseAiCapture(choices, opponentOf(color));
    applyCapture(captureId, color);
    endTurn();
    return true;
  }

  endTurn();
  return true;
}

function finishCapture(id) {
  applyCapture(id, pendingCapture.color);
  pendingCapture = null;
  endTurn();
  render();
}

function applyCapture(id, color) {
  const victim = opponentOf(color);
  state.board[id] = EMPTY;
  state.remaining[victim] += 1;
  state.forbidden[victim] = id;
  state.log.push(`${labelOf(color)} 샌드위치: ${coordLabel(id)} 제거`);
  messageEl.textContent = `${labelOf(color)}가 샌드위치로 돌 하나를 제거했습니다.`;
}

function captureChoicesFromSandwiches(sandwiches) {
  return [...new Set(sandwiches.flatMap((sandwich) => sandwich.pair))];
}

function finishGame(winner, message) {
  if (state.winner) return;
  state.winner = winner;
  stopClock();
  window.clearTimeout(aiTimer);
  recordGameResult(winner);
  messageEl.textContent = `${message} ${roundStatusText()}`;
  render();
}

function recordGameResult(winner) {
  if (state.resultRecorded) return;
  state.resultRecorded = true;
  round.score[winner] += 1;
  const resultText = winner === DRAW ? "무승부" : `${labelOf(winner)} 승리`;
  state.log.push(`${round.gameIndex + 1}게임 종료: ${resultText}`);
}

function roundStatusText() {
  if (round.gameIndex === 0) {
    return "2게임을 시작할 수 있습니다.";
  }

  const red = round.score[RED];
  const blue = round.score[BLUE];
  const draws = round.score[DRAW];
  if (red === blue) return `라운드 결과: ${red}-${blue}, 무승부 ${draws}.`;
  const winner = red > blue ? RED : BLUE;
  return `라운드 결과: ${labelOf(winner)} 우세 ${red}-${blue}, 무승부 ${draws}.`;
}

function startClock() {
  stopClock();
  lastTickAt = performance.now();
  clockTimer = window.setInterval(tickClock, 250);
}

function stopClock() {
  if (clockTimer !== null) {
    window.clearInterval(clockTimer);
    clockTimer = null;
  }
  lastTickAt = null;
}

function tickClock() {
  if (!state || state.winner) {
    stopClock();
    return;
  }

  const now = performance.now();
  const elapsed = lastTickAt === null ? 0 : now - lastTickAt;
  lastTickAt = now;
  state.timeLeft[state.current] = Math.max(0, state.timeLeft[state.current] - elapsed);

  if (state.timeLeft[state.current] <= 0) {
    const loser = state.current;
    finishGame(opponentOf(loser), `${labelOf(loser)}의 시간이 모두 소진되었습니다.`);
    return;
  }

  render();
}

function endTurn() {
  if (isBoardFull()) {
    finishGame(DRAW, "더 놓을 수 있는 칸이 없어 무승부입니다.");
    return;
  }

  state.current = opponentOf(state.current);
  state.turnCount += 1;
  state.moveNumber = Math.floor(state.turnCount / 2) + 1;
  render();

  if (state.current === aiColor && !state.winner) {
    queueAiMove();
  } else if (!state.winner) {
    const blocked = state.forbidden[state.current];
    messageEl.textContent =
      blocked === null
        ? `${labelOf(state.current)} 차례입니다.`
        : `${labelOf(state.current)} 차례입니다. ${coordLabel(blocked)}에는 바로 둘 수 없습니다.`;
  }
}

function isLegalMove(targetState, id, color) {
  return (
    id !== null &&
    targetState.board[id] === EMPTY &&
    targetState.remaining[color] > 0 &&
    targetState.forbidden[color] !== id
  );
}

function isBoardFull() {
  return state.board.every(Boolean);
}

function queueAiMove() {
  window.clearTimeout(aiTimer);
  messageEl.textContent = "AI가 어려움 난이도로 수를 계산하고 있습니다.";
  aiTimer = window.setTimeout(() => {
    const move = findBestMove(state, aiColor);
    if (move === null) {
      finishGame(DRAW, "AI가 둘 수 있는 칸이 없어 무승부입니다.");
      return;
    }
    placeStone(move, aiColor);
    render();
  }, 420);
}

function coordLabel(id) {
  const cell = cells[id];
  return `${cell.row + 1}-${cell.col + 1}`;
}

function startNewRound() {
  resetRound(round.number + 1);
}

function restartCurrentRound() {
  resetRound(round.number);
}

function resetRound(roundNumber) {
  round = {
    number: roundNumber,
    gameIndex: 0,
    score: { [RED]: 0, [BLUE]: 0, [DRAW]: 0 },
  };
  startRoundGame(0);
}

function startNextGame() {
  if (!state?.winner || round.gameIndex !== 0) return;
  round.gameIndex = 1;
  startRoundGame(1);
}

function startRoundGame(gameIndex) {
  window.clearTimeout(aiTimer);
  stopClock();
  pendingCapture = null;
  aiColor = opponentOf(humanColor);
  const firstPlayer = FIRST_PLAYERS[gameIndex];
  state = makeInitialState(firstPlayer);
  state.log.push(`${round.number}라운드 ${gameIndex + 1}게임: ${labelOf(firstPlayer)} 선공`);
  messageEl.textContent = `${labelOf(firstPlayer)} 선공입니다. 각 선수 시간은 10분입니다.`;
  render();
  startClock();
  if (state.current === aiColor) queueAiMove();
}

function setHumanColor(color) {
  humanColor = color;
  playRedBtn.classList.toggle("active", color === RED);
  playBlueBtn.classList.toggle("active", color === BLUE);
  restartCurrentRound();
}

function cloneState(input) {
  return {
    board: input.board.slice(),
    current: input.current,
    firstPlayer: input.firstPlayer,
    remaining: { [RED]: input.remaining[RED], [BLUE]: input.remaining[BLUE] },
    forbidden: { [RED]: input.forbidden[RED], [BLUE]: input.forbidden[BLUE] },
    turnCount: input.turnCount,
  };
}

function legalMovesFor(input, color) {
  const candidates = candidateMoves(input.board);
  return candidates.filter((id) => isLegalMove(input, id, color));
}

function candidateMoves(board) {
  const occupied = [];
  board.forEach((value, id) => {
    if (value) occupied.push(id);
  });

  if (!occupied.length) {
    return centerCells();
  }

  const result = new Set();
  for (const id of occupied) {
    result.add(id);
    let frontier = new Set([id]);
    for (let depth = 0; depth < 2; depth += 1) {
      const nextFrontier = new Set();
      for (const item of frontier) {
        for (const dir of directions) {
          for (const sign of [-1, 1]) {
            const next = step(item, dir, sign);
            if (next !== null && !result.has(next)) {
              result.add(next);
              nextFrontier.add(next);
            }
          }
        }
      }
      frontier = nextFrontier;
    }
  }

  return [...result].filter((id) => board[id] === EMPTY);
}

function findBestMove(input, color) {
  const legalMoves = legalMovesFor(input, color);
  const tacticalMove = findTacticalMove(input, legalMoves, color);
  if (tacticalMove !== null) return tacticalMove;

  const openingMove = chooseOpeningMove(input, legalMoves, color);
  if (openingMove !== null) return openingMove;

  const moves = orderMoves(legalMoves, input, color);
  if (!moves.length) return null;

  const depth = searchDepthFor(moves.length, input.turnCount);
  let bestMove = moves[0];
  let bestScore = -INF;
  let alpha = -INF;

  for (const move of moves.slice(0, MAX_SEARCH_BRANCH)) {
    const next = simulateMove(input, move, color);
    const score = minimax(next, depth - 1, opponentOf(color), color, alpha, INF);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    alpha = Math.max(alpha, bestScore);
  }

  if (input.turnCount <= 5 && bestScore < 90_000) {
    const variedMoves = moves
      .slice(0, 10)
      .filter((move) => quickMoveScore(input, move, color) >= quickMoveScore(input, bestMove, color) - 2_800);
    if (variedMoves.length > 1) return randomItem(variedMoves);
  }

  return bestMove;
}

function findTacticalMove(input, legalMoves, color) {
  if (!legalMoves.length) return null;
  const opponent = opponentOf(color);

  const winningMove = legalMoves.find((id) => moveCreatesWin(input.board, id, color));
  if (winningMove !== undefined) return winningMove;

  const opponentWinningMoves = legalMoves.filter((id) => moveCreatesWin(input.board, id, opponent));
  if (opponentWinningMoves.length) {
    return orderMoves(opponentWinningMoves, input, color)[0];
  }

  const forkMove = legalMoves
    .map((id) => ({ id, threats: countWinningThreatsAfterMove(input, id, color) }))
    .filter((item) => item.threats >= 2)
    .sort((a, b) => b.threats - a.threats || quickMoveScore(input, b.id, color) - quickMoveScore(input, a.id, color))[0];
  if (forkMove) return forkMove.id;

  const opponentFork = legalMoves
    .map((id) => ({ id, threats: countWinningThreatsAfterMove(input, id, opponent) }))
    .filter((item) => item.threats >= 2)
    .sort((a, b) => b.threats - a.threats || quickMoveScore(input, b.id, color) - quickMoveScore(input, a.id, color))[0];
  if (opponentFork && input.turnCount > 5) return opponentFork.id;

  const urgentThreatBlock = bestUrgentThreatBlock(input, legalMoves, color);
  if (urgentThreatBlock !== null) return urgentThreatBlock;

  const strongCapture = legalMoves
    .map((id) => {
      const board = input.board.slice();
      board[id] = color;
      const sandwiches = detectSandwiches(board, id, color);
      return {
        id,
        captures: captureChoicesFromSandwiches(sandwiches).length,
        groups: sandwiches.length,
      };
    })
    .filter((item) => item.captures > 0)
    .sort((a, b) => b.groups - a.groups || b.captures - a.captures || quickMoveScore(input, b.id, color) - quickMoveScore(input, a.id, color))[0];

  return strongCapture && (input.turnCount > 6 || strongCapture.groups > 1) ? strongCapture.id : null;
}

function bestUrgentThreatBlock(input, legalMoves, color) {
  const opponent = opponentOf(color);
  const threats = legalMoves
    .map((id) => {
      const board = input.board.slice();
      board[id] = opponent;
      return {
        id,
        score: localThreatScore(board, id, opponent) + boardWindowScore(board, opponent) * 0.22,
      };
    })
    .filter((item) => item.score >= 65_000)
    .sort((a, b) => b.score - a.score);

  if (!threats.length) return null;
  return orderMoves(threats.map((item) => item.id), input, color)[0];
}

function countWinningThreatsAfterMove(input, id, color) {
  if (!isLegalMove(input, id, color)) return 0;
  const next = simulateMove(input, id, color);
  return legalMovesFor(next, color).filter((move) => moveCreatesWin(next.board, move, color)).length;
}

function moveCreatesWin(board, id, color) {
  if (board[id] !== EMPTY) return false;
  const next = board.slice();
  next[id] = color;
  return winningLineFrom(next, id, color).length >= 5;
}

function searchDepthFor(moveCount, turnCount) {
  if (moveCount <= 14) return 4;
  if (moveCount <= 32) return 3;
  if (turnCount >= 10 && moveCount <= 46) return 3;
  return 2;
}

function chooseOpeningMove(input, legalMoves, color) {
  if (!legalMoves.length) return null;

  if (!input.board.some(Boolean)) {
    const candidates = centerCells().filter((id) => legalMoves.includes(id));
    if (!candidates.length) return null;
    return randomItem(candidates);
  }

  if (input.turnCount > 5) return null;
  if (hasImmediateTacticalMove(input, color, legalMoves)) return null;

  const moves = orderMoves(legalMoves, input, color);
  const bestQuickScore = quickMoveScore(input, moves[0], color);
  const candidates = moves
    .filter((id) => openingCells().includes(id))
    .filter((id) => quickMoveScore(input, id, color) >= bestQuickScore - 3_200)
    .slice(0, 8);
  if (!candidates.length) return null;
  return randomItem(candidates);
}

function hasImmediateTacticalMove(input, color, legalMoves) {
  const opponent = opponentOf(color);
  return legalMoves.some((id) => {
    const board = input.board.slice();
    board[id] = color;
    if (winningLineFrom(board, id, color).length >= 5) return true;
    board[id] = opponent;
    return winningLineFrom(board, id, opponent).length >= 5;
  });
}

function centerCells() {
  const middleRow = Math.floor(ROW_COUNTS.length / 2);
  const count = ROW_COUNTS[middleRow];
  return [idAt(middleRow, Math.floor(count / 2)), idAt(middleRow, Math.floor(count / 2) - 1)].filter(
    (id) => id !== null,
  );
}

function openingCells() {
  return [
    idAt(5, 4),
    idAt(5, 5),
    idAt(4, 4),
    idAt(6, 4),
    idAt(4, 3),
    idAt(6, 5),
    idAt(5, 3),
    idAt(5, 6),
  ].filter((id) => id !== null);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function minimax(input, depth, turn, maximizer, alpha, beta) {
  const terminal = terminalScore(input, maximizer);
  if (terminal !== null) return terminal;
  if (depth === 0) return evaluateState(input, maximizer);

  const moves = orderMoves(legalMovesFor(input, turn), input, turn);
  if (!moves.length) return evaluateState(input, maximizer);

  if (turn === maximizer) {
    let value = -INF;
    for (const move of moves.slice(0, MAX_SEARCH_BRANCH)) {
      value = Math.max(value, minimax(simulateMove(input, move, turn), depth - 1, opponentOf(turn), maximizer, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = INF;
  for (const move of moves.slice(0, MAX_SEARCH_BRANCH)) {
    value = Math.min(value, minimax(simulateMove(input, move, turn), depth - 1, opponentOf(turn), maximizer, alpha, beta));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function simulateMove(input, id, color) {
  const next = cloneState(input);
  next.board[id] = color;
  next.remaining[color] -= 1;
  next.forbidden[color] = null;
  next.turnCount += 1;

  const sandwiches = detectSandwiches(next.board, id, color);
  if (sandwiches.length) {
    const victim = opponentOf(color);
    const capture = chooseBestSimCapture(next.board, captureChoicesFromSandwiches(sandwiches), victim, color);
    next.board[capture] = EMPTY;
    next.remaining[victim] += 1;
    next.forbidden[victim] = capture;
  }

  return next;
}

function terminalScore(input, maximizer) {
  let maxWin = false;
  let minWin = false;
  input.board.forEach((value, id) => {
    if (!value) return;
    const win = winningLineFrom(input.board, id, value).length >= 5;
    if (win && value === maximizer) maxWin = true;
    if (win && value !== maximizer) minWin = true;
  });
  if (maxWin) return INF - 10_000;
  if (minWin) return -INF + 10_000;
  return null;
}

function orderMoves(moves, input, color) {
  return moves
    .map((id) => ({ id, score: quickMoveScore(input, id, color) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.id);
}

function quickMoveScore(input, id, color) {
  const board = input.board.slice();
  board[id] = color;
  const opponent = opponentOf(color);
  let score = 0;

  if (winningLineFrom(board, id, color).length >= 5) score += 100_000;

  board[id] = opponent;
  if (winningLineFrom(board, id, opponent).length >= 5) score += 92_000;
  board[id] = color;

  score += longestFrom(board, id, color) * 500;
  score += localThreatScore(board, id, color) * 1.25;
  score += boardWindowScore(board, color) * 0.16;

  board[id] = opponent;
  score += localThreatScore(board, id, opponent) * 1.1;
  score += boardWindowScore(board, opponent) * 0.18;
  board[id] = color;
  score += moveDeniesOpponentThreat(input, id, color) * 6_500;

  const sandwiches = detectSandwiches(board, id, color);
  score += sandwiches.length * 2_300;
  score += captureChoicesFromSandwiches(sandwiches).length * 650;
  score += countWinningThreatsAfterMove(input, id, color) * 18_000;

  const cell = cells[id];
  const center = { row: 5, col: 4.5 };
  score -= Math.abs(cell.row - center.row) * 12 + Math.abs(cell.col - center.col) * 8;
  return score;
}

function moveDeniesOpponentThreat(input, id, color) {
  const opponent = opponentOf(color);
  const before = localPotentialAt(input.board, id, opponent);
  const after = input.board.slice();
  after[id] = color;
  return Math.max(0, before - localPotentialAt(after, id, opponent)) / 10_000;
}

function localPotentialAt(board, id, color) {
  if (board[id] !== EMPTY) return 0;
  const next = board.slice();
  next[id] = color;
  return localThreatScore(next, id, color);
}

function localThreatScore(board, id, color) {
  let score = 0;
  for (const dir of directions) {
    const line = collectLine(board, id, color, dir);
    const before = step(line[0], dir, -1);
    const after = step(line[line.length - 1], dir, 1);
    const openEnds = Number(before !== null && board[before] === EMPTY) + Number(after !== null && board[after] === EMPTY);
    score += lineScore(line.length, openEnds);
  }
  return score;
}

function boardWindowScore(board, color) {
  const opponent = opponentOf(color);
  let total = 0;

  for (const line of allLineIds()) {
    if (line.length < 5) continue;
    for (let start = 0; start <= line.length - 5; start += 1) {
      const windowIds = line.slice(start, start + 5);
      let own = 0;
      let blocked = false;
      for (const id of windowIds) {
        if (board[id] === opponent) {
          blocked = true;
          break;
        }
        if (board[id] === color) own += 1;
      }
      if (blocked || own === 0) continue;

      const before = line[start - 1];
      const after = line[start + 5];
      const openEnds = Number(before !== undefined && board[before] === EMPTY) + Number(after !== undefined && board[after] === EMPTY);
      total += windowScore(own, openEnds);
    }
  }

  return total;
}

function allLineIds() {
  if (lineIdsCache) return lineIdsCache;

  const lines = [];
  for (const dir of directions) {
    for (const cell of cells) {
      const previous = step(cell.id, dir, -1);
      if (previous !== null) continue;

      const line = [];
      let cursor = cell.id;
      while (cursor !== null) {
        line.push(cursor);
        cursor = step(cursor, dir, 1);
      }
      if (line.length >= 2) lines.push(line);
    }
  }
  lineIdsCache = lines;
  return lineIdsCache;
}

function windowScore(own, openEnds) {
  if (own >= 5) return INF / 3;
  if (own === 4) return openEnds === 2 ? 95_000 : 26_000;
  if (own === 3) return openEnds === 2 ? 8_800 : 1_900;
  if (own === 2) return openEnds === 2 ? 720 : 160;
  return openEnds === 2 ? 28 : 8;
}

function evaluateState(input, maximizer) {
  const opponent = opponentOf(maximizer);
  let score = evaluateColor(input.board, maximizer) - evaluateColor(input.board, opponent) * 1.08;
  score += boardWindowScore(input.board, maximizer) - boardWindowScore(input.board, opponent) * 1.12;
  score += (MAX_STONES - input.remaining[maximizer]) * 4;
  score -= (MAX_STONES - input.remaining[opponent]) * 4;
  if (input.forbidden[opponent] !== null) score += 45;
  if (input.forbidden[maximizer] !== null) score -= 45;
  return score;
}

function evaluateColor(board, color) {
  let total = 0;
  const counted = new Set();

  for (const dir of directions) {
    board.forEach((value, id) => {
      if (value !== color) return;
      const previous = step(id, dir, -1);
      if (previous !== null && board[previous] === color) return;

      const line = [];
      let cursor = id;
      while (cursor !== null && board[cursor] === color) {
        line.push(cursor);
        cursor = step(cursor, dir, 1);
      }

      const key = `${dir.join(",")}:${line.join(",")}`;
      if (counted.has(key)) return;
      counted.add(key);

      const before = step(line[0], dir, -1);
      const after = step(line[line.length - 1], dir, 1);
      const openEnds = Number(before !== null && board[before] === EMPTY) + Number(after !== null && board[after] === EMPTY);
      total += lineScore(line.length, openEnds);
    });
  }

  return total;
}

function lineScore(length, openEnds) {
  if (length >= 5) return INF / 2;
  if (length === 4) return openEnds === 2 ? 80_000 : 18_000;
  if (length === 3) return openEnds === 2 ? 4_200 : 820;
  if (length === 2) return openEnds === 2 ? 260 : 70;
  return openEnds ? 8 : 2;
}

function longestFrom(board, id, color) {
  return Math.max(...directions.map((dir) => collectLine(board, id, color, dir).length));
}

function chooseAiCapture(choices, victimColor) {
  return chooseBestSimCapture(state.board, choices, victimColor, aiColor);
}

function chooseBestSimCapture(board, choices, victimColor, capturer) {
  let best = choices[0];
  let bestScore = -INF;

  for (const id of choices) {
    const next = board.slice();
    next[id] = EMPTY;
    const score = evaluateColor(board, victimColor) - evaluateColor(next, victimColor) + evaluateColor(next, capturer) * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }

  return best;
}

setupGeometry();
renderBoardShell();
playBlueBtn.addEventListener("click", () => setHumanColor(BLUE));
playRedBtn.addEventListener("click", () => setHumanColor(RED));
newGameBtn.addEventListener("click", startNewRound);
nextGameBtn.addEventListener("click", startNextGame);
startRoundGame(0);
