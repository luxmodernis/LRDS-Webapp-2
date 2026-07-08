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
  logoPattern:     'assets/logo.svg',
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
  modalLabelVisible: false,
  scrollX: 0,
  maxScrollX: 0,
  isDragging: false,
  dragStartX: 0,
  dragScrollX: 0,
  introPanning: false,   // bloque le drag pendant le pan initial uniquement
  introComplete: false,  // tous les boutons sont apparus
  animating: false,
  progressDragging: false,
  allVisited: false,
  // momentum
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
  modalContentPanel:$('modalContentPanel'),
  modalPanelsArea:  $('modalPanelsArea'),
  modalLabelPanel:  $('modalLabelPanel'),
  modalConsigne:    $('modalConsigne'),
  modalLabelImg:    $('modalLabelImg'),
  modalToggleBtn:   $('modalToggleBtn'),
  toggleBtnCircle:  $('toggleBtnCircle'),
  toggleBtnIcon:    $('toggleBtnIcon'),
  btnRetour:        $('btnRetour'),
};

/* ===========================
   INIT
   =========================== */
async function init() {
  state.config = await loadConfig();

  document.querySelector('.logo-img').src = ASSETS.logoPattern;

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

  // Aligne la largeur du track sur celle de l'image rendue
  // so que left:X% sur les boutons soit relatif à l'image, pas au viewport
  dom.panoramicTrack.style.width = dom.panoramicImg.offsetWidth + 'px';

  computeScrollBounds();
  renderPlusButtons();
  setupDrag();
  setupProgressBar();
  setupModalToggle();
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
      labelBack: 'RETOUR',
      modals: [],
    };
  }
}

/* ===========================
   SCROLL / BOUNDS
   =========================== */
function computeScrollBounds() {
  const wrapperW = dom.panoramicWrapper.offsetWidth;
  const trackW = dom.panoramicTrack.scrollWidth;
  state.maxScrollX = Math.max(0, trackW - wrapperW);
}

function setScrollX(x, animated = false) {
  x = Math.max(0, Math.min(state.maxScrollX, x));
  state.scrollX = x;

  if (animated) {
    dom.panoramicTrack.classList.add('is-animating');
  } else {
    dom.panoramicTrack.classList.remove('is-animating');
  }
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
   INTRO ANIMATION — pan lent 4s via RAF (synchro barre de progression)
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
      const x = fromX * (1 - easeInOutCubic(t));
      setScrollX(x);

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
      if (state.animating) return;
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
  const btn = getPlusBtn(id);
  if (btn) {
    btn.querySelector('.btn-circle').src = ASSETS.plusWhiteCircle;
    btn.querySelector('.btn-icon').src = ASSETS.plusWhiteIcon;
  }
}

/* ===========================
   MODAL — ouvre après préchargement image
   =========================== */
function openModal(id) {
  const modal = state.config.modals.find(m => m.id === id);
  if (!modal) return;

  state.currentModalId = id;
  state.modalLabelVisible = false;

  // Reset panels
  dom.modalPanelsArea.classList.remove('show-label');
  dom.modalToggleBtn.classList.remove('is-cross');
  dom.toggleBtnCircle.src = ASSETS.plusBlackCircle;
  dom.toggleBtnIcon.src = ASSETS.plusBlackIcon;

  // Injecte le contenu depuis le cache (préchargé au démarrage)
  const cache = modalCache[id] || {};
  dom.modalTitle.innerHTML   = cache.title    || '';
  dom.modalText.innerHTML    = cache.text     || '';
  dom.modalConsigne.textContent = cache.consigne || '';

  // Images sans cache-busting — déjà en mémoire browser via preload
  dom.modalImg.src      = modal.image || '';
  dom.modalLabelImg.src = modal.label || '';

  // Fade in immédiat
  requestAnimationFrame(() => dom.modalOverlay.classList.add('open'));

  markVisited(id);
  checkCompletion();
}

function closeModal() {
  dom.modalOverlay.classList.remove('open');

  // After fade-out transition, clean up and reveal QUITTER if all done
  setTimeout(() => {
    state.currentModalId = null;
    state.modalLabelVisible = false;
    dom.modalPanelsArea.classList.remove('show-label');
    dom.modalToggleBtn.classList.remove('is-cross');

    if (state.allVisited) {
      // Small extra delay so QUITTER doesn't flash before modal is gone
      setTimeout(() => showCompletionState(), 300);
      state.allVisited = false; // prevent re-triggering
    }
  }, 350);
}

function toggleModalContent() {
  state.modalLabelVisible = !state.modalLabelVisible;

  if (state.modalLabelVisible) {
    dom.modalPanelsArea.classList.add('show-label');
    dom.modalToggleBtn.classList.add('is-cross');
  } else {
    dom.modalPanelsArea.classList.remove('show-label');
    dom.modalToggleBtn.classList.remove('is-cross');
  }
  // btn-icon src stays the same — CSS rotate(45deg) makes the + look like ×
}

/* ===========================
   COMPLETION
   =========================== */
function checkCompletion() {
  const total = (state.config.modals || []).length;
  if (total === 0) return;
  if (state.visited.size >= total) {
    state.allVisited = true;
    // showCompletionState() is called from closeModal() after the modal fades out
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
   PRELOAD — images + textes des modales en arrière-plan
   =========================== */
const modalCache = {}; // { [id]: { title, text, consigne } }

function preloadModalImages() {
  const modals = state.config.modals || [];
  modals.forEach(modal => {
    if (modal.image) { const i = new Image(); i.src = modal.image; }
    if (modal.label) { const i = new Image(); i.src = modal.label; }
    // Précharge aussi les fichiers texte
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
    // vélocité en px/ms, filtrée légèrement pour éviter les pics
    state.dragVelocity = state.dragVelocity * 0.5 + ((state.dragLastX - clientX) / dt) * 0.5;
  }
  state.dragLastX = clientX;
  state.dragLastTime = now;
  const delta = state.dragStartX - clientX;
  setScrollX(state.dragScrollX + delta);
}

function onDragEnd() {
  if (!state.isDragging) return;
  state.isDragging = false;
  dom.panoramicWrapper.classList.remove('is-dragging');

  // Inertie : lance le momentum si vitesse suffisante
  const v = state.dragVelocity * 16; // px par frame à 60fps
  if (Math.abs(v) > 1) {
    applyMomentum(v);
  }
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
function setupModalToggle() {
  dom.modalToggleBtn.addEventListener('click', toggleModalContent);
}

function setupRetour() {
  dom.btnRetour.addEventListener('click', closeModal);
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
