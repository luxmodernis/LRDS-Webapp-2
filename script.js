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
  texts: null,
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
  // toujours la même taille, même quand le texte de fin (1 ligne) remplace
  // l'instruction de départ (2 lignes).
  dom.textZone.style.minHeight = dom.textZone.offsetHeight + 'px';

  computeScrollBounds();
  renderPlusButtons();
  setupDrag();
  setupProgressBar();
  setupSuite();
  setupRetour();
  setupQuit();
  window.addEventListener('resize', onResize);

  preloadModalImages();
  state.readyForIntro = true;
  maybeStartIntro();
}

// Applique les textes généraux (hors modales) chargés depuis texts.html
function applyAppTexts() {
  const t = state.texts.app;
  dom.instructionText.textContent = t.instructionDefault;
  dom.btnQuit.textContent = t.labelQuit;
  dom.btnSuite.textContent = t.labelSuite;
  dom.btnRetour.textContent = t.labelBack;
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
    return { panoramic: null, modals: [] };
  }
}

const TEXTS_FALLBACK = {
  app: {
    instructionDefault: 'Explorer la panoramique et cliquez sur tous les PLUS pour découvrir les soins.',
    instructionComplete: 'Vous avez visité tous les soins.',
    labelQuit: 'QUITTER',
    labelSuite: 'SUITE',
    labelBack: 'RETOUR',
    consigneDefault: "Entraînez-vous à présenter ce soin en utilisant l'étiquette",
  },
  modals: {},
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

    const modals = {};
    doc.querySelectorAll('[data-modal]').forEach(section => {
      const id = section.dataset.modal;
      modals[id] = {
        title: section.querySelector('[data-key="title"]')?.innerHTML.trim() || '',
        text:  section.querySelector('[data-key="text"]')?.innerHTML.trim() || '',
      };
    });

    return { app, modals };
  } catch (e) {
    console.warn('texts.html not found, using defaults');
    return TEXTS_FALLBACK;
  }
}

/* ===========================
   PRELOAD — images des modales
   =========================== */
function preloadModalImages() {
  const modals = state.config.modals || [];
  modals.forEach(modal => {
    if (modal.image)   { const i = new Image(); i.src = modal.image; }
    if (modal.label)   { const i = new Image(); i.src = modal.label; }
    if (modal.packshot){ const i = new Image(); i.src = modal.packshot; }
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
  const btn = getPlusBtn(id);
  if (btn) {
    btn.querySelector('.btn-circle').src = ASSETS.plusWhiteCircle;
    btn.querySelector('.btn-icon').src = ASSETS.plusWhiteIcon;
  }
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

  // Injecte le contenu depuis texts.html
  const texts = state.texts.modals[id] || {};
  dom.modalTitle.innerHTML   = texts.title || '';
  dom.modalText.innerHTML    = texts.text  || '';
  dom.modalConsigne.textContent = state.texts.app.consigneDefault;

  // Images (préchargées — pas de cache-busting)
  dom.modalImg.src         = modal.image    || '';
  dom.modalLabelImg.src    = modal.label    || '';
  dom.modalPackshotImg.src = modal.packshot || '';

  // Fade in après décodage image. Les changements visuels sur le diapo
  // (icône du bouton, apparition de QUITTER) n'ont lieu qu'une fois la
  // modale totalement opaque — sinon on les aperçoit par transparence
  // pendant le fondu d'ouverture (0.3s, cf. .modal-overlay).
  const openOverlay = () => {
    dom.modalOverlay.classList.add('open');
    setTimeout(() => {
      markVisited(id);
      checkCompletion();
    }, 320);
  };
  if (modal.image && dom.modalImg.decode) {
    dom.modalImg.decode().then(openOverlay).catch(openOverlay);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(openOverlay));
  }
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

  // Reporte la progression au LMS à chaque modale visitée, pour qu'elle
  // soit connue même si l'utilisateur quitte avant d'avoir tout vu.
  if (window.ScormBridge) ScormBridge.reportProgress(state.visited.size / total);

  if (state.visited.size >= total && !state.allVisited) {
    state.allVisited = true;
    if (window.ScormBridge) ScormBridge.reportCompleted();
    showCompletionState();
  }
}

function showCompletionState() {
  dom.instructionText.style.opacity = '0';
  setTimeout(() => {
    dom.instructionText.textContent = state.texts.app.instructionComplete;
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
function setupSuite() {
  dom.btnSuite.addEventListener('click', goToPage2);
}

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
