// Shared helpers for the SheSpeaks animations. Classic script (no modules) so the pages open by double-click too.
// Every scene is a pure function of time: SS.seek(t) draws frame t, which is what the renderer captures.
window.SS = window.SS || {};

// Language of the cut: ?lang=en renders the English version; SS.t(fr, en) picks the string.
SS.lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'fr';
SS.t = (fr, en) => (SS.lang === 'en' ? en : fr);

SS.C = {
  night: '#111528', raised: '#1A1F36', sunken: '#262B44', line: '#2E3350',
  amber: '#F5A524', ink: '#F7F3EC', soft: '#C9CCDA', muted: '#9AA0B8',
};

SS.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
SS.lerp = (a, b, p) => a + (b - a) * p;
SS.ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
/** 0 before `start`, 1 after `start + dur`, eased in between. */
SS.prog = (t, start, dur, e = SS.ease.inOut) => e(SS.clamp((t - start) / dur));
/** A blink: 0 → 1 → 0 around `at`, lasting `dur`. */
SS.pulse = (t, at, dur = 0.18) => { const x = (t - at) / dur; return x < 0 || x > 1 ? 0 : Math.sin(x * Math.PI); };
/** Value along keyframes [[time, value], ...], eased between neighbours. */
SS.keys = (t, frames, e = SS.ease.inOut) => {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i];
    const [t0, v0] = frames[i - 1];
    if (t <= t1) {
      const p = e((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((v, k) => SS.lerp(v, v1[k], p)) : SS.lerp(v0, v1, p);
    }
  }
  return frames[frames.length - 1][1];
};

/** Blend two #rrggbb colours. */
SS.mix = (a, b, p) => {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${ca.map((v, i) => Math.round(SS.lerp(v, cb[i], SS.clamp(p))).toString(16).padStart(2, '0')).join('')}`;
};

SS.$ = (id) => document.getElementById(id);
/** Shrink a one-line <text> so it fits in `max` px (translations run longer than the French). */
SS.fit = (id, max) => {
  const el = typeof id === 'string' ? SS.$(id) : id;
  const w = el.getComputedTextLength();
  if (w > max) el.setAttribute('font-size', (parseFloat(el.getAttribute('font-size')) * max) / w);
};
/** Fit every <text data-max="…"> on the page. */
SS.fitAll = () => document.querySelectorAll('text[data-max]').forEach((el) => SS.fit(el, Number(el.dataset.max)));
SS.attr = (id, attrs) => { const el = SS.$(id); for (const k in attrs) el.setAttribute(k, attrs[k]); };
SS.opacity = (id, o) => { SS.$(id).style.opacity = o; };
/** Scale around a point, for camera moves. */
SS.zoom = (s, cx, cy, dx = 0, dy = 0) => `translate(${cx + dx} ${cy + dy}) scale(${s}) translate(${-cx} ${-cy})`;
/** Word-by-word text: one <tspan> per word, revealed by SS.reveal. */
SS.words = (id, text) => text.split(' ').map((w, i) => `<tspan id="${id}-w${i}">${w}</tspan>`).join(' ');
SS.reveal = (t, id, start, step = 0.13) => {
  const count = SS.$(id).querySelectorAll('tspan').length;
  for (let i = 0; i < count; i++) SS.$(`${id}-w${i}`).style.fillOpacity = SS.prog(t, start + i * step, 0.25, SS.ease.out);
};

/**
 * Edit decision list: the animation is written in "story time"; the cut plays chosen story ranges in order,
 * each at its own real duration (shorter = sped up), with freeze frames in between.
 * Entries: [from, to] (normal speed), [from, to, realDuration], or ['hold', seconds] (freeze on the previous end).
 */
SS.edl = (list) => {
  const len = (e) => (e[0] === 'hold' ? e[1] : e[2] ?? e[1] - e[0]);
  return {
    duration: Math.round(list.reduce((sum, e) => sum + len(e), 0) * 1000) / 1000,
    story(t) {
      let r = t;
      let last = list[0][0];
      for (const e of list) {
        const d = len(e);
        if (e[0] !== 'hold') {
          if (r < d) return e[0] + ((e[1] - e[0]) * r) / d;
          last = e[1];
        } else if (r < d) return last;
        r -= d;
      }
      return last;
    },
  };
};

// Player: the page plays in a loop when opened in a browser; ?t=3.5 freezes a frame; ?render hands control to render.mjs.
SS.start = function (duration, build, seek) {
  SS.duration = duration;
  SS.seek = seek;
  const params = new URLSearchParams(location.search);
  Promise.all([document.fonts.load('800 60px Archivo'), document.fonts.load('500 20px "IBM Plex Mono"')])
    .then(() => document.fonts.ready)
    .then(() => {
      build();
      if (params.has('render')) { document.body.classList.add('render'); seek(0); SS.ready = true; return; }
      if (params.has('t')) { seek(Number(params.get('t'))); return; }
      const t0 = performance.now();
      const tick = (now) => { seek(((now - t0) / 1000) % duration); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
};
