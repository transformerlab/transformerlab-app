/*!
 * autoresearch-fleet.js — scroll-scrubbed "one run becomes many" scene
 * --------------------------------------------------------------------
 * Built on scrollstage.js. The ENTIRE scene is a pure function of scroll
 * progress p ∈ [0,1] — keyframed, deterministic, reversible:
 *
 *   p 0.00–0.16  one run fills in (big, embedded under the text)
 *   p 0.16–0.28  it shrinks and docks as the first session (left)
 *   p 0.18–0.32  the other sessions + the compute clouds appear (empty)
 *   p 0.32–0.96  clouds run jobs; every completed job flies left into its
 *                session and adds one experiment, stepping its descent down
 *
 * Scroll fast → it advances fast. Scroll back → it reverses. No timers, no
 * wall-clock animation. Wordless; the mapping job→session is carried by color.
 *
 * UMD. Depends on the global `ScrollStage` (scrollstage.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd)
    define(['scrollstage'], factory);
  else root.AutoresearchFleet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  var DEFAULTS = {
    sessions: 5,
    clouds: 12,
    tints: ['#0f9a55', '#2f8f74', '#3b6f8c', '#7d8a36', '#a06a2c'],
    cloudSizes: [24, 20, 28, 18, 24, 22, 26, 18, 24, 20, 28, 22],
    trials: [46, 40, 52, 44, 48],
    vh: 820,
    seed: 7,
    headerOffset: 66, // clear the site's sticky header
    foreground: null, // a content element that scrolls OVER the pinned papers (e.g. §1 text)
    fgScrollEnd: 0.99, // progress value (0–1) at which the foreground stops scrolling; lower = stops earlier
    // timeline keyframes (all in progress units)
    // The experiment→paper portion is compressed into the first third of progress
    // (it keeps its original SCROLL length because the scene is now much taller);
    // the remaining two-thirds carry §1 + §2 scrolling up over the papers.
    T: {
      fill: [0, 0.038],
      dock: [0.038, 0.07],
      fade: [0.059, 0.07],
      ses: [0.048, 0.081],
      cloud: [0.07, 0.102],
      flow: [0.097, 0.215],
      shrink: [0.215, 0.269], // the fleet shrinks up into the top portion of the screen
      paper: [0.247, 0.29], // the report appears
      report: [0.269, 0.344], // info distills into it; it writes, revises, gains figures
      fan: [0.333, 0.387], // the paper fans out into the trail
      text: [0.333, 0.99], // foreground scrolls UP over the trail (starts as the trail does)
      loop: [0.9, 0.99], // the LAST paper descends beside §4, shrinking + spinning 360°
    },
    heroTop: 0.4, // hero vertical center as fraction of stage
    jobDur: 0.05,
    doneWin: 0.02,
    pktWin: 0.03, // per-job spans, in progress units
    green: '#0f9a55',
    line2: '#c6c6bc',
    paper: '#fcfcf9',
    faint: '#9a9a90',
    fgBacking: 0.75, // opacity of the paper-colored wash behind the §1/§2 text on narrow screens
    dotColor: '#d2d3c9',
    dotStroke: '#bdbeb3',
    yMin: 0.04,
    yMax: 0.54,
  };

  var STYLE = false;
  function injectStyle(o) {
    if (STYLE || typeof document === 'undefined') return;
    var s = document.createElement('style');
    s.textContent = [
      '.af-wrap{position:relative;height:100%;max-width:1180px;margin:0 auto;padding:0 36px}',
      '.af-fleet{position:absolute;left:36px;right:36px;top:50%;transform:translateY(-50%);height:min(600px,72vh);border:1px solid transparent;border-radius:12px;padding:14px;box-sizing:border-box}',
      '.af-cols{position:relative;height:100%;display:grid;grid-template-columns:330px 1fr;gap:42px;align-items:stretch}',
      '.af-left{display:flex;flex-direction:column;gap:12px;min-width:0;height:100%}',
      '.af-right{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr);gap:12px;min-width:0;height:100%}',
      '.af-session{flex:1;border:1px solid ' +
        o.line2 +
        ';border-radius:8px;background:#fff;padding:10px 12px;display:flex;flex-direction:column;justify-content:center;opacity:0;transform:translateY(14px);transition:opacity .35s ease,transform .35s cubic-bezier(.2,.7,.2,1)}',
      '.af-session.on{opacity:1;transform:none}',
      '.af-schart{display:block;width:100%;height:56px}',
      '.af-cloud{border:1px solid ' +
        o.line2 +
        ';border-radius:8px;background:#fff;padding:8px 10px;display:flex;flex-direction:column;min-height:0;overflow:hidden;opacity:0;transform:translateY(14px);transition:opacity .35s ease,transform .35s cubic-bezier(.2,.7,.2,1)}',
      '.af-cloud.on{opacity:1;transform:none}',
      '.af-cicon{color:' + o.faint + ';opacity:.7}',
      '.af-grid{margin-top:7px;flex:1;display:grid;gap:3px;grid-template-columns:repeat(auto-fill,11px);align-content:center}',
      '.af-gpu{width:11px;height:11px;border-radius:2px;background:' +
        o.paper +
        ';border:1px solid ' +
        o.line2 +
        '}',
      '.af-gpu.run{transform:scale(1.16)}',
      '.af-packets{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:6}',
      '.af-flows{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:6}',
      '.af-hero{position:absolute;left:50%;top:' +
        o.heroTop * 100 +
        '%;width:clamp(560px,54vw,860px);transform:translate(-50%,-50%);z-index:7;will-change:transform,opacity;border:1px solid ' +
        o.line2 +
        ';background:#fff;border-radius:10px;padding:28px;box-shadow:0 8px 30px rgba(40,40,30,.06)}',
      '.af-hero svg{display:block;width:100%;height:auto}',
      '.af-report{position:absolute;left:50%;top:74%;transform:translate(-50%,-50%);width:158px;height:206px;opacity:0;z-index:8}',
      '.af-pfront{position:absolute;left:0;top:0;width:158px;height:206px;border:1px solid ' +
        o.line2 +
        ';border-radius:6px;background:#fff;overflow:hidden;z-index:0;box-shadow:0 6px 20px rgba(40,40,30,.06)}',
      '.af-paper{position:absolute;inset:0;width:100%;height:100%}',
      '.af-fg{position:absolute;left:50%;top:0;width:min(1040px,92%);padding:0 36px;box-sizing:border-box;z-index:9;opacity:0;will-change:transform}',
      // no wash on desktop — the text reads directly over the papers. Only narrow
      // widths get a light paper-colored backing for legibility (half opacity).
      '.af-fg>*{position:relative;z-index:1}',
      "@media (max-width:900px){.af-fg::before{content:'';position:absolute;left:-30px;right:-30px;top:-26px;bottom:-26px;z-index:0;border-radius:12px;background:rgba(252,252,249," +
        o.fgBacking +
        ')}}',
      '.af-stack{position:absolute;inset:0;pointer-events:none;z-index:7}',
      '.af-pcopy{position:absolute;width:158px;height:206px;margin:-103px 0 0 -79px;border:1px solid ' +
        o.line2 +
        ';border-radius:6px;background:linear-gradient(#fff 0 30px,rgba(255,255,255,0) 30px),repeating-linear-gradient(180deg,#d8d8cf 0 2px,#fff 2px 9px);opacity:0}',
      // §4 finale: once the last paper lands it spins forever (the wrapper holds
      // its position/scale; this only animates rotation, so nothing conflicts)
      '@keyframes af-spin{to{transform:rotate(360deg)}}',
      '.af-spin-on{animation:af-spin 8s linear infinite}',
      '@media (max-width:860px){.af-cols{grid-template-columns:1fr;gap:18px}.af-right{grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr)}.af-wrap{padding:0 22px}.af-hero{width:88%;padding:20px}}',
    ].join('');
    document.head.appendChild(s);
    STYLE = true;
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function smooth(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }
  function ease(x, a, b) {
    return smooth((x - a) / (b - a || 1e-6));
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function elh(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  var CLOUD_ICON =
    '<svg class="af-cicon" width="15" height="13" viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 16h11a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.7-1.3A3.8 3.8 0 0 0 6 16z"/></svg>';

  // ---- incremental best-so-far descent, rendered by count ----
  function Descent(host, o, opt) {
    this.o = o;
    this.K = opt.K;
    this.tint = opt.tint;
    this.W = opt.w;
    this.H = opt.h;
    this.dotR = opt.dotR;
    this.lineW = opt.lineW;
    this.padL = opt.padL;
    this.padR = opt.padR;
    this.padT = opt.padT;
    this.padB = opt.padB;
    var rnd = rng(opt.seed),
      start = 0.42,
      end = 0.075,
      worst = 0.52;
    this.trials = [];
    this.mins = [];
    var m = Infinity;
    for (var i = 0; i < this.K; i++) {
      var f = i / (this.K - 1),
        env = end + (start - end) * Math.exp(-3 * f),
        y;
      if (rnd() < 0.3) y = env + Math.pow(rnd(), 0.8) * (worst - env);
      else y = env + Math.pow(rnd(), 1.7) * 0.045;
      this.trials.push(y);
      m = Math.min(m, y);
      this.mins.push(m);
    }
    this._svg = svg('svg', {
      class: opt.cls || '',
      viewBox: '0 0 ' + this.W + ' ' + this.H,
      preserveAspectRatio: 'none',
    });
    this.dotsG = svg('g', {});
    this._svg.appendChild(this.dotsG);
    this.line = svg('path', {
      fill: 'none',
      stroke: this.tint,
      'stroke-width': this.lineW,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    });
    this._svg.appendChild(this.line);
    this.lead = svg('circle', {
      r: this.dotR * 1.5,
      fill: this.tint,
      opacity: 0,
    });
    this._svg.appendChild(this.lead);
    this.dots = [];
    for (var k = 0; k < this.K; k++) {
      var d = svg('circle', {
        cx: this._x(k),
        cy: this._y(this.trials[k]),
        r: this.dotR,
        fill: o.dotColor,
        stroke: o.dotStroke,
        'stroke-width': 0.7,
        opacity: 0,
      });
      this.dotsG.appendChild(d);
      this.dots.push(d);
    }
    this._n = -1;
    host.appendChild(this._svg);
  }
  Descent.prototype._x = function (i) {
    return this.padL + (i / (this.K - 1)) * (this.W - this.padL - this.padR);
  };
  Descent.prototype._y = function (v) {
    var o = this.o;
    return (
      this.padT +
      ((o.yMax - v) / (o.yMax - o.yMin)) * (this.H - this.padT - this.padB)
    );
  };
  Descent.prototype.setCount = function (n) {
    n = clamp(n | 0, 0, this.K);
    if (n === this._n) return;
    this._n = n;
    for (var k = 0; k < this.K; k++)
      this.dots[k].setAttribute('opacity', k < n ? 1 : 0);
    if (n <= 0) {
      this.line.setAttribute('d', '');
      this.lead.setAttribute('opacity', 0);
      return;
    }
    var d = 'M ' + this._x(0) + ' ' + this._y(this.mins[0]);
    for (var j = 1; j < n; j++)
      d += ' H ' + this._x(j) + ' V ' + this._y(this.mins[j]);
    this.line.setAttribute('d', d);
    this.lead.setAttribute('cx', this._x(n - 1));
    this.lead.setAttribute('cy', this._y(this.mins[n - 1]));
    this.lead.setAttribute('opacity', 1);
  };

  function Fleet(container, options) {
    var o = (this.o = Object.assign({}, DEFAULTS, options || {}));
    o.T = Object.assign({}, DEFAULTS.T, o.T || {});
    o.T.text = [o.T.text[0], o.fgScrollEnd];
    o.T.loop = [o.T.loop[0], o.fgScrollEnd];
    if (typeof ScrollStage === 'undefined' && typeof window !== 'undefined')
      throw new Error('autoresearch-fleet needs scrollstage.js');
    injectStyle(o);
    this._build(container);
    this._schedule();
    this._active = {};
    var self = this;
    this.ss = ScrollStage.create(container, {
      vh: o.vh,
      top: o.headerOffset,
      render: function (p, u) {
        self._render(p, u);
      },
    });
    this.ss.stage.appendChild(this.wrap); // mount built DOM into the sticky stage

    // foreground: content that scrolls OVER the pinned papers (e.g. the §1 text)
    if (o.foreground) {
      var fgEl =
        typeof o.foreground === 'string'
          ? document.querySelector(o.foreground)
          : o.foreground;
      if (fgEl) {
        var rev = fgEl.querySelectorAll ? fgEl.querySelectorAll('.reveal') : [];
        for (var ri = 0; ri < rev.length; ri++) rev[ri].classList.add('in');
        this.fg = elh('div', 'af-fg');
        this.fg.appendChild(fgEl);
        this.wrap.appendChild(this.fg);
        // each publication row pulls a paper out of the stack as it scrolls in
        var rows = this.fg.querySelectorAll('.pub-row');
        this.pubRows = [];
        for (var pi = 0; pi < rows.length; pi++) {
          this.pubRows.push({
            row: rows[pi],
            fig: rows[pi].querySelector('.pub-fig'),
            info: rows[pi].querySelector('.pub-info'),
          });
        }
        // §4 finale: the LAST paper in the trail descends into this slot beside
        // the section, shrinking and spinning a full turn. Reserve that paper so
        // the streaming trail and the publications never claim it.
        this.loopFig = this.fg.querySelector('#loop .loop-fig');
        this.loopPaper =
          this.loopFig && this.pile && this.pile.length
            ? this.pile[this.pile.length - 1]
            : null;
        // Wrap it: the OUTER wrapper carries translate + scale (position/size),
        // the INNER paper carries rotation. Nesting keeps "spin in place at the
        // landing spot" correct and lets a CSS animation own the perpetual spin
        // without clobbering the JS-driven position.
        if (this.loopPaper) {
          var lpEl = this.loopPaper.el;
          var lw = document.createElement('div');
          lw.style.cssText =
            'position:absolute;left:0;top:0;width:158px;height:206px;transform-origin:50% 50%;will-change:transform';
          lpEl.parentNode.insertBefore(lw, lpEl);
          lw.appendChild(lpEl);
          this.loopWrap = lw;
        }
      }
    }
    this.ss.refresh();
  }

  Fleet.prototype._build = function (container) {
    var o = this.o;
    this.wrap = elh('div', 'af-wrap');
    this.fleet = elh('div', 'af-fleet');
    var cols = elh('div', 'af-cols');
    this.colsEl = cols;
    var left = elh('div', 'af-left'),
      right = elh('div', 'af-right');
    cols.appendChild(left);
    cols.appendChild(right);
    this.fleet.appendChild(cols);
    this.wrap.appendChild(this.fleet);

    this.sessions = [];
    for (var i = 0; i < o.sessions; i++) {
      var tint = o.tints[i % o.tints.length];
      var card = elh('div', 'af-session');
      left.appendChild(card);
      var dsc = new Descent(card, o, {
        K: o.trials[i % o.trials.length],
        tint: tint,
        seed: 101 + i * 13,
        w: 300,
        h: 56,
        dotR: 1.9,
        lineW: 2,
        padL: 6,
        padR: 6,
        padT: 6,
        padB: 6,
        cls: 'af-schart',
      });
      this.sessions.push({ el: card, tint: tint, dsc: dsc, on: false });
    }
    // slot 0 is occupied by the docked hero and never reveals its own card, so
    // clear its pre-reveal translateY(14px) — otherwise the hero would dock onto
    // a slot rect that sits ~14px too low.
    this.sessions[0].el.style.transform = 'none';
    this.cells = [];
    this.clouds = [];
    for (var c = 0; c < o.clouds; c++) {
      var n = o.cloudSizes[c % o.cloudSizes.length];
      var cl = elh(
        'div',
        'af-cloud',
        CLOUD_ICON + '<div class="af-grid"></div>',
      );
      var grid = cl.querySelector('.af-grid'),
        cells = [];
      for (var k = 0; k < n; k++) {
        var cell = elh('div', 'af-gpu');
        grid.appendChild(cell);
        cells.push(cell);
        this.cells.push(cell);
      }
      right.appendChild(cl);
      this.clouds.push({ el: cl, cells: cells, on: false });
    }
    this.packets = svg('svg', { class: 'af-packets' });
    this.wrap.appendChild(this.packets);

    // flow-line layer: streams that distill the research down into the report
    this.flowSvg = svg('svg', { class: 'af-flows' });
    this.flows = [];
    for (var fi = 0; fi < this.sessions.length; fi++) {
      var fp = svg('path', {
        fill: 'none',
        stroke: this.sessions[fi].tint,
        'stroke-width': 1.7,
        'stroke-linecap': 'round',
        'stroke-dasharray': '5 8',
        opacity: 0,
      });
      this.flowSvg.appendChild(fp);
      this.flows.push(fp);
    }
    this.wrap.appendChild(this.flowSvg);

    this.hero = elh('div', 'af-hero');
    this.heroDsc = new Descent(this.hero, o, {
      K: o.trials[0],
      tint: o.green,
      seed: 101,
      w: 720,
      h: 286,
      dotR: 3.2,
      lineW: 2.8,
      padL: 8,
      padR: 8,
      padT: 8,
      padB: 8,
    });
    this.wrap.appendChild(this.hero);

    this._buildReport();
  };

  // ---- the final paper: a page that writes itself, revises, and gains figures ----
  Fleet.prototype._buildReport = function () {
    var o = this.o,
      self = this,
      PW = 300,
      PH = 392;
    this.PW = PW;
    this.PH = PH; // ~ box aspect
    var rep = elh('div', 'af-report');
    this.report = rep;
    var s = svg('svg', {
      class: 'af-paper',
      viewBox: '0 0 ' + PW + ' ' + PH,
      preserveAspectRatio: 'none',
    });
    this.paper = s;
    var titleC = '#b6b6ad',
      textC = '#d2d2c9'; // faded greys — a caricature of a paper, no black
    this.lines = [];
    this.figs = [];
    var order = 0;
    function add(x, y, w, h, fill) {
      var r = svg('rect', {
        x: x,
        y: y,
        width: 0,
        height: h,
        rx: h / 2,
        fill: fill,
      });
      s.appendChild(r);
      var L = { el: r, x: x, y: y, w: w, w2: w, order: order++, rev: null };
      self.lines.push(L);
      return L;
    }
    var R = rng(o.seed + 5),
      x = 34,
      w0 = PW - 68;
    // title: a couple of thick centered bars + a short subtitle
    add(PW / 2 - 96, 34, 192, 13, titleC);
    add(PW / 2 - 64, 56, 128, 13, titleC);
    add(PW / 2 - 34, 78, 68, 7, textC);
    // body: a few thick grey lines, with two figures dropped in
    var y = 104;
    for (var i = 0; i < 7; i++) {
      var w = i % 3 === 2 ? w0 * (0.4 + 0.2 * R()) : w0 * (0.82 + 0.18 * R());
      add(x, y, w, 8, textC);
      y += 17;
      if (i === 2) {
        self._addFigure(s, x, y, w0, 82, { type: 'descent', addAt: 0.44 });
        y += 82 + 12;
      }
      if (i === 5) {
        self._addFigure(s, x, y, w0, 48, { type: 'bars', addAt: 0.64 });
        y += 48 + 10;
      }
    }
    // a couple of body lines get deleted & rewritten
    var body = this.lines.filter(function (L) {
      return L.order > 3;
    });
    for (var r = 0; r < 2 && r < body.length; r++) {
      var L = body[Math.floor(body.length * 0.4) + r];
      var d = 0.5 + r * 0.04;
      L.rev = { del: d, rew: d + 0.08 };
      L.w2 = L.w * (0.55 + 0.4 * R());
    }

    // ONE growing trail. The distilled paper (front) is the HEAD; varied copies
    // of it stream out behind it one at a time as you scroll. Each paper sits at
    // a fixed point on a cumulative curve: it starts straight under the original,
    // bulges down-and-right, then settles into a straight vertical column. The
    // whole trail just scrolls up with the page (see _renderMultiply).
    this.pile = [];
    var R2 = rng(o.seed + 12),
      pileN = o.pileCount || 44;
    var STEP = 30, // px between consecutive papers along the trail
      A0 = (64 * Math.PI) / 180, // peak angle off vertical at the crest of the bend
      KBEND = 16; // papers over which the bend swells and then settles
    this.trailStep = STEP;
    this.trailX = [0]; // index 0 = the front paper (the head)
    this.trailY = [0];
    var cx = 0,
      cy = 0;
    for (var pc = 1; pc < pileN; pc++) {
      // angle swells 0 → peak → 0: the first paper sits straight under the
      // original, the trail bulges down-and-right, then settles into a straight
      // vertical column.
      var t = clamp((pc - 1) / KBEND, 0, 1);
      var ang = A0 * Math.sin(t * Math.PI);
      cx += STEP * Math.sin(ang);
      cy += STEP * Math.cos(ang);
      this.trailX.push(cx);
      this.trailY.push(cy);
      var cp = elh('div', 'af-pcopy');
      cp.style.cssText =
        'position:absolute;margin:0;left:0;top:0;width:158px;height:206px;background:#fff;overflow:hidden;z-index:' +
        pc +
        ';opacity:0;transform-origin:50% 50%;will-change:transform,opacity';
      cp.appendChild(paperSVG(o, o.seed + 200 + pc * 7)); // a varied copy of the paper
      rep.appendChild(cp);
      var ramp = clamp((pc - 1) / 3, 0, 1); // ease the shuffle in over the first few
      var wob = (R2() - 0.5) * 7 * ramp;
      this.pile.push({
        el: cp,
        k: pc,
        rot: ((ang * 180) / Math.PI) * 0.42 + wob,
      });
    }
    this.front = elh('div', 'af-pfront');
    var front = this.front;
    front.appendChild(s);
    rep.appendChild(front);
    this.wrap.appendChild(rep);
  };

  // shared figure renderer (used animated by the scene, static by paperStack)
  function drawFigure(s, x, y, w, h, type, o, seed) {
    var g = svg('g', { opacity: 0 });
    g.appendChild(
      svg('rect', {
        x: x,
        y: y,
        width: w,
        height: h,
        rx: 2,
        fill: '#fcfcf9',
        stroke: '#e4e4dc',
        'stroke-width': 1,
      }),
    );
    g.appendChild(
      svg('rect', {
        x: x + w * 0.12,
        y: y + h + 4,
        width: w * 0.76,
        height: 2.4,
        rx: 1,
        fill: '#cfcfc6',
      }),
    );
    var pad = 9,
      px = x + pad,
      py = y + pad,
      pw = w - 2 * pad,
      ph = h - 2 * pad,
      rnd = rng(seed);
    if (type === 'descent') {
      var d = 'M ' + px + ' ' + (py + ph * 0.1),
        pts = 6;
      for (var i = 1; i <= pts; i++) {
        d +=
          ' H ' +
          (px + pw * (i / pts)).toFixed(1) +
          ' V ' +
          (py + ph * (0.1 + 0.74 * (i / pts))).toFixed(1);
      }
      for (var k = 0; k < 11; k++)
        g.appendChild(
          svg('circle', {
            cx: (px + pw * rnd()).toFixed(1),
            cy: (py + ph * (0.08 + 0.84 * rnd())).toFixed(1),
            r: 1.1,
            fill: '#d2d3c9',
          }),
        );
      g.appendChild(
        svg('path', {
          d: d,
          fill: 'none',
          stroke: o.green,
          'stroke-width': 1.5,
          'stroke-linejoin': 'round',
        }),
      );
    } else {
      var bw = pw / 6;
      for (var b = 0; b < 6; b++) {
        var bh = ph * (0.32 + 0.62 * (((b * 7) % 5) / 5));
        g.appendChild(
          svg('rect', {
            x: (px + b * bw + 1).toFixed(1),
            y: (py + ph - bh).toFixed(1),
            width: (bw - 2).toFixed(1),
            height: bh.toFixed(1),
            rx: 1,
            fill: b % 2 ? o.green : '#c2cad2',
          }),
        );
      }
    }
    s.appendChild(g);
    return g;
  }

  // a single fully-written caricature paper (static), as a positioned div
  function staticPaper(o) {
    var el = document.createElement('div');
    el.className = 'af-pcopy';
    el.style.cssText =
      'position:absolute;margin:0;width:158px;height:206px;background:#fff';
    var PW = 300,
      PH = 392,
      s = svg('svg', {
        viewBox: '0 0 ' + PW + ' ' + PH,
        preserveAspectRatio: 'none',
      });
    s.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    var titleC = '#b6b6ad',
      textC = '#d2d2c9',
      R = rng(o.seed + 5);
    function bar(x, y, w, h, f) {
      s.appendChild(
        svg('rect', { x: x, y: y, width: w, height: h, rx: h / 2, fill: f }),
      );
    }
    bar(PW / 2 - 96, 34, 192, 13, titleC);
    bar(PW / 2 - 64, 56, 128, 13, titleC);
    bar(PW / 2 - 34, 78, 68, 7, textC);
    var x = 34,
      w0 = PW - 68,
      y = 104;
    for (var i = 0; i < 7; i++) {
      var w = i % 3 === 2 ? w0 * (0.4 + 0.2 * R()) : w0 * (0.82 + 0.18 * R());
      bar(x, y, w, 8, textC);
      y += 17;
      if (i === 2) {
        drawFigure(s, x, y, w0, 82, 'descent', o, o.seed + 30).setAttribute(
          'opacity',
          1,
        );
        y += 82 + 12;
      }
      if (i === 5) {
        drawFigure(s, x, y, w0, 48, 'bars', o, o.seed + 31).setAttribute(
          'opacity',
          1,
        );
        y += 48 + 10;
      }
    }
    el.appendChild(s);
    return el;
  }

  // an algorithmically-varied caricature of the distilled paper: title bars, a
  // varied number of body lines, and sometimes one or two figures. Each `seed`
  // yields a different but same-family layout. Returns an <svg> that fills its
  // parent .af-pcopy.
  function paperSVG(o, seed) {
    var PW = 300,
      PH = 392,
      s = svg('svg', {
        viewBox: '0 0 ' + PW + ' ' + PH,
        preserveAspectRatio: 'none',
      });
    s.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    var titleC = '#b6b6ad',
      textC = '#d2d2c9',
      R = rng(seed),
      og = Object.assign({}, o, { green: '#b3b3aa' }); // figures stay grey/white, no green
    function bar(x, y, w, h, f) {
      s.appendChild(
        svg('rect', { x: x, y: y, width: w, height: h, rx: h / 2, fill: f }),
      );
    }
    // title: one or two thick centered bars + a short subtitle
    var tw = 150 + R() * 60,
      y = 56;
    bar(PW / 2 - tw / 2, 34, tw, 13, titleC);
    if (R() < 0.7) {
      var tw2 = 96 + R() * 64;
      bar(PW / 2 - tw2 / 2, y, tw2, 13, titleC);
      y += 22;
    }
    var sw = 52 + R() * 48;
    bar(PW / 2 - sw / 2, y, sw, 7, textC);
    // body: a varied number of lines with 0–2 figures dropped in at random rows
    var x = 34,
      w0 = PW - 68;
    y = Math.max(y + 22, 104);
    var nLines = 6 + Math.floor(R() * 5), // 6..10
      nFig = R() < 0.22 ? 0 : R() < 0.74 ? 1 : 2, // mostly one figure
      figRows = [];
    while (figRows.length < nFig) {
      var fr = 1 + Math.floor(R() * (nLines - 1));
      if (figRows.indexOf(fr) < 0) figRows.push(fr);
    }
    for (var i = 0; i < nLines && y < PH - 22; i++) {
      var w = i % 3 === 2 ? w0 * (0.4 + 0.22 * R()) : w0 * (0.76 + 0.22 * R());
      bar(x, y, w, 8, textC);
      y += 17;
      if (figRows.indexOf(i) >= 0 && y < PH - 70) {
        var type = R() < 0.55 ? 'descent' : 'bars',
          fh = type === 'descent' ? 70 + R() * 24 : 42 + R() * 16;
        drawFigure(s, x, y, w0, fh, type, og, seed + 31 + i).setAttribute(
          'opacity',
          1,
        );
        y += fh + 12;
      }
    }
    return s;
  }

  // a static diagonal cascade of papers — the persistent "dozens of papers" image
  function paperStack(container, opts) {
    opts = opts || {};
    var o = Object.assign({}, DEFAULTS, opts);
    injectStyle(o);
    var host =
      typeof container === 'string'
        ? document.querySelector(container)
        : container;
    if (!host) return { reveal: function () {} };
    host.innerHTML = '';
    var count = opts.count || 16,
      dy = opts.dy || 15,
      R = rng(o.seed + 12);
    // every copy starts hidden behind the top paper and slides out into a shuffled
    // pile below it — no fade; papers literally come out from under the first paper
    var copies = [];
    for (var i = 1; i < count; i++) {
      var c = document.createElement('div');
      c.className = 'af-pcopy';
      c.style.cssText =
        'position:absolute;margin:0;left:0;top:0;z-index:' +
        (60 - i) +
        ';opacity:1;transform-origin:50% 30%;transform:translate(0,0)';
      host.appendChild(c);
      copies.push({
        el: c,
        i: i,
        tx: i * 7 + (R() - 0.5) * 30, // drift across + shuffle
        ty: i * dy + (R() - 0.5) * 9, // cascade down + shuffle
        rot: (R() - 0.5) * 10, // shuffled rotation
      });
    }
    var front = staticPaper(o);
    front.style.left = '0px';
    front.style.top = '0px';
    front.style.zIndex = '61';
    host.appendChild(front);
    return {
      el: host,
      // slide the pile out as t goes 0 → 1 (papers emerge from under the top paper)
      reveal: function (t) {
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        for (var k = 0; k < copies.length; k++) {
          var cc = copies[k],
            thr = ((cc.i - 1) / (count - 1)) * 0.85,
            a = (t - thr) / 0.13;
          a = a < 0 ? 0 : a > 1 ? 1 : a;
          a = a * a * (3 - 2 * a);
          cc.el.style.transform =
            'translate(' +
            (a * cc.tx).toFixed(1) +
            'px,' +
            (a * cc.ty).toFixed(1) +
            'px) rotate(' +
            (a * cc.rot).toFixed(2) +
            'deg)';
        }
      },
    };
  }

  Fleet.prototype._addFigure = function (s, x, y, w, h, fig) {
    var g = drawFigure(
      s,
      x,
      y,
      w,
      h,
      fig.type,
      this.o,
      this.o.seed + 9 + Math.round(y),
    );
    this.figs.push({ g: g, addAt: fig.addAt });
  };

  // deterministic job schedule: every job has a complete-progress, a node, and a tint
  Fleet.prototype._schedule = function () {
    var o = this.o,
      rnd = rng(o.seed + 1);
    var list = [];
    for (var i = 1; i < this.sessions.length; i++) {
      var K = this.sessions[i].dsc.K;
      for (var k = 0; k < K; k++) list.push(i);
    }
    // deterministic shuffle so sessions interleave
    for (var a = list.length - 1; a > 0; a--) {
      var b = (rnd() * (a + 1)) | 0;
      var t = list[a];
      list[a] = list[b];
      list[b] = t;
    }
    var M = list.length,
      F0 = o.T.flow[0],
      F1 = o.T.flow[1];
    var freeAt = new Array(this.cells.length).fill(-1);
    this.jobs = [];
    for (var j = 0; j < M; j++) {
      var c = F0 + (F1 - F0) * (j / Math.max(1, M - 1));
      var d = c - o.jobDur;
      // greedy: a node that's free by dispatch time, else the soonest-free one
      var pick = -1,
        soonest = Infinity;
      var startCell = (rnd() * this.cells.length) | 0;
      for (var s = 0; s < this.cells.length; s++) {
        var ci = (startCell + s) % this.cells.length;
        if (freeAt[ci] <= d) {
          pick = ci;
          break;
        }
        if (freeAt[ci] < soonest) {
          soonest = freeAt[ci];
          pick = ci;
        }
      }
      freeAt[pick] = c + o.doneWin;
      this.jobs.push({ i: list[j], cell: pick, c: c, d: d });
    }
  };

  Fleet.prototype._render = function (p, u) {
    var o = this.o,
      T = o.T;

    // ---- hero: starts ~half-drawn (so it's never a blank box on the way in),
    //      finishes filling, then shrinks + docks + fades ----
    this.heroDsc.setCount(
      Math.round(
        this.heroDsc.K * (0.5 + 0.5 * u.ease(p, T.fill[0], T.fill[1])),
      ),
    );
    var wr = this.wrap.getBoundingClientRect();
    var heroW = this.hero.offsetWidth || 540,
      heroH = this.hero.offsetHeight || 300;
    var hcx = wr.left + wr.width * 0.5,
      hcy = wr.top + wr.height * o.heroTop;
    var slotR = this.sessions[0].el.getBoundingClientRect();
    var dk = u.ease(p, T.dock[0], T.dock[1]);
    // non-uniform scale so the docked hero matches the slot exactly (same height
    // as the other four blocks), not just its width
    var scaleX = lerp(1, (slotR.width || 300) / heroW, dk);
    var scaleY = lerp(1, (slotR.height || 100) / heroH, dk);
    var tx = lerp(0, slotR.left + slotR.width / 2 - hcx, dk);
    var ty = lerp(0, slotR.top + slotR.height / 2 - hcy, dk);
    this.hero.style.transform =
      'translate(-50%,-50%) translate(' +
      tx +
      'px,' +
      ty +
      'px) scale(' +
      scaleX +
      ',' +
      scaleY +
      ')';
    // compensate stroke-width for the CSS scale: at dk=1 the 720-wide SVG is
    // squashed to slot width, so we need 2×720/300=4.8 to match the other sessions' visual weight of 2
    this.heroDsc.line.setAttribute(
      'stroke-width',
      lerp(2.8, 4.8, dk).toFixed(2),
    );
    // compensate border-width: CSS transform scales the 1px border down with the
    // element, making it hairline-thin when docked. Divide by scaleX so the visual
    // border always renders at 1px, matching the other session cards.
    this.hero.style.borderWidth =
      (1 / Math.max(scaleX, 0.01)).toFixed(2) + 'px';
    // the hero IS the top session block now: it docks into slot 0 and stays
    // (tracking the slot through the shrink). No early cross-dissolve — it only
    // recedes later, together with the whole fleet at the closing.
    this.hero.style.opacity = (1 - u.ease(p, T.fan[0], T.fan[1])).toFixed(3);

    // ---- reveal sessions + clouds ----
    var nS = this.sessions.length,
      nC = this.clouds.length;
    this.sessions.forEach(function (s, i) {
      // slot 0 is occupied by the docked hero, so session 0 never reveals its own
      // card — that card fading in behind the hero was the dissolve we don't want.
      var on = i > 0 && p > lerp(T.ses[0], T.ses[1], i / Math.max(1, nS - 1));
      if (on !== s.on) {
        s.on = on;
        s.el.classList.toggle('on', on);
      }
    });
    this.clouds.forEach(function (cl, i) {
      var on = p > lerp(T.cloud[0], T.cloud[1], i / Math.max(1, nC - 1));
      if (on !== cl.on) {
        cl.on = on;
        cl.el.classList.toggle('on', on);
      }
    });

    // ---- jobs: node states, session fills, packets — all derived from p ----
    var counts = new Array(nS).fill(0);
    var nextActive = {};
    var flying = [];
    for (var j = 0; j < this.jobs.length; j++) {
      var job = this.jobs[j];
      if (p >= job.c) {
        counts[job.i]++;
        if (p < job.c + o.doneWin)
          nextActive[job.cell] = {
            st: 'done',
            tint: this.sessions[job.i].tint,
          };
        if (p < job.c + o.pktWin) flying.push(job);
      } else if (p >= job.d) {
        nextActive[job.cell] = { st: 'run', tint: this.sessions[job.i].tint };
      }
    }
    counts[0] = this.sessions[0].on ? this.heroDsc.K : 0; // session 0 = the completed intro run
    for (var si = 0; si < nS; si++) this.sessions[si].dsc.setCount(counts[si]);

    // node cells: only touch what changed
    var prev = this._active;
    for (var key in prev) {
      if (!nextActive[key]) {
        var cc = this.cells[key];
        cc.className = 'af-gpu';
        cc.style.background = '';
        cc.style.borderColor = '';
      }
    }
    for (var k2 in nextActive) {
      var st = nextActive[k2],
        cell = this.cells[k2];
      if (st.st === 'run') {
        cell.className = 'af-gpu run';
        cell.style.background = st.tint;
        cell.style.borderColor = st.tint;
      } else {
        var f = this._fade(st.tint);
        cell.className = 'af-gpu done';
        cell.style.background = f;
        cell.style.borderColor = f;
      }
    }
    this._active = nextActive;

    // packets: finished experiments flying node → session
    this._drawPackets(flying, p, u);

    // ---- closing act: surround the fleet, coalesce into a page, write the paper ----
    this._renderReport(p, u);
  };

  Fleet.prototype._renderReport = function (p, u) {
    var o = this.o,
      T = o.T,
      rep = this.report;

    // shrink the whole experiments box up into the top portion (it stays visible)
    var sp = ease(p, T.shrink[0], T.shrink[1]);
    var stageH = window.innerHeight - o.headerOffset;
    var sc = 1 - sp * 0.42; // → ~0.58
    var dy = -sp * 0.21 * stageH; // drift up, leaving room for the report below
    this.fleet.style.transform =
      'translateY(-50%) translateY(' +
      dy.toFixed(1) +
      'px) scale(' +
      sc.toFixed(3) +
      ')';
    this.fleet.style.borderColor = 'rgba(198,198,188,' + sp.toFixed(3) + ')';
    this.fleet.style.opacity = (1 - sp * 0.08).toFixed(3);

    // the small report appears at the bottom
    var pa = ease(p, T.paper[0], T.paper[1]);
    rep.style.opacity = pa.toFixed(3);

    // write / revise / illustrate — all a function of progress through the report phase
    var rp = u.sub(p, T.report[0], T.report[1]),
      N = this.lines.length;
    for (var i = 0; i < N; i++) this._setLine(this.lines[i], rp, N);
    for (var k = 0; k < this.figs.length; k++) {
      var F = this.figs[k],
        a = ease(rp, F.addAt, F.addAt + 0.05);
      F.g.setAttribute('opacity', a.toFixed(3));
      F.g.setAttribute(
        'transform',
        'translate(0,' + ((1 - a) * 7).toFixed(1) + ')',
      );
    }

    // distill: flow lines streaming from the experiments box down into the report
    this._renderFlows(rp, pa);

    // closing: research fades back; the paper replicates into a diagonal cascade
    this._renderMultiply(p, u);
  };

  Fleet.prototype._renderMultiply = function (p, u) {
    var o = this.o,
      T = o.T;
    var H = window.innerHeight - o.headerOffset;

    // the experiments box + distill lines recede as the closing begins
    var fan = ease(p, T.fan[0], T.fan[1]);
    this.fleet.style.opacity = (
      parseFloat(this.fleet.style.opacity || '1') *
      (1 - fan * 0.97)
    ).toFixed(3);
    for (var fi = 0; fi < this.flows.length; fi++)
      this.flows[fi].setAttribute(
        'opacity',
        (
          parseFloat(this.flows[fi].getAttribute('opacity') || 0) *
          (1 - fan)
        ).toFixed(3),
      );

    // THE TRAIL — a pure function of scroll. Every paper has a FIXED page slot
    // (trailX[k], trailY[k]); the whole trail just scrolls up uniformly by `S`,
    // exactly like page content. A paper surfaces at its slot under the previous
    // one, then rides straight up — it never drifts sideways.
    var tr = clamp((p - T.fan[0]) / (1 - T.fan[0]), 0, 1);
    var N = this.pile.length,
      SPAN = N + 16, // scroll past the end so the whole trail clears the top
      lead = tr * SPAN,
      STEP = this.trailStep,
      S = lead * STEP, // global upward scroll, in px
      spawnY = 0.74 * H; // report origin (matches .af-report top:74%)

    // publications: decide which live stream paper each row pulls out, and where
    var pubs = this._planPubs(H, lead, S, spawnY);

    if (this.front) {
      // the distilled paper is the head (slot 0,0); it just scrolls up too
      this.front.style.transform = 'translate(0px,' + (-S).toFixed(1) + 'px)';
      this.front.style.opacity = clamp((spawnY - S) / 90, 0, 1).toFixed(3);
    }
    for (var i = 0; i < N; i++) {
      var pl = this.pile[i],
        k = pl.k;

      // the §4 finale paper is driven entirely by _renderLoopPaper
      if (this.loopPaper && pl === this.loopPaper) continue;

      // a feature paper: lerp from its stream slot out to its publication slot,
      // leaving its stream slot empty (the gap). It then rides with the row.
      var fj = pubs.featByK[k];
      if (fj !== undefined) {
        var pu = pubs.pull[fj],
          a = pu.a;
        var fx = lerp(this.trailX[k], pu.tx, a),
          fy = lerp(this.trailY[k] - S, pu.ty, a);
        pl.el.style.transform =
          'translate(' +
          fx.toFixed(1) +
          'px,' +
          fy.toFixed(1) +
          'px) rotate(' +
          lerp(pl.rot, 0, a).toFixed(2) +
          'deg) scale(' +
          lerp(1, pu.sc, a).toFixed(3) +
          ')';
        pl.el.style.opacity = '1';
        pl.el.style.zIndex = '60';
        pl.el.style.boxShadow =
          a > 0.05 ? '0 10px 26px rgba(40,40,30,.14)' : '';
        continue;
      }
      // released back to the stream → restore its normal stacking
      if (pl.el.style.zIndex === '60') {
        pl.el.style.zIndex = String(k);
        pl.el.style.boxShadow = '';
      }

      if (lead < k - 1) {
        pl.el.style.opacity = '0';
        continue;
      } // not surfaced yet
      var x = this.trailX[k],
        y = this.trailY[k] - S; // fixed x; only y scrolls
      var born = clamp(lead - k + 1, 0, 1);
      born = born * born * (3 - 2 * born); // ease the surfacing
      var fadeUp = clamp((spawnY + y) / 90, 0, 1); // fade as it nears the top edge
      pl.el.style.transform =
        'translate(' +
        x.toFixed(1) +
        'px,' +
        y.toFixed(1) +
        'px) rotate(' +
        pl.rot.toFixed(2) +
        'deg)';
      pl.el.style.opacity = (born * fadeUp * 0.82).toFixed(3);
    }

    // TEXT: the §1 + §2 content scrolls UP over the trail of papers.
    var tp = ease(p, T.text[0], T.text[1]);
    if (this.fg) {
      if (tp <= 0.001) {
        this.fg.style.opacity = '0';
      } else {
        this.fg.style.opacity = '1';
        var fgH = this.fg.offsetHeight || H;
        this.fg.style.transform =
          'translateX(-50%) translateY(' +
          lerp(H * 0.62, -(fgH - H), tp).toFixed(1) +
          'px)';
      }
    }

    // publication info fades/slides in alongside its paper
    for (var pj = 0; pj < pubs.pull.length; pj++) {
      var info = this.pubRows[pj].info,
        ia = pubs.pull[pj].a;
      if (info) {
        info.style.opacity = ia.toFixed(3);
        info.style.transform =
          'translateX(' + lerp(22, 0, ia).toFixed(1) + 'px)';
      }
    }

    // §4 finale: the last paper descends beside the section, shrinking + spinning
    this._renderLoopPaper(p, H);
  };

  // The reserved last paper: as the §4 section settles into view, it drops down
  // into the .loop-fig slot beside it, shrinks "a bit", and spins a full 360°.
  // Timing comes from progress p (the T.loop band); placement tracks the slot's
  // live position, so it lands correctly wherever the section has scrolled to.
  Fleet.prototype._renderLoopPaper = function (p, H) {
    var pl = this.loopPaper,
      fig = this.loopFig,
      wrap = this.loopWrap;
    if (!pl || !fig || !wrap) return;
    var paper = pl.el;
    // slot hidden (narrow screens) → keep the paper out of the scene
    if (!fig.offsetWidth) {
      paper.style.opacity = '0';
      paper.classList.remove('af-spin-on');
      return;
    }
    var a = ease(p, this.o.T.loop[0], this.o.T.loop[1]);
    if (a <= 0.001) {
      paper.style.opacity = '0';
      paper.classList.remove('af-spin-on');
      paper.style.transform = '';
      return;
    }
    // landing target in the report's local coords (same convention as pub pulls:
    // center the 158×206 paper on the slot)
    var rr0 = this.report.getBoundingClientRect(),
      fr = fig.getBoundingClientRect();
    var ex = fr.left + fr.width / 2 - rr0.left - 79,
      ey = fr.top + fr.height / 2 - rr0.top - 103;
    // descend in from above; converge onto the slot as a → 1
    var drop = Math.min(0.42 * (window.innerHeight || H), 360),
      y = ey - drop * (1 - a);
    var scEnd = clamp((fr.width || 120) / 158, 0.4, 1),
      sc = lerp(1, scEnd, a);
    // wrapper: position + scale (held steady once landed)
    wrap.style.zIndex = '60';
    wrap.style.transform =
      'translate(' +
      ex.toFixed(1) +
      'px,' +
      y.toFixed(1) +
      'px) scale(' +
      sc.toFixed(3) +
      ')';
    paper.style.opacity = clamp(a / 0.12, 0, 1).toFixed(3);
    paper.style.boxShadow = '0 12px 28px rgba(40,40,30,.16)';

    // paper: rotation. Scroll-drives the descent spin; once landed (a≈1, a full
    // turn complete), hand off to the CSS animation so it spins forever. A small
    // hysteresis band avoids flicker at the boundary while scrubbing.
    var spinning = paper.classList.contains('af-spin-on');
    if (spinning) {
      if (a < 0.95) {
        paper.classList.remove('af-spin-on');
        paper.style.transform = 'rotate(' + (360 * a).toFixed(1) + 'deg)';
      }
      // else: keep spinning — leave rotation to the animation
    } else if (a >= 0.999) {
      paper.style.transform = ''; // animation starts from 0° == the landed 360°
      paper.classList.add('af-spin-on');
    } else {
      paper.style.transform = 'rotate(' + (360 * a).toFixed(1) + 'deg)';
    }
  };

  // For each publication row compute its reveal progress `a` and its landing
  // target (in the report's local coords), then LATCH the freshest free paper
  // currently in the stream to that row — so a real paper peels off, leaving a
  // gap, and flies to the row. Latch clears when the row scrolls back out.
  Fleet.prototype._planPubs = function (H, lead, S, spawnY) {
    var out = { featByK: {}, pull: [] };
    if (!this.pubRows || !this.pubRows.length) return out;
    var hide = !this.fg || this.fg.style.opacity === '0';
    var feat = this._featK || (this._featK = []);
    while (feat.length < this.pubRows.length) feat.push(-1);
    var rr0 = this.report.getBoundingClientRect();

    for (var j = 0; j < this.pubRows.length; j++) {
      var R = this.pubRows[j],
        a = 0,
        tx = 0,
        ty = 0,
        sc = 0.6;
      if (!hide && R.fig) {
        var rr = R.row.getBoundingClientRect(),
          cy = rr.top + rr.height / 2;
        a = clamp((0.84 * H - cy) / (0.84 * H - 0.46 * H), 0, 1);
        a = a * a * (3 - 2 * a);
        var fr = R.fig.getBoundingClientRect();
        tx = fr.left + fr.width / 2 - rr0.left - 79; // center the 158px paper
        ty = fr.top + fr.height / 2 - rr0.top - 103;
        sc = (fr.width || 96) / 158;
      }
      out.pull.push({ a: a, tx: tx, ty: ty, sc: sc });
      if (a <= 0.001) feat[j] = -1; // unlatch once fully scrolled out
    }

    var taken = {};
    for (var t = 0; t < feat.length; t++)
      if (feat[t] >= 0) taken[feat[t]] = true;
    for (var j2 = 0; j2 < this.pubRows.length; j2++) {
      if (out.pull[j2].a > 0.02 && feat[j2] < 0) {
        var best = -1,
          bestd = Infinity;
        for (var ii = 0; ii < this.pile.length; ii++) {
          var kk = this.pile[ii].k;
          if (this.loopPaper && this.pile[ii] === this.loopPaper) continue; // reserved for §4
          if (kk > lead || taken[kk]) continue; // unsurfaced or already pulled
          var scy = rr0.top + (this.trailY[kk] - S) + 103;
          if (scy < 0 || scy > H) continue; // must be visible in the stream
          var d = Math.abs(scy - spawnY); // freshest = nearest the spawn point
          if (d < bestd) {
            bestd = d;
            best = kk;
          }
        }
        if (best >= 0) {
          feat[j2] = best;
          taken[best] = true;
        }
      }
    }
    for (var j3 = 0; j3 < feat.length; j3++)
      if (feat[j3] >= 0) out.featByK[feat[j3]] = j3;
    return out;
  };

  Fleet.prototype._renderFlows = function (rp, pa) {
    var pr = this.flowSvg.getBoundingClientRect();
    var paperR = this.report.getBoundingClientRect();
    var tx = paperR.left + paperR.width / 2 - pr.left,
      ty = paperR.top - 2 - pr.top;
    var n = this.sessions.length;
    for (var i = 0; i < n; i++) {
      var path = this.flows[i];
      if (pa <= 0.002) {
        path.setAttribute('opacity', 0);
        continue;
      }
      var sR = this.sessions[i].el.getBoundingClientRect();
      var sx = sR.left + sR.width / 2 - pr.left,
        sy = sR.bottom - pr.top;
      var txi = tx + (i - (n - 1) / 2) * 7;
      var c1y = sy + (ty - sy) * 0.45,
        c2y = sy + (ty - sy) * 0.78;
      var d =
        'M ' +
        sx.toFixed(1) +
        ' ' +
        sy.toFixed(1) +
        ' C ' +
        sx.toFixed(1) +
        ' ' +
        c1y.toFixed(1) +
        ' ' +
        txi.toFixed(1) +
        ' ' +
        c2y.toFixed(1) +
        ' ' +
        txi.toFixed(1) +
        ' ' +
        ty.toFixed(1);
      path.setAttribute('d', d);
      path.setAttribute('opacity', (pa * 0.8).toFixed(3));
      path.setAttribute('stroke-dashoffset', (-rp * 180).toFixed(1)); // dashes flow toward the report as you scroll
    }
  };

  Fleet.prototype._setLine = function (L, rp, N) {
    var writeAt = (L.order / N) * 0.6,
      w;
    if (L.rev && rp >= L.rev.del && rp < L.rev.rew)
      w = 0; // deleted
    else if (L.rev && rp >= L.rev.rew)
      w = L.w2 * ease(rp, L.rev.rew, L.rev.rew + 0.03); // rewritten
    else w = rp >= writeAt ? L.w * ease(rp, writeAt, writeAt + 0.03) : 0; // written
    L.el.setAttribute('width', (w > 0 ? w : 0).toFixed(1));
  };

  Fleet.prototype._drawPackets = function (flying, p, u) {
    var pk = this.packets;
    while (pk.firstChild) pk.removeChild(pk.firstChild);
    if (!flying.length) return;
    var pR = pk.getBoundingClientRect();
    for (var n = 0; n < flying.length; n++) {
      var job = flying[n],
        ses = this.sessions[job.i];
      var cR = this.cells[job.cell].getBoundingClientRect();
      var sR = ses.el.getBoundingClientRect();
      var x0 = cR.left + cR.width / 2 - pR.left,
        y0 = cR.top + cR.height / 2 - pR.top;
      var x1 = sR.right - 12 - pR.left,
        y1 = sR.top + sR.height / 2 - pR.top;
      var mx = (x0 + x1) / 2,
        my = Math.min(y0, y1) - 26;
      var t = u.smooth((p - job.c) / this.o.pktWin),
        e = 1 - t;
      var x = e * e * x0 + 2 * e * t * mx + t * t * x1;
      var y = e * e * y0 + 2 * e * t * my + t * t * y1;
      pk.appendChild(
        svg('circle', {
          cx: x,
          cy: y,
          r: 3,
          fill: ses.tint,
          opacity: t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15,
        }),
      );
    }
  };

  Fleet.prototype._fade = function (hex) {
    var c = hex.replace('#', ''),
      r = parseInt(c.substr(0, 2), 16),
      g = parseInt(c.substr(2, 2), 16),
      b = parseInt(c.substr(4, 2), 16),
      t = 0.5;
    return (
      'rgb(' +
      Math.round(lerp(r, 252, t)) +
      ',' +
      Math.round(lerp(g, 252, t)) +
      ',' +
      Math.round(lerp(b, 249, t)) +
      ')'
    );
  };

  Fleet.prototype.destroy = function () {
    if (this.ss) this.ss.destroy();
  };

  function create(container, options) {
    return new Fleet(container, options);
  }
  return { create: create, Fleet: Fleet, paperStack: paperStack };
});
