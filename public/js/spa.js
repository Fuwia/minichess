/**
 * MiniChess SPA — seamless page transitions with CSS injection
 */
(function () {
  'use strict';

  var TRANSITION_MS = 180;
  var NAV_SELECTOR = '.sidebar-nav a[href]';
  var MAIN_SELECTOR = '.main-content';

  var isNavigating = false;

  // ===== Init =====
  function init() {
    // Fade in on initial load
    var main = document.querySelector(MAIN_SELECTOR);
    if (main) {
      main.style.opacity = '0';
      main.style.transition = 'opacity ' + TRANSITION_MS + 'ms ease';
      requestAnimationFrame(function () {
        main.style.opacity = '1';
      });
    }

    bindNavClicks();
    bindPopState();
  }

  // ===== Intercept sidebar nav clicks =====
  function bindNavClicks() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest(NAV_SELECTOR);
      if (!link) return;

      var href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('//')) return;

      // Exclude non-SPA pages
      if (href.indexOf('game.html') >= 0 || href.indexOf('index.html') >= 0) return;
      if (href.indexOf('register.html') >= 0 || href.indexOf('join.html') >= 0) return;

      e.preventDefault();
      if (isNavigating) return;
      navigate(href);
    });
  }

  // ===== Handle back/forward =====
  function bindPopState() {
    window.addEventListener('popstate', function (e) {
      if (e.state && e.state.url) {
        loadPage(e.state.url, false);
      }
    });
  }

  // ===== Navigate =====
  function navigate(url) {
    var currentPath = location.pathname.replace(/^\//, '') || location.pathname;
    if (url === currentPath) return;

    history.pushState({ url: url }, '', url);
    loadPage(url, true);
  }

  // ===== Fetch, inject CSS + content, execute scripts =====
  function loadPage(url, pushHistory) {
    var main = document.querySelector(MAIN_SELECTOR);
    if (!main) return;

    isNavigating = true;

    // Phase 1: Fade out, then hide
    main.style.opacity = '0';
    setTimeout(function () {
      main.style.display = 'none';

      fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error('Page not found');
          return res.text();
        })
        .then(function (html) {
          var parser = new DOMParser();
          var doc = parser.parseFromString(html, 'text/html');

          // Step A: Inject CSS first, let browser parse it
          var newStyle = doc.querySelector('style');
          var oldStyle = document.querySelector('style');
          if (newStyle) {
            var cloned = newStyle.cloneNode(true);
            if (oldStyle) oldStyle.parentNode.replaceChild(cloned, oldStyle);
            else document.head.appendChild(cloned);
          }

          // Step B: Wait for CSS to be fully applied before injecting HTML
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              var newMain = doc.querySelector(MAIN_SELECTOR);
              if (!newMain) throw new Error('No main content');

              document.title = doc.title || 'MiniChess';
              updateActiveNav(url);

              // Inject while still hidden
              main.innerHTML = newMain.innerHTML;
              main.scrollTop = 0;

              // Force style recalculation on new DOM
              main.offsetHeight;

              // Reveal
              main.style.opacity = '0';
              main.style.display = '';
              main.offsetHeight;
              requestAnimationFrame(function () {
                main.style.opacity = '1';
                executeScripts(doc);
                isNavigating = false;
              });
            });
          });
        })
        .catch(function (err) {
          console.error('SPA error:', err);
          main.style.display = '';
          main.style.opacity = '1';
          isNavigating = false;
          window.location.href = url;
        });
    }, TRANSITION_MS);
  }

  // ===== Highlight active nav =====
  function updateActiveNav(url) {
    var links = document.querySelectorAll(NAV_SELECTOR);
    for (var i = 0; i < links.length; i++) {
      links[i].classList.remove('active');
    }
    for (var j = 0; j < links.length; j++) {
      var href = links[j].getAttribute('href');
      if (href === url || url.indexOf(href) >= 0) {
        links[j].classList.add('active');
        break;
      }
    }
  }

  // ===== Execute page-specific inline scripts =====
  function executeScripts(doc) {
    var scripts = doc.querySelectorAll('script:not([src])');
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent || scripts[i].innerText || '';
      if (!text.trim()) continue;
      try {
        (0, eval)(text);
      } catch (e) {
        console.error('SPA script error:', e);
      }
    }
  }

  // ===== Start =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();