const button = document.getElementById('mobile-menu-btn');
const nav = document.getElementById('nav-menu');
const mobile = matchMedia('(max-width: 900px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
document.documentElement.classList.add('js');
function setMenu(open, restoreFocus = false) {
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  button.classList.toggle('active', open);
  nav.classList.toggle('active', open);
  nav.inert = mobile.matches && !open;
  if (restoreFocus) button.focus();
}
button.addEventListener('click', () => setMenu(button.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', event => {
  if (event.target.closest('a') && mobile.matches) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') setMenu(false, true);
});
document.addEventListener('click', event => {
  if (!event.target.closest('header')) setMenu(false);
});
document.addEventListener('focusin', event => {
  if (mobile.matches && !event.target.closest('header')) setMenu(false);
});
mobile.addEventListener('change', () => setMenu(false));
setMenu(false);
const topButton = document.getElementById('backToTop');
function updateTopButton() { topButton.classList.toggle('visible', scrollY > 400); }
window.addEventListener('scroll', updateTopButton, { passive: true });
updateTopButton();
topButton.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  document.querySelector('.logo').focus({ preventScroll: true });
});
const emailButton = document.getElementById('reveal-email-btn');
const emailDisplay = document.getElementById('email-display');
emailButton.addEventListener('click', () => {
  const show = emailButton.getAttribute('aria-expanded') !== 'true';
  emailButton.setAttribute('aria-expanded', String(show));
  emailButton.textContent = show ? 'Hide email' : 'Reveal email';
  emailDisplay.replaceChildren();
  if (show) {
    const link = document.createElement('a');
    link.href = 'mailto:georgeelliottdeveloper@gmail.com';
    link.textContent = 'georgeelliottdeveloper@gmail.com';
    emailDisplay.append(link);
  }
});

// Feature carousel. Without JavaScript, every feature stays visible.
const featureCarousel = document.querySelector('.feature-carousel');
const featureCards = [...featureCarousel.querySelectorAll('.feature-card')];
const featureControls = featureCarousel.querySelector('.feature-controls');
const featurePosition = document.getElementById('features-position');
let featureStart = 0;
let featureDots = [];
const featuresPerPage = () => mobile.matches ? 1 : 3;
function buildFeatureDots() {
  const size = featuresPerPage();
  const count = Math.ceil(featureCards.length / size);
  if (featureDots.length === count) return;
  const container = featureCarousel.querySelector('.feature-dots');
  container.replaceChildren();
  featureDots = Array.from({ length: count }, (_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Show feature group ${index + 1}`);
    dot.setAttribute('aria-controls', 'feature-slides');
    dot.addEventListener('click', () => { featureStart = index * size; showFeatures(); });
    container.append(dot);
    return dot;
  });
}
function showFeatures() {
  buildFeatureDots();
  const size = featuresPerPage();
  featureStart = Math.floor(featureStart / size) * size;
  featureCards.forEach((card, index) => {
    card.hidden = index < featureStart || index >= featureStart + size;
  });
  featureDots.forEach((dot, index) => {
    dot.setAttribute('aria-current', String(index === Math.floor(featureStart / size)));
  });
  featurePosition.textContent = `${Math.floor(featureStart / size) + 1} / ${Math.ceil(featureCards.length / size)}`;
}
function moveFeatures(direction) {
  featureStart = (featureStart + direction * featuresPerPage() + featureCards.length) % featureCards.length;
  showFeatures();
}
document.getElementById('features-prev').addEventListener('click', () => moveFeatures(-1));
document.getElementById('features-next').addEventListener('click', () => moveFeatures(1));
featureCarousel.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    moveFeatures(event.key === 'ArrowRight' ? 1 : -1);
  }
});
mobile.addEventListener('change', showFeatures);
featureControls.hidden = false;
showFeatures();

const playbackButton = document.getElementById('features-playback');
let playbackPaused = reducedMotion.matches;
let featureTimer;
function scheduleFeatures() {
  clearTimeout(featureTimer);
  const interacting = featureCarousel.matches(':hover') || featureCarousel.contains(document.activeElement);
  const playing = !playbackPaused && !document.hidden && !interacting;
  featurePosition.setAttribute('aria-live', playing ? 'off' : 'polite');
  const playbackLabel = playbackPaused ? 'Play automatic slides' : 'Pause automatic slides';
  playbackButton.querySelector('.icon-play').hidden = !playbackPaused;
  playbackButton.querySelector('.icon-pause').hidden = playbackPaused;
  playbackButton.setAttribute('aria-label', playbackLabel);
  playbackButton.title = playbackLabel;
  if (playing) {
    featureTimer = setTimeout(() => {
      moveFeatures(1);
      scheduleFeatures();
    }, 8000);
  }
}
playbackButton.addEventListener('click', () => {
  playbackPaused = !playbackPaused;
  scheduleFeatures();
});
featureCarousel.addEventListener('mouseenter', scheduleFeatures);
featureCarousel.addEventListener('mouseleave', scheduleFeatures);
featureCarousel.addEventListener('focusin', scheduleFeatures);
featureCarousel.addEventListener('focusout', () => queueMicrotask(scheduleFeatures));
document.addEventListener('visibilitychange', scheduleFeatures);
reducedMotion.addEventListener('change', () => {
  playbackPaused = reducedMotion.matches;
  scheduleFeatures();
});
scheduleFeatures();
