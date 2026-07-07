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

  // Already unlocked this session → skip gate
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
      // Shake animation
      input.classList.remove('shake');
      void input.offsetWidth; // reflow
      input.classList.add('shake');
    }
  }

  submitBtn.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  input.focus();
}

/* ===========================
   ASSETS — chemins relatifs, tous embarqués localement
   Remplacer les placeholders par les vrais exports Figma avant packaging SCORM
   =========================== */
const ASSETS = {
  panoramic:         'content/slides/panoramic.png',
  logoPattern:       'assets/logo.svg',
  headerCloseCircle: 'assets/close-circle.svg',
  headerCloseIcon:   'assets/close-icon.svg',
  plusBlackCircle:   'assets/plus-black-circle.svg',
  plusBlackIcon:     'assets/plus-black-icon.svg',
  plusWhiteCircle:   'assets/plus-white-circle.svg',
  plusWhiteIcon:     'assets/plus-white-icon.svg',
  crossIcon:         'assets/cross-icon.svg',
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
  introComplete: false,
  animating: false,
};

/* ===========================
   DOM REFS
   =========================== */
const $ = id => document.getElementById(id);
const dom = {
  app: $('app'),
  instructionText: $('instructionText'),
  panoramicWrapper: $('panoramicWrapper'),
  panoramicTrack: $('panoramicTrack'),
  panoramicImg: $('panoramicImg'),
  progressDot: $('progressDot'),
  btnQuitWrap: $('btnQuitWrap'),
  btnQuit: $('btnQuit'),
  modalOverlay: $('modalOverlay'),
  modalImg: $('modalImg'),
  modalTitle: $('modalTitle'),
  modalText: $('modalText'),
  modalContentPanel: $('modalContentPanel'),
  modalLabelPanel: $('modalLabelPanel'),
  modalConsigne: $('modalConsigne'),
  modalLabelImg: $('modalLabelImg'),
  modalToggleBtn: $('modalToggleBtn'),
  toggleBtnCircle: $('toggleBtnCircle'),
  toggleBtnIcon: $('toggleBtnIcon'),
  btnRetour: $('btnRetour'),
};

/* ===========================
   INIT
   =========================== */
async function init() {
  state.config = await loadConfig();

  // Set logo
  document.querySelector('.logo-img').src = ASSETS.logoPattern;
  document.querySelector('.header-close .close-circle').src = ASSETS.headerCloseCircle;
  document.querySelector('.header-close .close-icon').src = ASSETS.headerCloseIcon;

  // Set panoramic image (config overrides ASSETS fallback)
  const panoramicSrc = state.config.panoramic || ASSETS.panoramic;
  await new Promise(resolve => {
    dom.panoramicImg.src = panoramicSrc;
    if (dom.panoramicImg.complete && dom.panoramicImg.naturalWidth > 0) {
      resolve();
    } else {
      dom.panoramicImg.onload = resolve;
      dom.panoramicImg.onerror = resolve; // resolve anyway to not block
    }
  });

  computeScrollBounds();
  renderPlusButtons();
  setupDrag();
  setupModalToggle();
  setupRetour();
  setupQuit();
  window.addEventListener('resize', onResize);

  // Start at the right end, then pan left
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
  const trackEl = document.querySelector('.progress-track');
  const dotEl = dom.progressDot;
  const trackW = trackEl.offsetWidth;
  const dotW = dotEl.offsetWidth;
  const ratio = x / state.maxScrollX;
  const maxLeft = trackW - dotW;
  dotEl.style.left = (ratio * maxLeft) + 'px';
}

/* ===========================
   INTRO ANIMATION
   =========================== */
function playIntroAnimation() {
  // Start at far right
  setScrollX(state.maxScrollX);
  state.animating = true;

  // After brief pause, animate to 0 (left)
  setTimeout(() => {
    dom.panoramicTrack.classList.add('is-animating');
    dom.panoramicTrack.style.transition = 'transform 2.4s cubic-bezier(0.4, 0, 0.2, 1)';
    setScrollX(0, false);
    dom.panoramicTrack.style.transform = `translateX(0px)`;
    updateProgress(0);
    state.scrollX = 0;

    // After pan completes, show buttons one by one
    setTimeout(() => {
      dom.panoramicTrack.style.transition = '';
      dom.panoramicTrack.classList.remove('is-animating');
      showButtonsSequentially();
    }, 2500);
  }, 300);
}

function showButtonsSequentially() {
  const buttons = [...document.querySelectorAll('.plus-btn')];
  // Sort by order (left-to-right = by x position)
  const sorted = buttons.sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));

  sorted.forEach((btn, i) => {
    setTimeout(() => {
      btn.classList.add('visible', 'animate-in');
      if (i === sorted.length - 1) {
        state.animating = false;
        state.introComplete = true;
      }
    }, i * 280);
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

    // Circle background
    const circle = document.createElement('img');
    circle.className = 'btn-circle';
    circle.src = ASSETS.plusBlackCircle;
    circle.alt = '';

    // Plus icon
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
    btn.classList.add('visited');
    btn.querySelector('.btn-circle').src = ASSETS.plusWhiteCircle;
    btn.querySelector('.btn-icon').src = ASSETS.plusWhiteIcon;
  }
}

/* ===========================
   MODAL
   =========================== */
async function openModal(id) {
  const modal = state.config.modals.find(m => m.id === id);
  if (!modal) return;

  state.currentModalId = id;
  state.modalLabelVisible = false;

  // Load content
  dom.modalImg.src = modal.image || ASSETS.modalProduct;
  dom.modalTitle.textContent = '';
  dom.modalText.innerHTML = '';
  dom.modalConsigne.textContent = '';
  dom.modalLabelImg.src = modal.label || ASSETS.modalLabel;

  // Reset panel state + set toggle button to PLUS
  dom.modalContentPanel.classList.remove('hidden-up');
  dom.modalLabelPanel.classList.remove('visible');
  dom.modalToggleBtn.classList.remove('is-cross');
  dom.toggleBtnCircle.src = ASSETS.plusBlackCircle;
  dom.toggleBtnIcon.src = ASSETS.plusBlackIcon;

  // Load text files
  try {
    const [titleRes, textRes, consigneRes] = await Promise.all([
      fetch(modal.titleFile).catch(() => null),
      fetch(modal.textFile).catch(() => null),
      fetch(modal.consigneFile).catch(() => null),
    ]);
    if (titleRes && titleRes.ok) {
      const title = await titleRes.text();
      // Handle line breaks in title
      dom.modalTitle.innerHTML = title.trim().replace(/\n/g, '<br>');
    }
    if (textRes && textRes.ok) {
      dom.modalText.innerHTML = await textRes.text();
    }
    if (consigneRes && consigneRes.ok) {
      dom.modalConsigne.textContent = await consigneRes.text();
    }
  } catch (e) {
    console.warn('Could not load modal content', e);
  }

  // Open modal
  dom.modalOverlay.hidden = false;
  requestAnimationFrame(() => {
    dom.modalOverlay.classList.add('open');
  });

  // Mark as visited
  markVisited(id);
  checkCompletion();
}

function closeModal() {
  dom.modalOverlay.classList.remove('open');
  setTimeout(() => {
    dom.modalOverlay.hidden = true;
    state.currentModalId = null;
    state.modalLabelVisible = false;
  }, 450);
}

function toggleModalContent() {
  state.modalLabelVisible = !state.modalLabelVisible;

  if (state.modalLabelVisible) {
    // + clicked → slide text up (hidden), show label, show X
    dom.modalContentPanel.classList.add('hidden-up');
    dom.modalLabelPanel.classList.add('visible');
    dom.modalToggleBtn.classList.add('is-cross');
    dom.toggleBtnCircle.src = ASSETS.plusBlackCircle;
    dom.toggleBtnIcon.src = ASSETS.crossIcon;
  } else {
    // X clicked → bring text back, hide label, show +
    dom.modalContentPanel.classList.remove('hidden-up');
    dom.modalLabelPanel.classList.remove('visible');
    dom.modalToggleBtn.classList.remove('is-cross');
    dom.toggleBtnCircle.src = ASSETS.plusBlackCircle;
    dom.toggleBtnIcon.src = ASSETS.plusBlackIcon;
  }
}

/* ===========================
   COMPLETION CHECK
   =========================== */
function checkCompletion() {
  const total = (state.config.modals || []).length;
  if (total === 0) return;
  if (state.visited.size >= total) {
    showCompletionState();
  }
}

function showCompletionState() {
  dom.instructionText.style.opacity = '0';
  setTimeout(() => {
    dom.instructionText.textContent = state.config.instructionComplete;
    dom.instructionText.classList.add('centered');
    dom.instructionText.style.opacity = '1';
  }, 400);

  dom.btnQuitWrap.style.display = 'flex';
  dom.btnQuit.textContent = state.config.labelQuit;
}

/* ===========================
   DRAG (panoramic)
   =========================== */
function setupDrag() {
  const wrapper = dom.panoramicWrapper;

  // Touch
  wrapper.addEventListener('touchstart', onDragStart, { passive: true });
  wrapper.addEventListener('touchmove', onDragMove, { passive: false });
  wrapper.addEventListener('touchend', onDragEnd);

  // Mouse
  wrapper.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
}

function getClientX(e) {
  return e.touches ? e.touches[0].clientX : e.clientX;
}

function onDragStart(e) {
  if (!state.introComplete) return;
  state.isDragging = true;
  state.dragStartX = getClientX(e);
  state.dragScrollX = state.scrollX;
  dom.panoramicWrapper.classList.add('is-dragging');
  dom.panoramicTrack.style.transition = 'none';
}

function onDragMove(e) {
  if (!state.isDragging) return;
  if (e.cancelable) e.preventDefault();
  const delta = state.dragStartX - getClientX(e);
  setScrollX(state.dragScrollX + delta);
}

function onDragEnd() {
  if (!state.isDragging) return;
  state.isDragging = false;
  dom.panoramicWrapper.classList.remove('is-dragging');
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
    // Hook SCORM exit here later
    console.log('SCORM exit');
  });
}

function onResize() {
  computeScrollBounds();
  // Clamp current scroll to new bounds
  setScrollX(state.scrollX);
}

/* ===========================
   START
   =========================== */
document.addEventListener('DOMContentLoaded', () => {
  initPasswordGate();
  init();
});
