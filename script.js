// Water ripple effect that follows the cursor.
// A wave simulation runs on a low-resolution height map; WebGL then uses it to
// refract the background image and add light highlights on the ripples.
// If the image can't be used as a texture (e.g. page opened via file://),
// the canvas falls back to drawing only the ripple highlights over the CSS background.
(() => {
  const canvas = document.getElementById('water');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
  if (!gl) return; // no WebGL: the plain CSS background still shows

  const CELL = 3;          // CSS pixels per simulation cell
  const DAMPING = 0.985;   // how quickly ripples fade (closer to 1 = longer)
  const RADIUS = 3;        // ripple size in cells
  const STRENGTH = 1.2;    // ripple height per drop
  const ENCODE = 40;       // height -> byte scale for the texture upload

  let simW = 0, simH = 0;
  let cur, prev, bytes;
  let hasImage = false;
  let imgAspect = 4 / 3;

  // ---------- Shaders ----------
  const vsSrc = `
    attribute vec2 pos;
    varying vec2 uv;
    void main() {
      uv = pos * 0.5 + 0.5;
      gl_Position = vec4(pos, 0.0, 1.0);
    }`;

  const fsSrc = `
    precision mediump float;
    varying vec2 uv;
    uniform sampler2D heightMap;
    uniform sampler2D bg;
    uniform vec2 texel;
    uniform vec2 coverScale;
    uniform bool hasImage;

    float h(vec2 o) { return texture2D(heightMap, uv + o).r; }

    void main() {
      float dx = h(vec2(texel.x, 0.0)) - h(vec2(-texel.x, 0.0));
      float dy = h(vec2(0.0, texel.y)) - h(vec2(0.0, -texel.y));

      vec3 n = normalize(vec3(-dx * 6.0, -dy * 6.0, 1.0));
      vec3 halfV = normalize(vec3(-0.4, 0.7, 1.0) + vec3(0.0, 0.0, 1.0));
      // Light relative to flat water: >0 brightens, <0 darkens, 0 when calm
      float shade = clamp((dot(n, halfV) - halfV.z) * 2.5, -0.35, 0.6);

      if (hasImage) {
        vec2 tuv = (uv - 0.5) * coverScale + 0.5 + vec2(dx, dy) * 0.25;
        vec3 color = texture2D(bg, tuv).rgb + shade;
        gl_FragColor = vec4(color, 1.0);
      } else {
        gl_FragColor = vec4(vec3(max(shade, 0.0)), abs(shade));
      }
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(program);
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, 'pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const u = name => gl.getUniformLocation(program, name);
  const uTexel = u('texel');
  const uCover = u('coverScale');
  const uHasImage = u('hasImage');
  gl.uniform1i(u('heightMap'), 0);
  gl.uniform1i(u('bg'), 1);

  function makeTexture() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const heightTex = makeTexture();
  const bgTex = makeTexture();

  // ---------- Background image ----------
  const img = new Image();
  img.onload = () => {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      hasImage = true;
      imgAspect = img.width / img.height;
      updateCover();
    } catch (e) {
      // Browsers block local files as WebGL textures; use highlight-only mode.
      hasImage = false;
    }
    gl.uniform1i(uHasImage, hasImage);
  };
  img.src = 'background.jpg';

  // ---------- Simulation ----------
  function updateCover() {
    const canvasAspect = canvas.width / canvas.height;
    // Same framing as CSS "background-size: cover; background-position: center"
    if (canvasAspect > imgAspect) gl.uniform2f(uCover, 1, imgAspect / canvasAspect);
    else gl.uniform2f(uCover, canvasAspect / imgAspect, 1);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    simW = Math.ceil(window.innerWidth / CELL) + 2;
    simH = Math.ceil(window.innerHeight / CELL) + 2;
    cur = new Float32Array(simW * simH);
    prev = new Float32Array(simW * simH);
    bytes = new Uint8Array(simW * simH);

    gl.uniform2f(uTexel, 1 / simW, 1 / simH);
    updateCover();
  }

  function drop(px, py) {
    const cx = px / CELL + 1;
    const cy = py / CELL + 1;
    const x0 = Math.max(1, Math.floor(cx - RADIUS)), x1 = Math.min(simW - 2, Math.ceil(cx + RADIUS));
    const y0 = Math.max(1, Math.floor(cy - RADIUS)), y1 = Math.min(simH - 2, Math.ceil(cy + RADIUS));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < RADIUS) cur[y * simW + x] += STRENGTH * (0.5 + 0.5 * Math.cos(Math.PI * d / RADIUS));
      }
    }
  }

  function step() {
    const w = simW;
    for (let y = 1; y < simH - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - w] + cur[i + w]) * 0.5 - prev[i]) * DAMPING;
      }
    }
    const t = cur; cur = prev; prev = t;

    for (let i = 0; i < cur.length; i++) {
      const v = 128 + cur[i] * ENCODE;
      bytes[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  // ---------- Input: drop ripples along the cursor path ----------
  let last = null;
  function move(x, y) {
    if (last) {
      const dist = Math.hypot(x - last.x, y - last.y);
      const steps = Math.max(1, Math.floor(dist / (CELL * 2)));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        drop(last.x + (x - last.x) * t, last.y + (y - last.y) * t);
      }
    } else {
      drop(x, y);
    }
    last = { x, y };
  }

  window.addEventListener('pointermove', e => move(e.clientX, e.clientY));
  window.addEventListener('pointerleave', () => { last = null; });
  window.addEventListener('pointerdown', e => {
    // A click makes a bigger splash
    for (let k = 0; k < 4; k++) drop(e.clientX, e.clientY);
  });
  window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (t) move(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', () => { last = null; });
  window.addEventListener('resize', resize);

  // ---------- Render loop ----------
  function frame() {
    step();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, simW, simH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bgTex);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  }

  resize();
  gl.uniform1i(uHasImage, false);
  requestAnimationFrame(frame);
})();
