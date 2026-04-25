const state = {
  screen: 'setup',
  giftA: { text: '' },
  giftB: { text: '' },
  bPos: { x: 0, y: 0 },
};

const $ = sel => document.querySelector(sel);

function bindSetup() {
  $('#textA').addEventListener('input', e => {
    state.giftA.text = e.target.value.trim();
    validateSetup();
  });
  $('#textB').addEventListener('input', e => {
    state.giftB.text = e.target.value.trim();
    validateSetup();
  });
  $('#startBtn').addEventListener('click', () => {
    $('#shareLink').value = buildShareUrl();
    showScreen('share');
  });
}

function buildShareUrl() {
  const params = new URLSearchParams();
  params.set('a', state.giftA.text);
  params.set('b', state.giftB.text);
  const base = location.href.split('?')[0].split('#')[0];
  return `${base}?${params.toString()}`;
}

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 1800);
}

function bindShare() {
  $('#shareBtn').addEventListener('click', async () => {
    const url = $('#shareLink').value;
    if (navigator.share) {
      try {
        await navigator.share({
          title: '선물 골라봐요 🎁',
          text: '받고 싶은 선물을 골라줘!',
          url,
        });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('링크가 복사되었어요!');
    } catch (e) {
      const input = $('#shareLink');
      input.select();
      input.setSelectionRange(0, 99999);
      document.execCommand('copy');
      showToast('링크가 복사되었어요!');
    }
  });

  $('#previewBtn').addEventListener('click', () => {
    showScreen('play');
    setupPlay();
  });

  $('#redoBtn').addEventListener('click', () => {
    showScreen('setup');
  });
}

function validateSetup() {
  const ok = state.giftA.text && state.giftB.text;
  $('#startBtn').disabled = !ok;
}

function showScreen(name) {
  ['setup', 'share', 'play', 'result'].forEach(n => {
    document.getElementById(n).hidden = (n !== name);
  });
  state.screen = name;
}

function setupPlay() {
  const cardA = $('#cardA');
  const cardB = $('#cardB');

  cardA.querySelector('.card-text').textContent = state.giftA.text;
  cardB.querySelector('.card-text').textContent = state.giftB.text;

  layoutPlay();

  cardA.onclick = showResult;

  lastPointer = null;
  lastMouseX = -9999;
  lastMouseY = -9999;
  stopContinuousDodge();
  const playArea = $('#playArea');
  playArea.onpointermove = e => maybeDodge(e.clientX, e.clientY);
  cardB.onpointerenter = e => nudge(e.clientX, e.clientY, 0, 0, 30);
  cardB.onpointerdown = e => {
    e.preventDefault();
    nudge(e.clientX, e.clientY, 0, 0, 70);
  };
}

const DODGE_RADIUS = 110;
let lastPointer = null; // { x, y, t } — 속도 계산용
let lastMouseX = -9999;
let lastMouseY = -9999;
let dodgeTimer = null;

function maybeDodge(px, py) {
  if (state.screen !== 'play') return;

  lastMouseX = px;
  lastMouseY = py;

  const t = performance.now();
  let speed = 0;
  if (lastPointer) {
    const dt = t - lastPointer.t;
    if (dt > 0 && dt < 200) {
      speed = Math.hypot(px - lastPointer.x, py - lastPointer.y) / dt;
    }
  }
  lastPointer = { x: px, y: py, t };

  const cardB = $('#cardB');
  const r = cardB.getBoundingClientRect();
  const bcx = r.left + r.width / 2;
  const bcy = r.top + r.height / 2;
  const dist = Math.hypot(px - bcx, py - bcy);

  if (dist > DODGE_RADIUS) return;
  nudge(px, py, dist, speed);
  startContinuousDodge();
}

// 마우스가 카드 근처에서 멈춰 있어도 카드가 계속 미끄러지듯 도망가게 함
function startContinuousDodge() {
  if (dodgeTimer) return;
  dodgeTimer = setInterval(() => {
    if (state.screen !== 'play') {
      stopContinuousDodge();
      return;
    }
    const cardB = $('#cardB');
    const r = cardB.getBoundingClientRect();
    const bcx = r.left + r.width / 2;
    const bcy = r.top + r.height / 2;
    const dist = Math.hypot(lastMouseX - bcx, lastMouseY - bcy);
    if (dist < DODGE_RADIUS) {
      nudge(lastMouseX, lastMouseY, dist, 0);
    } else {
      stopContinuousDodge();
    }
  }, 80);
}

function stopContinuousDodge() {
  if (dodgeTimer) {
    clearInterval(dodgeTimer);
    dodgeTimer = null;
  }
}

function nudge(pointerX, pointerY, distToB, speed, overrideStep = null) {
  const playArea = $('#playArea');
  const cardA = $('#cardA');
  const cardB = $('#cardB');
  const pa = playArea.getBoundingClientRect();
  const aRect = cardA.getBoundingClientRect();
  const bRect = cardB.getBoundingClientRect();
  const bw = cardB.offsetWidth;
  const bh = cardB.offsetHeight;
  const margin = 8;

  // 도망 방향: pointer → B 중심
  const bcx = bRect.left + bRect.width / 2;
  const bcy = bRect.top + bRect.height / 2;
  let dx = bcx - pointerX;
  let dy = bcy - pointerY;
  const dirLen = Math.hypot(dx, dy) || 1;
  dx /= dirLen;
  dy /= dirLen;

  // step 크기: 가까울수록 크고, 마우스 속도에 비례
  const proximity = 1 - Math.min(distToB, DODGE_RADIUS) / DODGE_RADIUS; // 0~1
  const baseStep = 4 + 12 * proximity;          // 4~16px
  const speedStep = Math.min(speed * 35, 14);   // 마우스 속도 비례, 최대 14px
  const step = overrideStep ?? (baseStep + speedStep);

  // 1차 시도: pointer 반대 방향으로 이동
  let newX = state.bPos.x + dx * step;
  let newY = state.bPos.y + dy * step;

  // 클램프 + 벽 갇힘 검사
  const maxX = pa.width - bw - margin;
  const maxY = pa.height - bh - margin;
  const clampedX = Math.max(margin, Math.min(maxX, newX));
  const clampedY = Math.max(margin, Math.min(maxY, newY));
  const blockedX = Math.abs(newX - clampedX) > 0.5;
  const blockedY = Math.abs(newY - clampedY) > 0.5;
  newX = clampedX;
  newY = clampedY;

  // 벽에 막혔으면 다른 축으로 미끄러지듯 이동 (코너면 반대편으로 점프)
  if (blockedX && !blockedY) {
    const yDir = bcy < pointerY ? -1 : 1;
    newY = Math.max(margin, Math.min(maxY, state.bPos.y + yDir * step));
  } else if (blockedY && !blockedX) {
    const xDir = bcx < pointerX ? -1 : 1;
    newX = Math.max(margin, Math.min(maxX, state.bPos.x + xDir * step));
  } else if (blockedX && blockedY) {
    // 코너 갇힘 — 점프 대신 수직(90°) 방향 두 후보 중 더 멀리 갈 수 있는 쪽으로 미끄러짐
    const tx1 = state.bPos.x + (-dy) * step;
    const ty1 = state.bPos.y + dx * step;
    const cx1 = Math.max(margin, Math.min(maxX, tx1));
    const cy1 = Math.max(margin, Math.min(maxY, ty1));
    const move1 = Math.hypot(cx1 - state.bPos.x, cy1 - state.bPos.y);

    const tx2 = state.bPos.x + dy * step;
    const ty2 = state.bPos.y + (-dx) * step;
    const cx2 = Math.max(margin, Math.min(maxX, tx2));
    const cy2 = Math.max(margin, Math.min(maxY, ty2));
    const move2 = Math.hypot(cx2 - state.bPos.x, cy2 - state.bPos.y);

    if (move1 >= move2) { newX = cx1; newY = cy1; }
    else                { newX = cx2; newY = cy2; }
  }

  // A 카드와 겹치면 A에서 멀어지는 방향으로 옆으로 미끄러짐
  const acx = aRect.left + aRect.width / 2;
  const acy = aRect.top + aRect.height / 2;
  const ngx = pa.left + newX + bw / 2;
  const ngy = pa.top + newY + bh / 2;
  const minSep = (aRect.width + bw) / 2 + 10;
  const distToA = Math.hypot(ngx - acx, ngy - acy);
  if (distToA < minSep) {
    let ax = ngx - acx;
    let ay = ngy - acy;
    const aLen = Math.hypot(ax, ay) || 1;
    ax /= aLen;
    ay /= aLen;
    const targetGx = acx + ax * minSep;
    const targetGy = acy + ay * minSep;
    newX = targetGx - bw / 2 - pa.left;
    newY = targetGy - bh / 2 - pa.top;
    newX = Math.max(margin, Math.min(maxX, newX));
    newY = Math.max(margin, Math.min(maxY, newY));
  }

  state.bPos = { x: newX, y: newY };
  cardB.style.transform = `translate(${newX}px, ${newY}px)`;
}

function layoutPlay() {
  if (state.screen !== 'play') return;
  const playArea = $('#playArea');
  const cardA = $('#cardA');
  const cardB = $('#cardB');
  const pa = playArea.getBoundingClientRect();
  const aw = cardA.offsetWidth;
  const ah = cardA.offsetHeight;
  const bw = cardB.offsetWidth;
  const bh = cardB.offsetHeight;
  const aLeft = Math.random() < 0.5;
  const ay = (pa.height - ah) / 2;
  const by = (pa.height - bh) / 2;
  // 두 카드를 화면 중앙에 가깝게 배치
  const centerX = pa.width / 2;
  const gap = Math.min(aw * 0.3, 50);
  const ax = aLeft ? centerX - gap / 2 - aw : centerX + gap / 2;
  const bx = aLeft ? centerX + gap / 2 : centerX - gap / 2 - bw;
  cardA.style.transform = `translate(${ax}px, ${ay}px)`;
  cardB.style.transform = `translate(${bx}px, ${by}px)`;
  state.bPos = { x: bx, y: by };
}

function showResult() {
  stopContinuousDodge();
  showScreen('result');
  $('.result-text').textContent = state.giftA.text;
  if (window.confetti) {
    const burst = (origin) =>
      window.confetti({ particleCount: 100, spread: 80, startVelocity: 45, origin });
    burst({ y: 0.5, x: 0.5 });
    setTimeout(() => burst({ y: 0.6, x: 0.2 }), 200);
    setTimeout(() => burst({ y: 0.6, x: 0.8 }), 400);
  }
}

function bindResult() {
  $('#restartBtn').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    showScreen('setup');
  });
}

function initFromUrl() {
  const params = new URLSearchParams(location.search);
  const a = params.get('a');
  const b = params.get('b');
  if (a && b) {
    state.giftA = { text: a };
    state.giftB = { text: b };
    showScreen('play');
    setupPlay();
  } else {
    showScreen('setup');
  }
}

window.addEventListener('resize', layoutPlay);

bindSetup();
bindShare();
bindResult();
initFromUrl();
