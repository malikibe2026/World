// One camera path from space to Kampung Sungai Tekali, shared by the 3D Earth (three.js) and the
// map descent (MapLibre) so the hand-off at zoom ~4.55 lines up.
(function () {
  function pchip(xs, ys) {
    const n = xs.length, h = [], d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    };
  }
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const HANDOFF_Z = 4.55;
  const zoomAt = pchip([12.5, 14.0, 16.25, 18.0, 20.0, 22.0, 23.8, 25.0], [1.5, 2.45, 4.55, 7.4, 10.3, 13.2, 15.6, 16.15]);
  const lonAt = pchip([0, 4.55, 7.4, 10.3, 13.2, 17], [102.0, 102.0, 101.80, 101.84, 101.8491, 101.8491]);
  const latAt = pchip([0, 4.55, 7.4, 10.3, 13.2, 17], [4.0, 4.0, 3.20, 3.09, 3.1105, 3.1105]);
  function camera(t) {
    const z = zoomAt(t);
    return {
      t, z, lon: lonAt(z), lat: latAt(z),
      pitch: 62 * ss(8.5, 15.8, z), bearing: -30 * ss(9.5, 16.2, z),
      dist: 1 + 27.3 / Math.pow(2, z), spin: 32 * (1 - ss(1.5, 4.2, z)), tilt: 10 * (1 - ss(1.5, 4.4, z)),
      altKm: 173900 / Math.pow(2, z),
    };
  }
  window.PATH = { camera, HANDOFF_Z, DESC_T0: 16.0, DESC_T1: 25.0, DESC_FPS: 30 };
})();
