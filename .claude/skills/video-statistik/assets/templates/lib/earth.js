// Photoreal Earth for the video: NASA Blue Marble (day) + Black Marble (night lights), ocean glint,
// atmosphere rim and a starfield. Deterministic: draw(state) renders exactly one frame.
import * as THREE from './three.module.js';

const D2R = Math.PI / 180;

// opts.W/H = canvas size; opts.fov = vertical field of view (portrait uses a wider one so the globe keeps the same pixel scale)
export async function createEarth(canvas, opts = {}) {
  const W = opts.W || 1920, H = opts.H || 1080;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(opts.fov || 30, W / H, 0.001, 2000);

  const loader = new THREE.TextureLoader();
  const load = (u) => new Promise((res, rej) => loader.load(u, (t) => { t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; res(t); }, undefined, rej));
  const [day, night, water, sky] = await Promise.all(['tex/earth-blue-marble.jpg', 'tex/earth-night.jpg', 'tex/earth-water.png', 'tex/night-sky.png'].map(load));
  for (const t of [day, night, water]) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }

  const earthMat = new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: day }, nightMap: { value: night }, waterMap: { value: water }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, exposure: { value: 1.0 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform sampler2D dayMap, nightMap, waterMap; uniform vec3 sunDir; uniform float exposure;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
      void main() {
        vec3 n = normalize(vN); vec3 V = normalize(cameraPosition - vP);
        float d = dot(n, sunDir);
        vec3 dayC = toLin(texture2D(dayMap, vUv).rgb);
        vec3 nightC = toLin(texture2D(nightMap, vUv).rgb);
        float w = texture2D(waterMap, vUv).r;
        float lit = smoothstep(-0.08, 0.25, d);
        vec3 col = dayC * (0.015 + 1.35 * max(d, 0.0));
        float lum = dot(nightC, vec3(0.3, 0.55, 0.15)); vec3 lights = smoothstep(0.035, 0.5, lum) * vec3(1.0, 0.72, 0.38) * 1.6;
        col = mix(lights * (1.0 - lit) + dayC * 0.004, col, lit);
        vec3 h = normalize(sunDir + V);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 2.6);
        col += vec3(0.25, 0.5, 1.0) * fres * 0.5 * smoothstep(-0.2, 0.6, d);
        col = vec3(1.0) - exp(-col * exposure * 1.6);
        gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), earthMat);
  scene.add(earth);

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 wp = modelMatrix*vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vP;
      void main(){
        vec3 r = normalize(vP - cameraPosition);
        float tc = -dot(cameraPosition, r); vec3 cp = cameraPosition + r * tc; float b = length(cp);
        if (b < 1.0) discard;
        float g = exp(-(b - 1.0) / 0.014) * 1.25 + exp(-(b - 1.0) / 0.05) * 0.25;
        float s = smoothstep(-0.25, 0.45, dot(normalize(cp), sunDir));
        gl_FragColor = vec4(vec3(0.36, 0.62, 1.0) * g * (0.06 + 1.1 * s), 1.0); }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 160, 120), atmoMat);
  scene.add(atmo);

  // starfield: deterministic points + faint Milky Way
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const N = 4200, pos = new Float32Array(N * 3), colr = new Float32Array(N * 3), size = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([r * Math.cos(th) * 600, u * 600, r * Math.sin(th) * 600], i * 3);
    const k = rnd(); colr.set(k < 0.15 ? [1, 0.85, 0.7] : k < 0.35 ? [0.75, 0.85, 1] : [1, 1, 1], i * 3);
    size[i] = 0.6 + Math.pow(rnd(), 4) * 2.6;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(colr, 3)); sg.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const stars = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: { op: { value: 1 } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; void main(){ vC = color; gl_PointSize = size * 1.4; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float op; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * op, a * op); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(stars);
  sky.colorSpace = THREE.SRGBColorSpace;
  const milky = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, transparent: true, opacity: 0.32, depthWrite: false }));
  scene.add(milky);

  // lon/lat -> unit vector on the (unrotated) sphere, matching SphereGeometry's UV layout
  const ll = (lon, lat) => { const phi = ((lon + 180) / 360) * Math.PI * 2, th = ((90 - lat) / 180) * Math.PI; return new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th)); };

  /**
   * state: lon/lat = point under the camera, dist = camera distance from the centre (Earth radius 1),
   * spin = extra rotation in degrees (positive turns the point away to the east), tilt = camera
   * elevation offset in degrees, sunLon/sunLat = sub-solar point, shiftX/shiftY = composition offset (px),
   * lookLat = how far the camera aims toward the surface point (0 = centre, 1 = point).
   */
  function draw(s) {
    const p = ll(s.lon, s.lat);
    const beta = Math.atan2(-p.x, p.z) - (s.spin || 0) * D2R;
    earth.rotation.set(0, beta, 0); atmo.rotation.copy(earth.rotation);
    const dir = new THREE.Vector3(0, Math.sin((s.lat + (s.tilt || 0)) * D2R), Math.cos((s.lat + (s.tilt || 0)) * D2R)).normalize();
    cam.position.copy(dir.clone().multiplyScalar(s.dist));
    const surf = p.clone().applyEuler(earth.rotation);
    const target = surf.multiplyScalar(s.look ?? 0);
    cam.up.set(0, 1, 0); cam.lookAt(target);
    cam.near = Math.max(0.0005, (s.dist - 1.05) * 0.5); cam.far = 2000; cam.updateProjectionMatrix();
    if (s.shiftX || s.shiftY) cam.setViewOffset(W, H, -(s.shiftX || 0), -(s.shiftY || 0), W, H); else cam.clearViewOffset();
    const sun = ll(s.sunLon, s.sunLat).applyEuler(earth.rotation);
    earthMat.uniforms.sunDir.value.copy(sun); atmoMat.uniforms.sunDir.value.copy(sun);
    earthMat.uniforms.exposure.value = s.exposure ?? 1;
    stars.material.uniforms.op.value = s.stars ?? 1; milky.material.opacity = 0.32 * (s.stars ?? 1);
    stars.position.copy(cam.position); milky.position.copy(cam.position);
    renderer.render(scene, cam);
  }
  return { draw };
}
