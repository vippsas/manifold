(function () {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const currentSlideEl = document.getElementById('currentSlide');
  const totalSlidesEl = document.getElementById('totalSlides');
  const currentSectionTitleEl = document.getElementById('currentSectionTitle');
  const progressBarEl = document.getElementById('progressBar');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const themeBtn = document.getElementById('themeBtn');
  const notesBtn = document.getElementById('notesBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const speakerNotePanel = document.getElementById('speakerNotePanel');
  const speakerNoteCopy = document.getElementById('speakerNoteCopy');
  const storageKey = 'manifold-devcon-theme';

  if (slides.length === 0) return;

  let currentIndex = parseHash();
  let notesVisible = false;
  let theme = readTheme();

  totalSlidesEl.textContent = String(slides.length);

  function parseHash() {
    const value = Number(window.location.hash.replace('#', ''));
    if (!Number.isFinite(value) || value < 1 || value > slides.length) return 0;
    return value - 1;
  }

  function syncHash(index) {
    const nextHash = `#${index + 1}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, '', nextHash);
    }
  }

  function updateButtons() {
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === slides.length - 1;
  }

  function updateChrome() {
    const slide = slides[currentIndex];
    const title = slide.dataset.title || `Slide ${currentIndex + 1}`;
    const note = slide.dataset.note || 'No presenter note for this slide.';
    currentSlideEl.textContent = String(currentIndex + 1);
    currentSectionTitleEl.textContent = title;
    progressBarEl.style.width = `${((currentIndex + 1) / slides.length) * 100}%`;
    speakerNoteCopy.textContent = note;
    document.title = `Manifold Devcon Deck - ${title}`;
  }

  function readTheme() {
    const themeValue = document.documentElement.dataset.theme;
    return themeValue === 'light' ? 'light' : 'dark';
  }

  function writeTheme(nextTheme) {
    theme = nextTheme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Ignore storage failures in restricted contexts.
    }
    updateThemeUi();
  }

  function updateThemeUi() {
    const isLight = theme === 'light';
    themeBtn.textContent = isLight ? 'Dark Mode' : 'Light Mode';
    themeBtn.setAttribute('aria-pressed', String(isLight));
  }

  function updateNotesUi() {
    speakerNotePanel.hidden = !notesVisible;
    notesBtn.textContent = notesVisible ? 'Hide Notes' : 'Notes';
    notesBtn.setAttribute('aria-pressed', String(notesVisible));
  }

  function toggleTheme() {
    writeTheme(theme === 'light' ? 'dark' : 'light');
  }

  function render() {
    slides.forEach((slide, index) => {
      const isActive = index === currentIndex;
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', String(!isActive));
    });

    updateButtons();
    updateChrome();
    syncHash(currentIndex);
  }

  function goTo(index) {
    const nextIndex = Math.max(0, Math.min(index, slides.length - 1));
    if (nextIndex === currentIndex) return;
    currentIndex = nextIndex;
    render();
  }

  function next() {
    goTo(currentIndex + 1);
  }

  function previous() {
    goTo(currentIndex - 1);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
      return;
    }
    void document.exitFullscreen?.();
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
      case 'Enter':
        event.preventDefault();
        next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
      case 'Backspace':
        event.preventDefault();
        previous();
        break;
      case 'Home':
        event.preventDefault();
        goTo(0);
        break;
      case 'End':
        event.preventDefault();
        goTo(slides.length - 1);
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        toggleFullscreen();
        break;
      case 'n':
      case 'N':
        event.preventDefault();
        notesVisible = !notesVisible;
        updateNotesUi();
        break;
      case 't':
      case 'T':
        event.preventDefault();
        toggleTheme();
        break;
      default:
        break;
    }
  });

  prevBtn.addEventListener('click', previous);
  nextBtn.addEventListener('click', next);
  themeBtn.addEventListener('click', toggleTheme);
  notesBtn.addEventListener('click', () => {
    notesVisible = !notesVisible;
    updateNotesUi();
  });
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  window.addEventListener('hashchange', () => {
    const nextIndex = parseHash();
    if (nextIndex !== currentIndex) {
      currentIndex = nextIndex;
      render();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
  });

  updateThemeUi();
  updateNotesUi();
  render();
}());
