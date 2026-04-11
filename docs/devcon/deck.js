(function () {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const currentSlideEl = document.getElementById('currentSlide');
  const totalSlidesEl = document.getElementById('totalSlides');
  const currentSectionTitleEl = document.getElementById('currentSectionTitle');
  const progressBarEl = document.getElementById('progressBar');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');

  if (slides.length === 0) return;

  let currentIndex = parseHash();

  renderBackticksInContent(document.getElementById('deckStage'));
  totalSlidesEl.textContent = String(slides.length);

  function resetSlideFit(slide) {
    const grid = slide?.querySelector('.slide-grid');
    if (!grid) return;
    grid.style.transform = '';
    grid.style.width = '';
    grid.style.height = '100%';
  }

  function fitSlide(slide) {
    const grid = slide?.querySelector('.slide-grid');
    if (!grid) return;

    resetSlideFit(slide);

    const availableHeight = grid.clientHeight;
    const availableWidth = grid.clientWidth;
    const requiredHeight = grid.scrollHeight;
    const requiredWidth = grid.scrollWidth;

    if (availableHeight === 0 || availableWidth === 0) return;

    const scale = Math.min(1, availableHeight / requiredHeight, availableWidth / requiredWidth);

    if (scale >= 0.999) return;

    grid.style.transform = `scale(${scale})`;
    grid.style.width = `${100 / scale}%`;
    grid.style.height = `${100 / scale}%`;
  }

  function fitCurrentSlide() {
    const slide = slides[currentIndex];
    if (!slide) return;
    window.requestAnimationFrame(() => {
      fitSlide(slide);
    });
  }

  function createRichTextFragment(text) {
    const content = typeof text === 'string' ? text : '';
    const matchesBackticks = /`[^`\n]+`/.test(content);

    if (!matchesBackticks) {
      return document.createTextNode(content);
    }

    const fragment = document.createDocumentFragment();
    const pattern = /`([^`\n]+)`/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        fragment.append(document.createTextNode(content.slice(lastIndex, match.index)));
      }

      const code = document.createElement('code');
      code.className = 'inline-code';
      code.textContent = match[1];
      fragment.append(code);
      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < content.length) {
      fragment.append(document.createTextNode(content.slice(lastIndex)));
    }

    return fragment;
  }

  function renderBackticksInContent(root) {
    if (!root) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.includes('`')) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest('code, pre, script, style, textarea')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode);
      currentNode = walker.nextNode();
    }

    for (const textNode of textNodes) {
      textNode.replaceWith(createRichTextFragment(textNode.nodeValue));
    }
  }

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
    currentSlideEl.textContent = String(currentIndex + 1);
    currentSectionTitleEl.textContent = title;
    progressBarEl.style.width = `${((currentIndex + 1) / slides.length) * 100}%`;
    document.title = `Manifold Devcon Deck - ${title}`;
  }

  function syncThemeToSlide() {
    const slide = slides[currentIndex];
    const slideTheme = slide?.dataset.theme || 'dark';
    document.documentElement.dataset.theme = slideTheme;
  }

  function render() {
    slides.forEach((slide, index) => {
      const isActive = index === currentIndex;
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', String(!isActive));
      if (!isActive) resetSlideFit(slide);
    });

    updateButtons();
    updateChrome();
    syncThemeToSlide();
    syncHash(currentIndex);
    fitCurrentSlide();
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
      default:
        break;
    }
  });

  document.getElementById('homeLink').addEventListener('click', (e) => {
    e.preventDefault();
    goTo(0);
  });
  prevBtn.addEventListener('click', previous);
  nextBtn.addEventListener('click', next);
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  window.addEventListener('hashchange', () => {
    const nextIndex = parseHash();
    if (nextIndex !== currentIndex) {
      currentIndex = nextIndex;
      render();
    }
  });

  window.addEventListener('resize', fitCurrentSlide);

  document.querySelectorAll('img').forEach((img) => {
    img.addEventListener('load', fitCurrentSlide);
  });

  document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
    fitCurrentSlide();
  });

  render();
}());
