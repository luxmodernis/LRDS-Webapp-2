/* ===========================
   PASSWORD GATE
   =========================== */
const PW_CORRECT = 'LRDS';
const PW_SESSION_KEY = 'lrds_unlocked';

function initPasswordGate() {
  const gate = document.getElementById('passwordGate');
  const input = document.getElementById('pwInput');
  const submitBtn = document.getElementById('pwSubmit');
  const errorEl = document.getElementById('pwError');

  if (sessionStorage.getItem(PW_SESSION_KEY) === '1') {
    gate.classList.add('unlocked');
    gate.addEventListener('transitionend', () => { gate.hidden = true; }, { once: true });
    return;
  }

  function tryUnlock() {
    const val = input.value.trim().toUpperCase();
    if (val === PW_CORRECT) {
      sessionStorage.setItem(PW_SESSION_KEY, '1');
      errorEl.textContent = '';
      gate.classList.add('unlocked');
      gate.addEventListener('transitionend', () => { gate.hidden = true; }, { once: true });
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
   ASSETS
   =========================== */
const ASSETS = {
  panoramic:       'content/slides/panoramic.webp',
  plusBlackCircle: 'assets/plus-black-circle.svg',
  plusBlackIcon:   'assets/plus-black-icon.svg',
  plusWhiteCircle: 'assets/plus-white-circle.svg',
  plusWhiteIcon:   'assets/plus-white-icon.svg',
};

/* ===========================
   STATE
   =========================== */
const state = {
  config: null,
  visited: new Set(),
  currentModalId: null,
  modalPage: 1,         // 1 ou 2
  scrollX: 0,
  maxScrollX: 0,
  isDragging: false,
  dragStartX: 0,
  dragScrollX: 0,
  introPanning: false,
  introComplete: false,
  animating: false,
  progressDragging: false,
  allVisited: false,
  dragVelocity: 0,
  dragLastX: 0,
  dragLastTime: 0,
  momentumActive: false,
};

/* ===========================
   DOM REFS
   =========================== */
const $ = id => document.getElementById(id);
const dom = {
  app:              $('app'),
  instructionText:  $('instructionText'),
  panoramicWrapper: $('panoramicWrapper'),
  panoramicTrack:   $('panoramicTrack'),
  panoramicImg:     $('panoramicImg'),
  progressTrack:    $('progressTrack'),
  progressDot:      $('progressDot'),
  btnQuitWrap:      $('btnQuitWrap'),
  btnQuit:          $('btnQuit'),
  modalOverlay:     $('modalOverlay'),
  modalImg:         $('modalImg'),
  modalTitle:       $('modalTitle'),
  modalText:        $('modalText'),
  modalPagesTrack:  $('modalPagesTrack'),
  modalConsigne:    $('modalConsigne'),
  modalLabelImg:    $('modalLabelImg'),
  modalPackshotImg: $('modalPackshotImg'),
  btnSuite:         $('btnSuite'),
  btnRetour:        $('btnRetour'),
};

/* ===========================
   INIT
   =========================== */
async function init() {
  state.config = await loadConfig();

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

  computeScrollBounds();
  renderPlusButtons();
  setupDrag();
  setupProgressBar();
  setupSuite();
  setupRetour();
  setupQuit();
  window.addEventListener('resize', onResize);

  preloadModalImages();
  playIntroAnimation();
}

async function loadConfig() {
  try {
    const res = await fetch('content/config.json');
    return await res.json();
  } catch (e) {
    console.warn('config.json not found, using defaults');
    return {
      panoramic: null,
      instructionDefault: 'Explorer la panoramique et cliquez sur tous les PLUS pour découvrir les soins.',
      instructionComplete: 'Vous avez visité tous les soins.',
      labelQuit: 'QUITTER',
      modals: [],
    };
  }
}

/* ===========================
   PRELOAD — images + textes des modales
   =========================== */
const modalCache = {};

function preloadModalImages() {
  const modals = state.config.modals || [];
  modals.forEach(modal => {
    if (modal.image)   { const i = new Image(); i.src = modal.image; }
    if (modal.label)   { const i = new Image(); i.src = modal.label; }
    if (modal.packshot){ const i = new Image(); i.src = modal.packshot; }
    preloadModalText(modal);
  });
}

async function preloadModalText(modal) {
  const cache = modalCache[modal.id] = { title: '', text: '', consigne: '' };
  try {
    const [tR, xR, cR] = await Promise.all([
      modal.titleFile    ? fetch(modal.titleFile).catch(() => null)    : null,
      modal.textFile     ? fetch(modal.textFile).catch(() => null)     : null,
      modal.consigneFile ? fetch(modal.consigneFile).catch(() => null) : null,
    ]);
    if (tR && tR.ok) cache.title    = (await tR.text()).trim().replace(/\n/g, '<br>');
    if (xR && xR.ok) cache.text     = await xR.text();
    if (cR && cR.ok) cache.consigne = (await cR.text()).trim();
  } catch (e) { /* silencieux */ }
}

/* ===========================
   SCROLL / BOUNDS
   =========================== */
function computeScrollBounds() {
  const wrapperW = dom.panoramicWrapper.offsetWidth;
  const trackW = dom.panoramicTrack.scrollWidth;
  state.maxScrollX = Math.max(0, trackW - wrapperW);
}

function setScrollX(x) {
  x = Math.max(0, Math.min(state.maxScrollX, x));
  state.scrollX = x;
  dom.panoramicTrack.style.transform = `translateX(${-x}px)`;
  updateProgress(x);
}

function updateProgress(x) {
  if (state.maxScrollX === 0) return;
  const trackW = dom.progressTrack.offsetWidth;
  const dotW = dom.progressDot.offsetWidth;
  const ratio = x / state.maxScrollX;
  const maxLeft = trackW - dotW;
  dom.progressDot.style.left = (ratio * maxLeft) + 'px';
}

/* ===========================
   INTRO ANIMATION — pan lent 4s via RAF
   =========================== */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function playIntroAnimation() {
  const fromX = state.maxScrollX;
  setScrollX(fromX);
  state.introPanning = true;
  state.animating = true;

  const duration = 4000;

  setTimeout(() => {
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      setScrollX(fromX * (1 - easeInOutCubic(t)));

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        state.introPanning = false;
        showButtonsSequentially();
      }
    }

    requestAnimationFrame(frame);
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
      }
    }, i * 500);
  });
}

/* ===========================
   PLUS BUTTONS
   =========================== */
function renderPlusButtons() {
  const modals = state.config.modals || [];

  modals.forEach(modal => {
    const btn = document.createElement('button');
    btn.className = 'plus-btn';
    btn.setAttribute('data-id', modal.id);
    btn.style.left = modal.position.x + '%';
    btn.style.top = modal.position.y + '%';
    btn.setAttribute('aria-label', `Découvrir ${modal.id}`);

    const circle = document.createElement('img');
    circle.className = 'btn-circle';
    circle.src = ASSETS.plusBlackCircle;
    circle.alt = '';

    const icon = document.createElement('img');
    icon.className = 'btn-icon';
    icon.src = ASSETS.plusBlackIcon;
    icon.alt = '';

    btn.appendChild(circle);
    btn.appendChild(icon);

    btn.addEventListener('click', () => {
      if (state.introPanning) return;
      openModal(modal.id);
    });

    dom.panoramicTrack.appendChild(btn);
  });
}

function getPlusBtn(id) {
  return dom.panoramicTrack.querySelector(`.plus-btn[data-id="${id}"]`);
}

function markVisited(id) {
  state.visited.add(id);
  setTimeout(() => {
    const btn = getPlusBtn(id);
    if (btn) {
      btn.querySelector('.btn-circle').src = ASSETS.plusWhiteCircle;
      btn.querySelector('.btn-icon').src = ASSETS.plusWhiteIcon;
    }
  }, 400);
}

/* ===========================
   MODAL
   =========================== */
function openModal(id) {
  const modal = state.config.modals.find(m => m.id === id);
  if (!modal) return;

  state.currentModalId = id;
  state.modalPage = 1;

  // Reset to page 1
  dom.modalPagesTrack.classList.remove('show-page2');

  // Injecte le contenu depuis le cache
  const cache = modalCache[id] || {};
  dom.modalTitle.innerHTML   = cache.title   || '';
  dom.modalText.innerHTML    = cache.text    || '';
  dom.modalConsigne.textContent = cache.consigne || 'Entraînez-vous';

  // Images (préchargées — pas de cache-busting)
  dom.modalImg.src         = modal.image    || '';
  dom.modalLabelImg.src    = modal.label    || '';
  dom.modalPackshotImg.src = modal.packshot || '';

  // Fade in après décodage image
  const openOverlay = () => dom.modalOverlay.classList.add('open');
  if (modal.image && dom.modalImg.decode) {
    dom.modalImg.decode().then(openOverlay).catch(openOverlay);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(openOverlay));
  }

  markVisited(id);
  checkCompletion();
}

function closeModal() {
  dom.modalOverlay.classList.remove('open');
  setTimeout(() => {
    state.currentModalId = null;
    state.modalPage = 1;
    dom.modalPagesTrack.classList.remove('show-page2');
  }, 350);
}

function goToPage2() {
  state.modalPage = 2;
  dom.modalPagesTrack.classList.add('show-page2');
}

function goToPage1() {
  state.modalPage = 1;
  dom.modalPagesTrack.classList.remove('show-page2');
}

/* ===========================
   COMPLETION
   =========================== */
function checkCompletion() {
  const total = (state.config.modals || []).length;
  if (total === 0) return;
  if (state.visited.size >= total && !state.allVisited) {
    state.allVisited = true;
    showCompletionState();
  }
}

function showCompletionState() {
  dom.instructionText.style.opacity = '0';
  setTimeout(() => {
    dom.instructionText.textContent = state.config.instructionComplete || 'Vous avez visité tous les soins.';
    dom.instructionText.classList.add('centered');
    dom.instructionText.style.opacity = '1';
  }, 400);

  dom.btnQuitWrap.classList.add('visible');
  if (state.config.labelQuit) dom.btnQuit.textContent = state.config.labelQuit;
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
function setupSuite() {
  dom.btnSuite.addEventListener('click', goToPage2);
}

function setupRetour() {
  dom.btnRetour.addEventListener('click', () => {
    if (state.modalPage === 2) {
      goToPage1();
    } else {
      closeModal();
    }
  });
}

function setupQuit() {
  dom.btnQuit.addEventListener('click', () => {
    console.log('SCORM exit');
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
  initPasswordGate();
  init();
});
