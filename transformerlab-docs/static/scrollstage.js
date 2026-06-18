/*!
 * scrollstage.js — a tiny scroll-scrubbed timeline engine
 * -------------------------------------------------------
 * Bind a tall section; it pins a 100vh stage and reports a normalized scroll
 * progress p ∈ [0,1]. You supply ONE pure render(p, u) that draws the entire
 * scene as a function of p. Because render is pure and idempotent, scrubbing
 * works in both directions and at any speed — scroll fast, it animates fast;
 * scroll back, it reverses; stop, it holds. No time-based animation.
 *
 *   const ss = ScrollStage.create('#scene', { vh: 320, render: (p, u) => { ... } });
 *   // build your DOM into ss.stage, then ss.refresh()
 *
 * The `u` utilities are the keyframing vocabulary:
 *   u.sub(p,a,b)        linear local progress of p within [a,b], clamped 0..1
 *   u.ease(p,a,b)       smoothstep local progress within [a,b]
 *   u.at(p,a,b)         true while a ≤ p < b
 *   u.count(p,a,b,n)    how many of n items are "done" by p across [a,b]
 *   u.lerp/clamp/smooth basic math
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.ScrollStage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function smooth(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function loc(p, a, b) {
    return clamp((p - a) / (b - a || 1e-6), 0, 1);
  }

  var U = {
    clamp: clamp,
    smooth: smooth,
    lerp: lerp,
    sub: loc,
    ease: function (p, a, b) {
      return smooth(loc(p, a, b));
    },
    at: function (p, a, b) {
      return p >= a && p < b;
    },
    count: function (p, a, b, n) {
      return Math.round(loc(p, a, b) * n);
    },
    // value keyframes: kf(p, [[t0,v0],[t1,v1],...]) — eased between stops
    kf: function (p, stops) {
      if (p <= stops[0][0]) return stops[0][1];
      for (var i = 1; i < stops.length; i++) {
        if (p <= stops[i][0])
          return lerp(
            stops[i - 1][1],
            stops[i][1],
            smooth(loc(p, stops[i - 1][0], stops[i][0])),
          );
      }
      return stops[stops.length - 1][1];
    },
  };

  function Stage(section, opts) {
    this.section =
      typeof section === 'string' ? document.querySelector(section) : section;
    if (!this.section) throw new Error('scrollstage: section not found');
    this.opts = opts || {};
    this.render = this.opts.render || function () {};
    this.top = this.opts.top || 0; // px to leave clear at the top (e.g. a sticky header)
    this.section.style.height = (this.opts.vh || 300) + 'vh';
    this.section.style.position = 'relative';
    this.stage = document.createElement('div');
    this.stage.className = 'ss-sticky';
    this.stage.style.cssText =
      'position:sticky;top:' +
      this.top +
      'px;height:calc(100vh - ' +
      this.top +
      'px);overflow:hidden';
    this.section.appendChild(this.stage);

    this._onScroll = this._tick.bind(this);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onScroll);
    var self = this;
    requestAnimationFrame(function () {
      self._draw();
    }); // first paint after consumer builds DOM
  }
  Stage.prototype._tick = function () {
    if (this._q) return;
    this._q = true;
    var s = this;
    requestAnimationFrame(function () {
      s._q = false;
      s._draw();
    });
  };
  Stage.prototype.progress = function () {
    var r = this.section.getBoundingClientRect();
    var total = this.section.offsetHeight - (window.innerHeight - this.top);
    return clamp((this.top - r.top) / (total || 1), 0, 1);
  };
  Stage.prototype._draw = function () {
    this.p = this.progress();
    this.render(this.p, U);
  };
  Stage.prototype.refresh = function () {
    this._draw();
  };
  Stage.prototype.destroy = function () {
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onScroll);
    if (this.stage.parentNode) this.stage.parentNode.removeChild(this.stage);
  };

  return {
    create: function (s, o) {
      return new Stage(s, o);
    },
    U: U,
  };
});
