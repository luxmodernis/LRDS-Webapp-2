/* ===========================
   PASSWORD GATE
   =========================== */
const PW_CORRECT = 'LRDS';
const PW_SESSION_KEY = 'lrds_unlocked';

function initPasswordGate(onUnlock) {
  const gate = document.getElementById('passwordGate');
  const input = document.getElementById('pwInput');
  const submitBtn = document.getElementById('pwSubmit');
  const errorEl = document.getElementById('pwError');

  if (sessionStorage.getItem(PW_SESSION_KEY) === '1') {
    gate.classList.add('unlocked');
    gate.addEventListener('transitionend', () => { gate.hidden = true; }, { once: true });
    onUnlock();
    return;
  }

  function tryUnlock() {
    const val = input.value.trim().toUpperCase();
    if (val === PW_CORRECT) {
      sessionStorage.setItem(PW_SESSION_KEY, '1');
      errorEl.textContent = '';
      gate.classList.add('unlocked');
      gate.addEventListener('transitionend', () => { gate.hidden = true; }, { once: true });
      onUnlock();
    } else {
      errorEl.textContent = 'Mot de passe incorrect.';
      input.value = '';
      input.focus();
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
    }
  }

  submitBtn.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  input.focus();
}

/* ===========================
   SONS — Web Audio API (pas de fichiers, pas de dépendance)
   =========================== */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, startTime, duration, type = 'sine', peakGain = 0.2) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function playSuccessSound() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  playTone(660, now, 0.12, 'sine', 0.18);
  playTone(990, now + 0.09, 0.18, 'sine', 0.2);
}

function playErrorSound() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  playTone(180, now, 0.22, 'square', 0.1);
}

/* ===========================
   ASSETS
   =========================== */
const ASSETS = {
  panoramic:        'content/slides/panoramic.webp',
  ingredientUnfound: 'assets/ingredient-unfound.svg',
  ingredientFound:   'assets/ingredient-found.svg',
};

/* ===========================
   STATE
   =========================== */
const state = {
  config: null,
  texts: null,
  found: new Set(),
  targetIndex: 0,
  currentModalId: null,
  scrollX: 0,
  maxScrollX: 0,
  isDragging: false,
  dragStartX: 0,
  dragScrollX: 0,
  introPanning: false,
  introComplete: false,
  animating: false,
  progressDragging: false,
  allFound: false,
  dragVelocity: 0,
  dragLastX: 0,
  dragLastTime: 0,
  momentumActive: false,
  readyForIntro: false,
  passwordUnlocked: false,
};

/* ===========================
   DOM REFS
   =========================== */
const $ = id => document.getElementById(id);
const dom = {
  app:              $('app'),
  textZone:         document.querySelector('.text-zone'),
  instructionText:  $('instructionText'),
  panoramicWrapper: $('panoramicWrapper'),
  panoramicTrack:   $('panoramicTrack'),
  panoramicImg:     $('panoramicImg'),
  progressTrack:    $('progressTrack'),
  progressDot:      $('progressDot'),
  btnQuitWrap:      $('btnQuitWrap'),
  btnQuit:          $('btnQuit'),
  modalOverlay:     $('modalOverlay'),
  modalTitle:       $('modalTitle'),
  modalProducts:    $('modalProducts'),
  btnRetour:        $('btnRetour'),
};

/* ===========================
   INIT
   =========================== */
async function init() {
  state.config = await loadConfig();
  state.texts = await loadTexts();
  applyAppTexts();

  const panoramicSrc = state.config.panoramic || ASSETS.panoramic;
  await new Promise(resolve => {
    dom.panoramicImg.src = panoramicSrc;
    if (dom.panoramicImg.complete && dom.panoramicImg.naturalWidth > 0) {
      resolve();
    } else {
      dom.panoramicImg.onload = resolve;
      dom.panoramicImg.onerror = resolve;
    }
  });

  dom.panoramicTrack.style.width = dom.panoramicImg.offsetWidth + 'px';

  // Verrouille la hauteur de la zone de texte pour que le diapo garde
  // toujours la même taille, même quand le texte de fin (3 lignes) remplace
  // la consigne (2 lignes).
  dom.textZone.style.minHeight = dom.textZone.offsetHeight + 'px';

  computeScrollBounds();
  renderIngredientButtons();
  setupDrag();
  setupProgressBar();
  setupRetour();
  setupQuit();
  window.addEventListener('resize', onResize);

  preloadModalImages();
  state.readyForIntro = true;
  maybeStartIntro();
}

// Applique les textes généraux (hors modales) chargés depuis texts.html
function applyAppTexts() {
  dom.btnQuit.textContent = state.texts.app.labelQuit;
  dom.btnRetour.textContent = state.texts.app.labelBack;
}

// L'animation d'intro attend deux conditions : le chargement (init) terminé
// ET le mot de passe validé — sinon elle se joue derrière l'écran de mdp.
function maybeStartIntro() {
  if (state.readyForIntro && state.passwordUnlocked) {
    playIntroAnimation();
  }
}

async function loadConfig() {
  try {
    const res = await fetch('content/config.json');
    return await res.json();
  } catch (e) {
    console.warn('config.json not found, using defaults');
    return { panoramic: null, ingredients: [] };
  }
}

const TEXTS_FALLBACK = {
  app: {
    promptPrefix: "Retrouvez l'ingrédient bienfaisant :",
    completionText: 'Bravo, vous avez identifié tous les ingrédients bienfaisants présents dans la panoramique.',
    labelQuit: 'QUITTER',
    labelBack: 'RETOUR',
  },
  ingredients: {},
};

// Charge et parse le fichier unique de textes (content/texts.html).
// C'est ce fichier qui est remplacé d'une langue à l'autre pour les
// packages Teach on Mars — voir les commentaires en tête du fichier.
async function loadTexts() {
  try {
    const res = await fetch('content/texts.html');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const app = { ...TEXTS_FALLBACK.app };
    doc.querySelectorAll('[data-app-texts] [data-key]').forEach(el => {
      app[el.dataset.key] = el.innerHTML.trim();
    });

    const ingredients = {};
    doc.querySelectorAll('[data-ingredient]').forEach(section => {
      const id = section.dataset.ingredient;
      const products = [...section.querySelectorAll('.product [data-key="caption"]')]
        .map(el => el.innerHTML.trim());
      ingredients[id] = {
        title: section.querySelector('[data-key="title"]')?.innerHTML.trim() || '',
        products,
      };
    });

    return { app, ingredients };
  } catch (e) {
    console.warn('texts.html not found, using defaults');
    return TEXTS_FALLBACK;
  }
}

/* ===========================
   PRELOAD — images des modales
   =========================== */
function preloadModalImages() {
  const ingredients = state.config.ingredients || [];
  ingredients.forEach(ing => {
    (ing.products || []).forEach(src => { const i = new Image(); i.src = src; });
  });
}

/* ===========================
   SCROLL / BOUNDS
   =========================== */
let progressMaxLeft = 0;

function computeScrollBounds() {
  const wrapperW = dom.panoramicWrapper.offsetWidth;
  const trackW = dom.panoramicTrack.scrollWidth;
  state.maxScrollX = Math.max(0, trackW - wrapperW);
  // Mis en cache pour éviter un reflow synchrone à chaque frame d'animation
  progressMaxLeft = dom.progressTrack.offsetWidth - dom.progressDot.offsetWidth;
}

function setScrollX(x) {
  x = Math.max(0, Math.min(state.maxScrollX, x));
  state.scrollX = x;
  dom.panoramicTrack.style.transform = `translate3d(${-x}px, 0, 0)`;
  updateProgress(x);
}

function updateProgress(x) {
  if (state.maxScrollX === 0) return;
  const ratio = x / state.maxScrollX;
  dom.progressDot.style.transform = `translate3d(${ratio * progressMaxLeft}px, 0, 0)`;
}

/* ===========================
   INTRO ANIMATION — pan lent 5.5s via transition CSS
   (compositeur GPU, insensible aux à-coups du thread JS)
   =========================== */
function playIntroAnimation() {
  const duration = 5500;
  const easing = 'cubic-bezier(0.65, 0, 0.35, 1)'; // équivalent ease-in-out-cubic

  setScrollX(state.maxScrollX);
  state.introPanning = true;
  state.animating = true;

  setTimeout(() => {
    const transition = `transform ${duration}ms ${easing}`;
    dom.panoramicTrack.style.transition = transition;
    dom.progressDot.style.transition = transition;
    void dom.panoramicTrack.offsetWidth; // force le navigateur à figer l'état de départ

    setScrollX(0);

    const onEnd = (e) => {
      if (e.target !== dom.panoramicTrack) return;
      dom.panoramicTrack.style.transition = '';
      dom.progressDot.style.transition = '';
      dom.panoramicTrack.removeEventListener('transitionend', onEnd);
      state.introPanning = false;
      showButtonsSequentially();
    };
    dom.panoramicTrack.addEventListener('transitionend', onEnd);
  }, 400);
}

function showButtonsSequentially() {
  const buttons = [...document.querySelectorAll('.plus-btn')];
  const sorted = buttons.sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));

  sorted.forEach((btn, i) => {
    setTimeout(() => {
      btn.classList.add('visible');
      if (i === sorted.length - 1) {
        state.animating = false;
        state.introComplete = true;
        updatePrompt();
      }
    }, i * 500);
  });
}

/* ===========================
   INGREDIENT BUTTONS
   =========================== */
function renderIngredientButtons() {
  const ingredients = state.config.ingredients || [];

  ingredients.forEach(ing => {
    const btn = document.createElement('button');
    btn.className = 'plus-btn';
    btn.setAttribute('data-id', ing.id);
    btn.style.left = ing.position.x + '%';
    btn.style.top = ing.position.y + '%';
    btn.setAttribute('aria-label', `Ingrédient ${ing.id}`);

    const circle = document.createElement('img');
    circle.className = 'btn-circle';
    circle.src = ASSETS.ingredientUnfound;
    circle.alt = '';

    btn.appendChild(circle);

    btn.addEventListener('click', () => {
      if (state.introPanning || !state.introComplete || state.allFound) return;
      onGuess(ing.id, btn);
    });

    dom.panoramicTrack.appendChild(btn);
  });
}

function getIngredientBtn(id) {
  return dom.panoramicTrack.querySelector(`.plus-btn[data-id="${id}"]`);
}

function orderedIngredients() {
  return [...(state.config.ingredients || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
}

function currentTarget() {
  return orderedIngredients()[state.targetIndex] || null;
}

/* ===========================
   PROMPT (texte "Retrouvez l'ingrédient : NOM")
   =========================== */
function updatePrompt() {
  const target = currentTarget();
  if (!target) return;
  const texts = state.texts.ingredients[target.id] || {};
  dom.instructionText.classList.remove('centered');
  dom.instructionText.innerHTML =
    `${state.texts.app.promptPrefix}<strong>${texts.title || ''}</strong>`;
}

/* ===========================
   GUESS HANDLING
   =========================== */
function onGuess(id, btn) {
  const target = currentTarget();
  if (!target) return;

  if (id === target.id) {
    markFound(id);
    playSuccessSound();
    openModal(id);
  } else {
    playErrorSound();
    btn.classList.remove('wrong');
    void btn.offsetWidth;
    btn.classList.add('wrong');
    btn.addEventListener('animationend', () => btn.classList.remove('wrong'), { once: true });
  }
}

function markFound(id) {
  state.found.add(id);
  const btn = getIngredientBtn(id);
  if (btn) btn.querySelector('.btn-circle').src = ASSETS.ingredientFound;
}

/* ===========================
   MODAL
   =========================== */
function openModal(id) {
  const ing = state.config.ingredients.find(i => i.id === id);
  const texts = state.texts.ingredients[id] || {};
  if (!ing) return;

  state.currentModalId = id;

  dom.modalTitle.textContent = texts.title || '';

  dom.modalProducts.innerHTML = '';
  (ing.products || []).forEach((src, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-product';

    const img = document.createElement('img');
    img.className = 'modal-product-img';
    img.src = src;
    img.alt = texts.products?.[i] || '';
    img.draggable = false;

    const caption = document.createElement('p');
    caption.className = 'modal-product-caption';
    caption.textContent = texts.products?.[i] || '';

    wrap.appendChild(img);
    wrap.appendChild(caption);
    dom.modalProducts.appendChild(wrap);
  });

  dom.modalOverlay.classList.add('open');
}

function closeModal() {
  dom.modalOverlay.classList.remove('open');
  setTimeout(() => {
    const closedId = state.currentModalId;
    state.currentModalId = null;
    dom.modalProducts.innerHTML = '';
    if (closedId) advanceAfterFound();
  }, 350);
}

/* ===========================
   PROGRESSION DU JEU
   =========================== */
function advanceAfterFound() {
  const total = orderedIngredients().length;
  if (total === 0) return;

  // Reporte la progression au LMS à chaque ingrédient trouvé, pour qu'elle
  // soit connue même si l'utilisateur quitte avant d'avoir tout trouvé.
  if (window.ScormBridge) ScormBridge.reportProgress(state.found.size / total);

  state.targetIndex += 1;

  if (state.found.size >= total && !state.allFound) {
    state.allFound = true;
    if (window.ScormBridge) ScormBridge.reportCompleted();
    showCompletionState();
  } else {
    updatePrompt();
  }
}

function showCompletionState() {
  dom.instructionText.style.opacity = '0';
  setTimeout(() => {
    dom.instructionText.textContent = state.texts.app.completionText;
    dom.instructionText.classList.add('centered');
    dom.instructionText.style.opacity = '1';
  }, 400);

  dom.btnQuitWrap.classList.add('visible');
}

/* ===========================
   DRAG — panoramique
   =========================== */
function setupDrag() {
  const wrapper = dom.panoramicWrapper;

  wrapper.addEventListener('touchstart', onDragStart, { passive: true });
  wrapper.addEventListener('touchmove', onDragMove, { passive: false });
  wrapper.addEventListener('touchend', onDragEnd);

  wrapper.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
}

function getClientX(e) {
  return e.touches ? e.touches[0].clientX : e.clientX;
}

function onDragStart(e) {
  if (state.introPanning) return;
  state.momentumActive = false;
  state.isDragging = true;
  const clientX = getClientX(e);
  state.dragStartX = clientX;
  state.dragScrollX = state.scrollX;
  state.dragLastX = clientX;
  state.dragLastTime = performance.now();
  state.dragVelocity = 0;
  dom.panoramicWrapper.classList.add('is-dragging');
}

function onDragMove(e) {
  if (!state.isDragging) return;
  if (e.cancelable) e.preventDefault();
  const now = performance.now();
  const clientX = getClientX(e);
  const dt = now - state.dragLastTime;
  if (dt > 0) {
    state.dragVelocity = state.dragVelocity * 0.5 + ((state.dragLastX - clientX) / dt) * 0.5;
  }
  state.dragLastX = clientX;
  state.dragLastTime = now;
  setScrollX(state.dragScrollX + (state.dragStartX - clientX));
}

function onDragEnd() {
  if (!state.isDragging) return;
  state.isDragging = false;
  dom.panoramicWrapper.classList.remove('is-dragging');

  const v = state.dragVelocity * 16;
  if (Math.abs(v) > 1) applyMomentum(v);
}

function applyMomentum(v) {
  state.momentumActive = true;
  const friction = 0.92;

  function frame() {
    if (!state.momentumActive) return;
    v *= friction;
    if (Math.abs(v) < 0.4 || state.scrollX <= 0 || state.scrollX >= state.maxScrollX) {
      state.momentumActive = false;
      return;
    }
    setScrollX(state.scrollX + v);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ===========================
   PROGRESS BAR — cliquable & draggable
   =========================== */
function setupProgressBar() {
  const track = dom.progressTrack;

  function seekFromEvent(e) {
    const rect = track.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setScrollX(ratio * state.maxScrollX);
  }

  track.addEventListener('mousedown', e => {
    state.momentumActive = false;
    state.progressDragging = true;
    seekFromEvent(e);
    e.stopPropagation();
    e.preventDefault();
  });
  track.addEventListener('touchstart', e => {
    state.momentumActive = false;
    state.progressDragging = true;
    seekFromEvent(e);
    e.stopPropagation();
  }, { passive: true });

  window.addEventListener('mousemove', e => {
    if (state.progressDragging) { state.isDragging = false; seekFromEvent(e); }
  });
  window.addEventListener('touchmove', e => {
    if (state.progressDragging) { state.isDragging = false; seekFromEvent(e); }
  }, { passive: true });

  window.addEventListener('mouseup', () => { state.progressDragging = false; });
  window.addEventListener('touchend', () => { state.progressDragging = false; });
}

/* ===========================
   EVENTS
   =========================== */
function setupRetour() {
  dom.btnRetour.addEventListener('click', closeModal);
}

function setupQuit() {
  dom.btnQuit.addEventListener('click', () => {
    if (window.ScormBridge) ScormBridge.terminate();
  });
}

function onResize() {
  dom.panoramicTrack.style.width = dom.panoramicImg.offsetWidth + 'px';
  computeScrollBounds();
  setScrollX(state.scrollX);
}

/* ===========================
   START
   =========================== */
document.addEventListener('DOMContentLoaded', () => {
  if (window.ScormBridge) ScormBridge.initialize();
  initPasswordGate(() => {
    state.passwordUnlocked = true;
    maybeStartIntro();
  });
  init();
});

// Filet de sécurité : si l'utilisateur ferme l'onglet/app sans cliquer
// sur QUITTER, on tente quand même de committer la dernière progression.
window.addEventListener('pagehide', () => {
  if (window.ScormBridge) ScormBridge.terminate();
});
