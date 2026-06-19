// ---- reveal-on-scroll + hero type swap ----
(function () {
  document.documentElement.classList.add('js');

  const io = new IntersectionObserver(
    (es) => {
      for (const e of es)
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
    },
    { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  var swap = document.querySelector('.hero .swap');
  if (!swap) return;
  var typedEl = swap.querySelector('.typed');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    typedEl.textContent = 'intelligence.';
    return;
  }

  function startAnimation() {
    swap.classList.add('typing');

    var fullWidth = swap.offsetWidth;
    function maintain() {
      swap.style.paddingRight = '';
      var gap = fullWidth - swap.offsetWidth;
      if (gap > 0) swap.style.paddingRight = gap + 'px';
    }

    var text = 'machine learning.';
    (function back() {
      text = text.slice(0, -1);
      typedEl.textContent = text || ' ';
      maintain();
      if (text.length) {
        setTimeout(back, 38);
      } else {
        setTimeout(function () {
          typedEl.textContent = '';
          swap.style.paddingRight = '';
          swap.classList.remove('typing');
          new Typed(typedEl, {
            strings: ['intelligence.'],
            typeSpeed: 60,
            startDelay: 0,
            loop: false,
            showCursor: true,
            cursorChar: '|',
          });
        }, 250);
      }
    })();
  }

  var played = false;
  function play() {
    if (played) return;
    played = true;
    window.removeEventListener('scroll', play);
    setTimeout(startAnimation, 300);
  }
  window.addEventListener('scroll', play, { passive: true });
  setTimeout(play, 1800);
})();

// ---- pinned autoresearch-fleet scene + "Read the research" scroll ----
(function () {
  // one pinned scene: the experiments distill into a paper, it fans into a
  // pile, and the §1 text scrolls OVER that same pinned pile
  var fleet = AutoresearchFleet.create('#fleet', {
    sessions: 5,
    clouds: 12,
    vh: 1450, // long enough for §1–§4 to scroll over the papers
    pileCount: 70, // enough papers to keep streaming the whole way
    foreground: '#scene-fg', // §1–§4 scroll together as one foreground
    fgScrollEnd: 0.99, // 0–1: lower stops the scroll earlier (try 0.7 to stop at §3)
  });

  // "Read the research →" can't use a plain #lab anchor: the §1 heading lives
  // inside the pinned, scroll-scrubbed foreground, so it has no fixed document
  // position to jump to. Instead we probe the REAL rendered heading position at
  // two scroll points (forcing a synchronous render at each via fleet.ss.refresh),
  // solve for the scroll offset that lands the heading just under the header,
  // then smooth-scroll there. No hard-coded timeline constants.
  function scrollToResearch() {
    var fleetEl = document.getElementById('fleet');
    var hdg = document.querySelector('#lab h2.sec');
    if (!fleetEl || !hdg || !fleet || !fleet.ss) return;
    var headerOffset = 66; // matches the fleet's headerOffset
    var targetTop = headerOffset + 80; // land the heading comfortably below the header
    var maxY = document.documentElement.scrollHeight - window.innerHeight;
    var total = fleetEl.offsetHeight - (window.innerHeight - headerOffset);
    var sectionTopDoc = fleetEl.getBoundingClientRect().top + window.scrollY;

    var html = document.documentElement;
    var prevBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto'; // probe jumps must be instant
    var startY = window.scrollY;

    function hdgTopAt(y) {
      window.scrollTo(0, Math.max(0, Math.min(y, maxY)));
      fleet.ss.refresh(); // synchronous render at this scroll position
      return hdg.getBoundingClientRect().top;
    }

    // sample two points inside the band where the foreground is visible
    var yA = sectionTopDoc - headerOffset + 0.45 * total;
    var yB = sectionTopDoc - headerOffset + 0.6 * total;
    var tA = hdgTopAt(yA);
    var tB = hdgTopAt(yB);
    var slope = (tB - tA) / (yB - yA || 1);
    var targetY = Math.abs(slope) < 1e-4 ? yB : yA + (targetTop - tA) / slope;
    targetY = Math.max(0, Math.min(targetY, maxY));

    window.scrollTo(0, startY); // restore instantly (no paint happened yet)
    fleet.ss.refresh();
    html.style.scrollBehavior = prevBehavior;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }

  // every link targeting §1 (hero button, nav, footer) uses the same logic
  var researchLinks = document.querySelectorAll('a[href="#lab"]');
  researchLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      scrollToResearch();
    });
  });
})();
