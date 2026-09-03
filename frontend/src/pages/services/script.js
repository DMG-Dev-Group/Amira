// ── Comportamentos gerais das páginas da loja ─────────────────────────────
// ⚠️ Este arquivo é um MÓDULO (contém export) — inclua sempre com
// <script type="module" src="services/script.js">. Antes ele era incluído
// como script clássico e o `export` derrubava o arquivo inteiro com
// SyntaxError (a home só funcionava porque home-dinamica.js o importava).
// O switch de tema agora vive em services/tema.js.

// ── Navbar: escurece ao rolar ─────────────────────────────────────────────
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });
}

// ── Categorias dropdown ───────────────────────────────────────────────────
const categoriasBtn = document.getElementById('categoriasBtn');
const categoriasDropdown = document.getElementById('categoriasDropdown');

if (categoriasBtn && categoriasDropdown) {
  let dropdownOpen = false;

  categoriasBtn.addEventListener('click', e => {
    e.stopPropagation();
    dropdownOpen = !dropdownOpen;
    categoriasDropdown.classList.toggle('open', dropdownOpen);
    categoriasBtn.classList.toggle('active', dropdownOpen);
    categoriasBtn.setAttribute('aria-expanded', dropdownOpen);
    categoriasDropdown.setAttribute('aria-hidden', !dropdownOpen);
  });

  document.addEventListener('click', e => {
    if (!categoriasBtn.contains(e.target) && !categoriasDropdown.contains(e.target)) {
      dropdownOpen = false;
      categoriasDropdown.classList.remove('open');
      categoriasBtn.classList.remove('active');
      categoriasBtn.setAttribute('aria-expanded', 'false');
      categoriasDropdown.setAttribute('aria-hidden', 'true');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      dropdownOpen = false;
      categoriasDropdown.classList.remove('open');
      categoriasBtn.classList.remove('active');
    }
  });
}

// ── Scroll reveal com IntersectionObserver ────────────────────────────────
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

export function ativarReveals(container = document) {
  const reveals = container.querySelectorAll('.reveal:not(.visible)');
  reveals.forEach(el => revealObserver.observe(el));
}

// ativa os elementos já existentes na página
ativarReveals();

// ── Newsletter: envia e-mail via WhatsApp ─────────────────────────────────
// Exposta em window porque o index.html chama via onclick="handleNewsletter()".
function handleNewsletter() {
  const email = document.getElementById('email-input').value;
  if (!email || !email.includes('@')) {
    alert('Por favor, insira um e-mail válido.');
    return;
  }
  const msg = encodeURIComponent(
    'Olá! Gostaria de receber novidades da Amira. Meu e-mail é: ' + email
  );
  window.open('https://wa.me/5598984853656?text=' + msg, '_blank');
}
window.handleNewsletter = handleNewsletter;

// ── Smooth scroll para âncoras internas ──────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return; // "#" puro não é seletor válido
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── Carrossel de fotos ("Looks que inspiram") ─────────────────────────────
const track = document.getElementById('carouselTrack');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');

if (track && btnPrev && btnNext) {
  const CARD_WIDTH = 280 + 20;
  let manualOffset = 0;

  function getCurrentAnimatedX() {
    const style = window.getComputedStyle(track);
    const matrix = new WebKitCSSMatrix(style.transform);
    return matrix.m41;
  }

  function pauseAnimation() {
    const currentX = getCurrentAnimatedX();
    track.style.animation = 'none';
    track.style.transform = `translateX(${currentX}px)`;
    manualOffset = currentX;
  }

  function resumeAnimation() {
    track.style.animation = '';
    track.style.transform = '';
    manualOffset = 0;
  }

  btnNext.addEventListener('click', () => {
    pauseAnimation();
    manualOffset -= CARD_WIDTH;
    const halfWidth = track.scrollWidth / 2;
    if (Math.abs(manualOffset) >= halfWidth) manualOffset = 0;
    track.style.transform = `translateX(${manualOffset}px)`;
    track.style.transition = 'transform 0.45s ease';
    setTimeout(() => { track.style.transition = ''; }, 460);
  });

  btnPrev.addEventListener('click', () => {
    pauseAnimation();
    manualOffset += CARD_WIDTH;
    if (manualOffset > 0) manualOffset = -(track.scrollWidth / 2 - CARD_WIDTH);
    track.style.transform = `translateX(${manualOffset}px)`;
    track.style.transition = 'transform 0.45s ease';
    setTimeout(() => { track.style.transition = ''; }, 460);
  });

  let resumeTimer;
  [btnPrev, btnNext].forEach(btn => {
    btn.addEventListener('click', () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(resumeAnimation, 4000);
    });
  });

  // Cada card é um link para a seção de iPhones — clicar navega, não amplia.
}
