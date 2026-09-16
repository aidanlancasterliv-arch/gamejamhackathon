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
};

const AVATARS = ['🧑‍🍳', '🧑', '👩', '🧔', '👧', '🦸'];
const TIMER_DURATION_MS = 30000;

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
  avatar: document.getElementById('screen-avatar'),
  recipe: document.getElementById('screen-recipe'),
  market: document.getElementById('screen-market'),
  result: document.getElementById('screen-result'),
};

const avatarGrid = document.getElementById('avatar-grid');
const avatarContinueBtn = document.getElementById('avatar-continue');
const recipeGrid = document.getElementById('recipe-grid');

const timerFill = document.getElementById('timer-bar-fill');
const basketCountEl = document.getElementById('basket-count');
const basketTotalEl = document.getElementById('basket-total');
const recipeChecklist = document.getElementById('recipe-checklist');
const aisleView = document.getElementById('aisle-view');
const shelfView = document.getElementById('shelf-view');
const shelfTitle = document.getElementById('shelf-title');
const shelfItems = document.getElementById('shelf-items');
const shelfBackBtn = document.getElementById('shelf-back');
const cashierBtn = document.getElementById('cashier-btn');
const toastEl = document.getElementById('toast');

const resultTitle = document.getElementById('result-title');
const resultDetail = document.getElementById('result-detail');
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
function renderAvatars() {
  avatarGrid.innerHTML = '';
  AVATARS.forEach((avatar) => {
    const btn = document.createElement('button');
    btn.className = 'avatar-option';
    btn.textContent = avatar;
    btn.addEventListener('click', () => {
      state.avatar = avatar;
      document
        .querySelectorAll('.avatar-option')
        .forEach((el) => el.classList.remove('selected'));
      btn.classList.add('selected');
      avatarContinueBtn.disabled = false;
    });
    avatarGrid.appendChild(btn);
  });
}

avatarContinueBtn.addEventListener('click', () => {
  if (!state.avatar) return;
  showScreen('recipe');
});

// ----- Recipe select -----
function renderRecipes() {
  recipeGrid.innerHTML = '';
  state.data.recipes.forEach((recipe) => {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <h3>${recipe.name}</h3>
      <ul>${recipe.ingredients.map((i) => `<li>${i}</li>`).join('')}</ul>
    `;
    card.addEventListener('click', () => startRound(recipe));
    recipeGrid.appendChild(card);
  });
}

// ----- Round lifecycle -----
function startRound(recipe) {
  state.recipe = recipe;
  state.basket = new Set();
  state.outcome = 'in-progress';

  showScreen('market');
  renderBasketHud();
  closeShelf();
  showToast('', false);

  startTimer();
}

function resetToStart() {
  state.avatar = null;
  state.recipe = null;
  state.basket = new Set();
  state.outcome = 'idle';
  avatarContinueBtn.disabled = true;
  document
    .querySelectorAll('.avatar-option')
    .forEach((el) => el.classList.remove('selected'));
  showScreen('avatar');
}

// ----- Basket / checklist HUD -----
function renderBasketHud() {
  const required = state.recipe.ingredients;
  basketTotalEl.textContent = required.length;
  basketCountEl.textContent = state.basket.size;

  recipeChecklist.innerHTML = '';
  required.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    if (state.basket.has(item)) li.classList.add('done');
    recipeChecklist.appendChild(li);
  });
}

function updateCashierState() {
  const complete = window.GameLogic.isBasketComplete(
    state.basket,
    state.recipe.ingredients
  );
  cashierBtn.disabled = !complete;
  cashierBtn.textContent = complete ? '✅ Checkout' : '🔒 Checkout';
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

  aisleView.classList.add('hidden');
  shelfView.classList.remove('hidden');
}

function closeShelf() {
  shelfView.classList.add('hidden');
  aisleView.classList.remove('hidden');
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

aisleView.querySelectorAll('.aisle').forEach((btn) => {
  btn.addEventListener('click', () => openShelf(btn.dataset.aisle));
});
shelfBackBtn.addEventListener('click', closeShelf);

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
  timerFill.classList.remove('warn', 'danger');
  if (pct <= 15) {
    timerFill.classList.add('danger');
  } else if (pct <= 30) {
    timerFill.classList.add('warn');
  }
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

  if (outcome === 'win') {
    resultTitle.textContent = '🎉 You Win!';
    resultDetail.textContent = `You bagged everything for ${state.recipe.name} in time!`;
  } else {
    resultTitle.textContent = "⏰ Time's Up!";
    resultDetail.textContent = `You collected ${state.basket.size}/${state.recipe.ingredients.length} ingredients for ${state.recipe.name}.`;
  }

  showScreen('result');
}

playAgainBtn.addEventListener('click', resetToStart);

// ----- Boot -----
loadGameData().then(() => {
  renderAvatars();
  renderRecipes();
});
