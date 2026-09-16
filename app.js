// ===== Logic/Middleware layer =====

// Pure, framework-free game rules — kept isolated from rendering so they can
// be called/tested independently (e.g. from a console or a future test file).
window.GameLogic = {
  // Returns 0-100, clamped, based on elapsed real time (not frame count).
  getRemainingPercent(startTime, now, durationMs) {
    const elapsed = now - startTime;
    const pct = 100 - (elapsed / durationMs) * 100;
    return Math.max(0, Math.min(100, pct));
  },
  isBasketComplete(basketSet, requiredIngredients) {
    return requiredIngredients.every((item) => basketSet.has(item));
  },
  // Qualitative rating derived from how much time was left at checkout —
  // no numeric score is stored, just a label + star count for the result screen.
  getPerformanceRating(outcome, remainingPct) {
    if (outcome !== 'win') {
      return { stars: 0, label: 'PERFORMANCE: COLLAPSED.' };
    }
    if (remainingPct >= 50) {
      return { stars: 5, label: 'PERFORMANCE: EXCELLENT! RECIPE MASTERED.' };
    }
    if (remainingPct >= 20) {
      return { stars: 4, label: 'PERFORMANCE: GREAT! WELL SHOPPED.' };
    }
    return { stars: 3, label: 'PERFORMANCE: CUTTING IT CLOSE!' };
  },
  formatRemainingTime(seconds) {
    const whole = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(whole / 60);
    const secs = String(whole % 60).padStart(2, '0');
    return `${minutes}:${secs}`;
  },
};

const TIMER_DURATION_MS = 30000;

const AVATAR_IMAGES = {
  Aidan: 'assets/images/avatars/aidan.png',
  Annika: 'assets/images/avatars/annika.png',
  Maria: 'assets/images/avatars/maria.png',
  Sid: 'assets/images/avatars/sid.png',
};

const state = {
  avatar: null,
  recipe: null,
  basket: new Set(),
  outcome: 'idle', // 'idle' | 'in-progress' | 'win' | 'loss'
  timer: {
    startTime: null,
    running: false,
    rafId: null,
  },
  data: {
    recipes: [],
    aisles: {},
  },
};

// ----- DOM refs -----
const screens = {
  title: document.getElementById('screen-title'),
  avatar: document.getElementById('screen-avatar'),
  recipe: document.getElementById('screen-recipe'),
  market: document.getElementById('screen-market'),
  result: document.getElementById('screen-result'),
};

const titleSelectAvatarBtn = document.getElementById('title-select-avatar-btn');
const avatarHotspots = document.querySelectorAll('.avatar-hotspot');
const recipeHotspots = document.querySelectorAll('.recipe-hotspot');

const timerFill = document.getElementById('timer-bar-fill');
const timerSecondsEl = document.getElementById('timer-seconds');
const basketCountEl = document.getElementById('basket-count');
const basketTotalEl = document.getElementById('basket-total');
const recipeChecklist = document.getElementById('recipe-checklist');
const aisleView = document.getElementById('aisle-view');
const shelfView = document.getElementById('shelf-view');
const shelfTitle = document.getElementById('shelf-title');
const shelfItems = document.getElementById('shelf-items');
const cashierBtn = document.getElementById('cashier-btn');
const toastEl = document.getElementById('toast');

const resultEyebrow = document.getElementById('result-eyebrow');
const resultTitle = document.getElementById('result-title');
const resultStars = document.getElementById('result-stars');
const batteryFill = document.getElementById('battery-fill');
const batteryPct = document.getElementById('battery-pct');
const resultRemainingTime = document.getElementById('result-remaining-time');
const resultRatingLine = document.getElementById('result-rating-line');
const resultDetail = document.getElementById('result-detail');
const resultAvatarImg = document.getElementById('result-avatar-img');
const resultMoodBadge = document.getElementById('result-mood-badge');
const playAgainBtn = document.getElementById('play-again-btn');

// ----- Screen switching -----
function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.remove('active'));
  screens[name].classList.add('active');
}

// ----- Data layer: fetch mock JSON to simulate a backend call -----
async function loadGameData() {
  const [recipesRes, aislesRes] = await Promise.all([
    fetch('./data/recipes.json'),
    fetch('./data/aisles.json'),
  ]);
  state.data.recipes = await recipesRes.json();
  state.data.aisles = await aislesRes.json();
}

// ----- Avatar select -----
titleSelectAvatarBtn.addEventListener('click', () => {
  showScreen('avatar');
});

avatarHotspots.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.avatar = btn.dataset.avatar;
    showScreen('recipe');
  });
});

// ----- Recipe select -----
recipeHotspots.forEach((btn) => {
  btn.addEventListener('click', () => {
    const recipe = state.data.recipes.find((r) => r.id === btn.dataset.recipeId);
    if (recipe) startRound(recipe);
  });
});

// ----- Round lifecycle -----
function startRound(recipe) {
  state.recipe = recipe;
  state.basket = new Set();
  state.outcome = 'in-progress';

  showScreen('market');
  renderBasketHud();
  shelfTitle.textContent = '';
  shelfItems.innerHTML = '';
  shelfView.classList.add('hidden');
  showToast('', false);

  startTimer();
}

function resetToStart() {
  state.avatar = null;
  state.recipe = null;
  state.basket = new Set();
  state.outcome = 'idle';
  showScreen('title');
}

// ----- Basket / checklist HUD -----
function renderBasketHud() {
  const required = state.recipe.ingredients;
  basketTotalEl.textContent = required.length;
  basketCountEl.textContent = state.basket.size;

  recipeChecklist.innerHTML = '';
  required.forEach((item) => {
    const collected = state.basket.has(item);
    const li = document.createElement('li');
    li.className = collected ? 'done' : '';
    li.innerHTML = `<span class="basket-checkbox">${collected ? '✔' : ''}</span><span class="basket-item-label">${item}</span>`;
    recipeChecklist.appendChild(li);
  });
}

function updateCashierState() {
  const complete = window.GameLogic.isBasketComplete(
    state.basket,
    state.recipe.ingredients
  );
  cashierBtn.disabled = !complete;
  cashierBtn.classList.toggle('unlocked', complete);
  const lockIcon = complete ? '🔓' : '🔒';
  cashierBtn.innerHTML = `<span class="lock-icon">${lockIcon}</span>Checkout<span class="lock-icon">${lockIcon}</span>`;
}

// ----- Aisle / shelf interaction -----
function openShelf(aisleName) {
  shelfTitle.textContent = aisleName;
  shelfItems.innerHTML = '';

  const items = state.data.aisles[aisleName] || [];
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'shelf-item';
    btn.textContent = item;
    if (state.basket.has(item)) btn.classList.add('collected');
    btn.addEventListener('click', () => handleItemClick(item, btn));
    shelfItems.appendChild(btn);
  });

  shelfView.classList.remove('hidden');
}

function handleItemClick(item, itemEl) {
  if (state.outcome !== 'in-progress') return;

  // Already collected — no-op rejection cue, no double counting.
  if (state.basket.has(item)) {
    rejectCue(itemEl);
    return;
  }

  // Decoy item not on the active recipe — rejection cue, no penalty.
  if (!state.recipe.ingredients.includes(item)) {
    rejectCue(itemEl);
    return;
  }

  state.basket.add(item);
  itemEl.classList.add('collected');
  renderBasketHud();
  updateCashierState();
}

function rejectCue(itemEl) {
  itemEl.classList.remove('shake');
  // Restart the animation even if triggered again quickly.
  requestAnimationFrame(() => itemEl.classList.add('shake'));
  setTimeout(() => itemEl.classList.remove('shake'), 300);
  showToast('Not on your list!', true);
}

let toastTimeoutId = null;
function showToast(message, visible) {
  clearTimeout(toastTimeoutId);
  if (!visible) {
    toastEl.classList.add('hidden');
    return;
  }
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  toastTimeoutId = setTimeout(() => toastEl.classList.add('hidden'), 1200);
}

aisleView.querySelectorAll('.aisle-hotspot').forEach((btn) => {
  btn.addEventListener('click', () => openShelf(btn.dataset.aisle));
});

// ----- Timer (driven by elapsed real time, not frame count) -----
function startTimer() {
  state.timer.startTime = performance.now();
  state.timer.running = true;
  updateTimerBar(100);
  state.timer.rafId = requestAnimationFrame(tickTimer);
}

function stopTimer() {
  state.timer.running = false;
  if (state.timer.rafId !== null) {
    cancelAnimationFrame(state.timer.rafId);
    state.timer.rafId = null;
  }
}

function tickTimer(now) {
  if (!state.timer.running) return;

  const pct = window.GameLogic.getRemainingPercent(
    state.timer.startTime,
    now,
    TIMER_DURATION_MS
  );
  updateTimerBar(pct);

  if (pct <= 0) {
    stopTimer();
    endRound('loss');
    return;
  }

  state.timer.rafId = requestAnimationFrame(tickTimer);
}

function updateTimerBar(pct) {
  timerFill.style.width = `${pct}%`;
  const secondsLeft = Math.ceil((pct / 100) * (TIMER_DURATION_MS / 1000));
  timerSecondsEl.textContent = Math.max(0, Math.min(30, secondsLeft));
}

// ----- Cashier / checkout -----
cashierBtn.addEventListener('click', () => {
  if (cashierBtn.disabled || state.outcome !== 'in-progress') return;
  stopTimer();
  endRound('win');
});

// ----- Result -----
function endRound(outcome) {
  state.outcome = outcome;

  // Loss always means the clock hit 0; win captures whatever time was left
  // on the bar the instant checkout was clicked.
  const pct = outcome === 'win'
    ? window.GameLogic.getRemainingPercent(state.timer.startTime, performance.now(), TIMER_DURATION_MS)
    : 0;
  const secondsRemaining = (pct / 100) * (TIMER_DURATION_MS / 1000);

  screens.result.classList.remove('outcome-win', 'outcome-loss');
  screens.result.classList.add(outcome === 'win' ? 'outcome-win' : 'outcome-loss');

  if (outcome === 'win') {
    resultEyebrow.textContent = 'LEVEL SUCCESS · SCORE SCREEN';
    resultTitle.textContent = '🎉 You Win!';
    resultDetail.textContent = `You bagged everything for ${state.recipe.name} in time!`;
    resultMoodBadge.textContent = '😄';
  } else {
    resultEyebrow.textContent = 'LEVEL FAILED · SCORE SCREEN';
    resultTitle.textContent = "⏰ Time's Up!";
    resultDetail.textContent = `You collected ${state.basket.size}/${state.recipe.ingredients.length} ingredients for ${state.recipe.name}.`;
    resultMoodBadge.textContent = '😢';
  }

  const rating = window.GameLogic.getPerformanceRating(outcome, pct);
  resultStars.innerHTML = Array.from(
    { length: 5 },
    (_, i) => `<span class="${i < rating.stars ? 'lit' : 'dim'}">★</span>`
  ).join('');
  resultRatingLine.textContent = rating.label;
  resultRemainingTime.textContent = window.GameLogic.formatRemainingTime(secondsRemaining);

  const roundedPct = Math.round(pct);
  batteryFill.style.height = `${roundedPct}%`;
  batteryPct.textContent = `${roundedPct}%`;

  resultAvatarImg.src = AVATAR_IMAGES[state.avatar] || AVATAR_IMAGES.Maria;
  resultAvatarImg.alt = `${state.avatar || 'Your shopper'} (${outcome === 'win' ? 'happy' : 'sad'})`;

  showScreen('result');
}

playAgainBtn.addEventListener('click', resetToStart);

// ----- Boot -----
loadGameData();
