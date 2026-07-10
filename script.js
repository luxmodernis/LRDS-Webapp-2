
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
  progressDragging: false,
  allFound: false,
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

  // Précharge les images des modales en parallèle du chargement du
  // panoramique, pour qu'elles soient en cache dès la première ouverture.
  preloadModalImages();

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

  // Ratio naturel de l'image, utilisé pour recalculer la largeur du diapo
  // à chaque changement de taille de la fenêtre (voir syncTrackWidth) —
  // plus fiable que de figer un offsetWidth en px, qui se désynchronise
  // sur mobile quand la hauteur de viewport (barre d'adresse Safari) se
  // stabilise après le premier rendu.
  panoramicAspectRatio = dom.panoramicImg.naturalWidth / dom.panoramicImg.naturalHeight;
  syncTrackWidth();

  // Verrouille la hauteur de la zone de texte sur le maximum nécessaire
  // parmi TOUS les contenus possibles (chaque prompt d'ingrédient + le
  // texte de fin) — pas seulement le premier rendu — pour que le diapo
  // en dessous ne change jamais de taille pendant la partie.
  lockTextZoneHeight();

  computeScrollBounds();
  renderIngredientButtons();
  showAllButtons();
  updatePrompt();
  setupDrag();
  setupProgressBar();
  setupRetour();
  setupQuit();
  window.addEventListener('resize', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  new ResizeObserver(onResize).observe(dom.panoramicWrapper);
}

// Applique les textes généraux (hors modales) chargés depuis texts.html
function applyAppTexts() {
  dom.btnQuit.textContent = state.texts.app.labelQuit;
  dom.btnRetour.textContent = state.texts.app.labelBack;
}

// Mesure la hauteur de .text-zone pour un contenu HTML donné, sans laisser
// de trace visible (on restaure le contenu précédent juste après).
function measureTextZoneHeightFor(html) {
  const prevHTML = dom.instructionText.innerHTML;
  dom.instructionText.innerHTML = html;
  const h = dom.textZone.offsetHeight;
  dom.instructionText.innerHTML = prevHTML;
  return h;
}

// Verrouille .text-zone sur la plus grande hauteur possible parmi tous les
// prompts d'ingrédients et le texte de fin, pour que le panoramique en
// dessous garde toujours la même taille quel que soit le nombre de lignes
// du texte affiché.
function lockTextZoneHeight() {
  const candidates = Object.values(state.texts.ingredients)
    .map(t => `${state.texts.app.promptPrefix}<strong>${t.title || ''}</strong>`);
  candidates.push(state.texts.app.completionText);

  const maxH = candidates.reduce((max, html) => Math.max(max, measureTextZoneHeightFor(html)), 0);
  dom.textZone.style.minHeight = maxH + 'px';
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
    (ing.products || []).forEach(src => {
      const i = new Image();
      i.src = src;
    });
  });
}

/* ===========================
   SCROLL / BOUNDS
   =========================== */
let progressMaxLeft = 0;
let panoramicAspectRatio = 0;

// Recalcule la largeur du diapo à partir du ratio naturel de l'image et de
// la hauteur *actuelle* du wrapper, plutôt que de figer un offsetWidth en
// px une seule fois — sur mobile, la hauteur de viewport (dvh) se stabilise
// souvent après le premier rendu (barre d'adresse Safari qui se réduit),
// ce qui désynchronisait la largeur du track de la largeur réelle de
// l'image et laissait un espace blanc à droite du panoramique.
function syncTrackWidth() {
  if (!panoramicAspectRatio) return;
  const h = dom.panoramicWrapper.offsetHeight;
  dom.panoramicTrack.style.width = Math.round(h * panoramicAspectRatio) + 'px';
  document.documentElement.style.setProperty('--diapo-h', h + 'px');
}

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

function showAllButtons() {
  document.querySelectorAll('.plus-btn').forEach(btn => btn.classList.add('visible'));
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
      if (state.allFound) return;
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
  const srcs = ing.products || [];

  srcs.forEach((src, i) => {
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

  // Le bouton "?" ne passe en coche qu'une fois la modale totalement
  // opaque, pour ne pas apercevoir le changement par transparence pendant
  // le fondu d'ouverture (0.3s, cf. .modal-overlay).
  setTimeout(() => { markFound(id); }, 320);
}

function closeModal() {
  const closedId = state.currentModalId;

  // Le prompt suivant (ou l'écran de fin) est préparé pendant que la
  // modale est encore totalement opaque, pour que le changement soit déjà
  // fait — et donc invisible — quand elle se referme, au lieu d'apparaître
  // en direct sur le diapo après le fondu de fermeture.
  if (closedId) advanceAfterFound();

  dom.modalOverlay.classList.remove('open');
  setTimeout(() => {
    state.currentModalId = null;
    dom.modalProducts.innerHTML = '';
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
    // Ferme la fenêtre/webview après que le LMS a eu le temps de terminer
    // (sur Teach on Mars, api.utils.close() est appelé via terminate(),
    // mais window.close() sert de filet de sécurité si la détection échoue)
    setTimeout(() => { try { window.close(); } catch (e) {} }, 300);
  });
}

function onResize() {
  syncTrackWidth();
  computeScrollBounds();
  setScrollX(state.scrollX);
}

/* ===========================
   START
   =========================== */
document.addEventListener('DOMContentLoaded', () => {
  if (window.ScormBridge) ScormBridge.initialize();
  init();
});

// Filet de sécurité : si l'utilisateur ferme l'onglet/app sans cliquer
// sur QUITTER, on tente quand même de committer la dernière progression.
window.addEventListener('pagehide', () => {
  if (window.ScormBridge) ScormBridge.terminate();
});
