/** Helper method to output an error message to the screen */
function showError(errorText) {
  const errorBoxDiv = document.getElementById('error-box');
  const errorSpan = document.createElement('p');
  errorSpan.innerText = errorText;
  errorBoxDiv.appendChild(errorSpan);
  console.error(errorText);
}

//
// ---- Tiny mat4 helpers (column-major, like GLSL) ----
// No matrix library was used in the original triangle demo, so none is
// pulled in here either - just the four functions we actually need.
//
function mat4Identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function mat4Multiply(a, b) {
  // returns a * b
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}
function mat4Perspective(fovYRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovYRad / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}
function mat4Translate(x, y, z) {
  const out = mat4Identity();
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}
function mat4RotateY(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  const out = mat4Identity();
  out[0] = c; out[2] = -s; out[8] = s; out[10] = c;
  return out;
}
function mat4RotateX(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  const out = mat4Identity();
  out[5] = c; out[6] = s; out[9] = -s; out[10] = c;
  return out;
}

//
// ---- Geometry builders ----
// Pushes a box / pyramid's vertices into shared arrays and returns nothing;
// this is how the sword's parts (blade, guard, grip, pommel, tip) get
// combined into one single draw call instead of one draw call per part.
//
function addBox(pos, norm, col, idx, cx, cy, cz, sx, sy, sz, colorOrFn) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    { n: [0, 0, 1],  v: [[-hx,-hy, hz],[ hx,-hy, hz],[ hx, hy, hz],[-hx, hy, hz]] }, // +z
    { n: [0, 0,-1],  v: [[ hx,-hy,-hz],[-hx,-hy,-hz],[-hx, hy,-hz],[ hx, hy,-hz]] }, // -z
    { n: [1, 0, 0],  v: [[ hx,-hy, hz],[ hx,-hy,-hz],[ hx, hy,-hz],[ hx, hy, hz]] }, // +x
    { n: [-1,0, 0],  v: [[-hx,-hy,-hz],[-hx,-hy, hz],[-hx, hy, hz],[-hx, hy,-hz]] }, // -x
    { n: [0, 1, 0],  v: [[-hx, hy, hz],[ hx, hy, hz],[ hx, hy,-hz],[-hx, hy,-hz]] }, // +y
    { n: [0,-1, 0],  v: [[-hx,-hy,-hz],[ hx,-hy,-hz],[ hx,-hy, hz],[-hx,-hy, hz]] }, // -y
  ];
  for (const f of faces) {
    const start = pos.length / 3;
    for (const v of f.v) {
      const vy = cy + v[1];
      // colorOrFn can be a fixed [r,g,b] (used as-is) or a function of this
      // vertex's world-space Y, so a single box can be tinted along its
      // height instead of being one flat color
      const c = typeof colorOrFn === 'function' ? colorOrFn(vy) : colorOrFn;
      pos.push(cx + v[0], vy, cz + v[2]);
      norm.push(f.n[0], f.n[1], f.n[2]);
      col.push(c[0], c[1], c[2]);
    }
    idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}

function addPyramid(pos, norm, col, idx, cx, baseY, cz, sx, sz, height, color) {
  const hx = sx / 2, hz = sz / 2;
  const apex = [cx, baseY + height, cz];
  const base = [
    [cx - hx, baseY, cz - hz],
    [cx + hx, baseY, cz - hz],
    [cx + hx, baseY, cz + hz],
    [cx - hx, baseY, cz + hz],
  ];
  for (let i = 0; i < 4; i++) {
    const b0 = base[i], b1 = base[(i + 1) % 4];
    const start = pos.length / 3;
    // Flat per-face normal via cross product, since each side is its own triangle
    const e1 = [b1[0]-b0[0], b1[1]-b0[1], b1[2]-b0[2]];
    const e2 = [apex[0]-b0[0], apex[1]-b0[1], apex[2]-b0[2]];
    let n = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0]/len, n[1]/len, n[2]/len];
    pos.push(...b0, ...b1, ...apex);
    norm.push(...n, ...n, ...n);
    col.push(...color, ...color, ...color);
    idx.push(start, start + 1, start + 2);
  }
}

function buildSword() {
  const pos = [], norm = [], col = [], idx = [];

  const STEEL  = [0.75, 0.78, 0.82];
  const EMBER  = [0.95, 0.35, 0.10];
  const GOLD   = [0.85, 0.65, 0.13];
  const LEATHER = [0.32, 0.19, 0.10];

  // Part sizes, defined once so the stacking math below is exact instead of
  // hand-tuned - this is what fixes the gap that was between the guard and grip.
  const guardH = 0.09, gripH = 0.35, pommelH = 0.13, bladeH = 1.30, tipH = 0.22;
  const guardTop = guardH / 2;      //  0.045
  const guardBottom = -guardH / 2;  // -0.045

  // Blade sits directly on top of the guard (its bottom face = guard's top face)
  const bladeCenterY = guardTop + bladeH / 2;
  function lerp3(a, b, t) {
    return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
  }
  // Cool steel near the guard, shifting to a hot ember tone near the tip -
  // this is what makes the blade itself look heated by the flame above it,
  // rather than the fire looking pasted onto an untouched grey blade.
  function bladeColor(y) {
    const t = Math.max(0, Math.min(1, (y - guardTop) / bladeH));
    return lerp3(STEEL, EMBER, t * t); // t*t: most of the blade stays steel-colored, only the top heats up
  }
  const bladeHx = 0.14, bladeHz = 0.035; // full width/depth of the blade box (matches addBox's sx/sz below)
  addBox(pos, norm, col, idx, 0, bladeCenterY, 0, bladeHx, bladeH, bladeHz, bladeColor);

  // Tip pyramid's base sits exactly on the blade's top face
  const bladeTop = guardTop + bladeH;
  addPyramid(pos, norm, col, idx, 0, bladeTop, 0, 0.14, 0.035, tipH, EMBER);
  const tipApex = bladeTop + tipH;

  // Crossguard, centered at the blade/grip boundary
  addBox(pos, norm, col, idx, 0, 0, 0, 0.55, guardH, 0.09, GOLD);

  // Grip's top face sits exactly on the guard's bottom face (previously left
  // a 0.025-unit gap because its center didn't account for the guard's own
  // half-thickness)
  const gripCenterY = guardBottom - gripH / 2;
  addBox(pos, norm, col, idx, 0, gripCenterY, 0, 0.10, gripH, 0.10, LEATHER);

  // Pommel caps the grip's bottom face
  const gripBottom = guardBottom - gripH;
  const pommelCenterY = gripBottom - pommelH / 2;
  addBox(pos, norm, col, idx, 0, pommelCenterY, 0, 0.14, pommelH, 0.14, GOLD);

  // Recenter the whole mesh vertically around y = 0. Without this the sword's
  // true center (blade is much longer than the handle) sits above the origin,
  // so the camera - which always looks at the origin - shows it off-center.
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    if (pos[i] < minY) minY = pos[i];
    if (pos[i] > maxY) maxY = pos[i];
  }
  const centerY = (minY + maxY) / 2;
  for (let i = 1; i < pos.length; i += 3) pos[i] -= centerY;

  // Scale the whole mesh down uniformly. Doing this last, on the finished
  // vertex data, keeps every part's proportions identical - it's equivalent
  // to shrinking the finished physical sword rather than re-tuning each
  // part's size by hand.
  const SCALE = 0.75;
  for (let i = 0; i < pos.length; i++) pos[i] *= SCALE;

  // Flame zone now covers almost the entire blade (from just above the
  // guard up to the very tip) instead of a thin band near the point, plus
  // the blade's half-width/half-depth so particles can be scattered across
  // its whole surface - together these are what let the fire spread out
  // like burning grease clinging to the metal, rather than a single torch
  // flame sitting on top of it.
  const flameBaseY = (guardTop + 0.05 - centerY) * SCALE; // start just above the guard, not at the very root
  const flameTopY = (tipApex - centerY) * SCALE;
  const bladeHalfWidth = (bladeHx / 2) * SCALE;
  const bladeHalfDepth = (bladeHz / 2) * SCALE;

  return { pos, norm, col, idx, flameBaseY, flameTopY, bladeHalfWidth, bladeHalfDepth };
}

function sword3D() {
  //
  // Setup Step 1: Get the WebGL rendering context, same as the triangle demo
  //
  /** @type {HTMLCanvasElement|null} */
  const canvas = document.getElementById('demo-canvas');
  if (!canvas) {
    showError('Could not find HTML canvas element - check for typos, or loading JavaScript file too early');
    return;
  }
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    const isWebGl1Supported = !!(document.createElement('canvas')).getContext('webgl');
    if (isWebGl1Supported) {
      showError('WebGL 1 is supported, but not v2 - try using a different device or browser');
    } else {
      showError('WebGL is not supported on this device - try using a different device or browser');
    }
    return;
  }

  //
  // Setup Step 2: Build the sword mesh on the CPU, then upload each attribute
  // stream to its own GPU buffer (positions / normals / colors / indices).
  // This mirrors the single triangleGeoBuffer pattern from the original demo,
  // just repeated once per attribute plus one ELEMENT_ARRAY_BUFFER for indices.
  //
  const mesh = buildSword();

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.pos), gl.STATIC_DRAW);

  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.norm), gl.STATIC_DRAW);

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.col), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);

  const indexCount = mesh.idx.length;

  //
  // Setup Step 2b: Fire particles. Each particle gets a fixed "home" position
  // and a random seed used to stagger its timing and flicker - the actual
  // rise/flicker/fade animation happens on the GPU in the particle vertex
  // shader every frame, so nothing here is re-uploaded per frame.
  //
  // Particles are scattered along almost the whole blade length AND wrapped
  // around its thin rectangular cross-section (rather than clustered on the
  // centerline near the tip), so flame licks show up on both faces and both
  // edges the entire way down - the "grease fire on the blade" look.
  //
  const PARTICLE_COUNT = 160;
  const particleBasePos = [];
  const particleSeeds = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const t = Math.random();
    const y = mesh.flameBaseY + t * (mesh.flameTopY - mesh.flameBaseY);

    // Walk around the blade's cross-section perimeter instead of just
    // jittering near the centerline, so fire wraps the edges too.
    const angle = Math.random() * Math.PI * 2;
    const edgeJitter = 0.85 + Math.random() * 0.35; // some sit right at the surface, some drift slightly off it
    const x = Math.cos(angle) * mesh.bladeHalfWidth * edgeJitter;
    const z = Math.sin(angle) * mesh.bladeHalfDepth * edgeJitter;

    particleBasePos.push(x, y, z);
    particleSeeds.push(Math.random() * 100);
  }

  const particlePosBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, particlePosBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particleBasePos), gl.STATIC_DRAW);

  const particleSeedBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, particleSeedBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particleSeeds), gl.STATIC_DRAW);

  //
  // Setup Step 3: Shaders. Same compile/link/error-check pattern as before,
  // extended with a normal + a model matrix so a directional light can shade
  // each face, and a combined model-view-projection matrix for 3D depth.
  //
  const vertexShaderSourceCode = `#version 300 es
  precision mediump float;

  in vec3 vertexPosition;
  in vec3 vertexNormal;
  in vec3 vertexColor;

  uniform mat4 uModelViewProj;
  uniform mat4 uModel;

  out vec3 vColor;
  out vec3 vNormal;

  void main() {
    gl_Position = uModelViewProj * vec4(vertexPosition, 1.0);
    vNormal = mat3(uModel) * vertexNormal;
    vColor = vertexColor;
  }`;

  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexShaderSourceCode);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    const errorMessage = gl.getShaderInfoLog(vertexShader);
    showError(`Failed to compile vertex shader: ${errorMessage}`);
    return;
  }

  const fragmentShaderSourceCode = `#version 300 es
  precision mediump float;

  in vec3 vColor;
  in vec3 vNormal;

  out vec4 outputColor;

  void main() {
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
    // abs() instead of max() so faces aren't ever fully black, regardless of
    // which way a given triangle's normal happens to point - keeps the
    // hand-rolled geometry simple without needing exact winding everywhere
    float diff = abs(dot(normalize(vNormal), lightDir));
    float lighting = 0.35 + 0.65 * diff;
    outputColor = vec4(vColor * lighting, 1.0);
  }`;

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSourceCode);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    const errorMessage = gl.getShaderInfoLog(fragmentShader);
    showError(`Failed to compile fragment shader: ${errorMessage}`);
    return;
  }

  const swordProgram = gl.createProgram();
  gl.attachShader(swordProgram, vertexShader);
  gl.attachShader(swordProgram, fragmentShader);
  gl.linkProgram(swordProgram);
  if (!gl.getProgramParameter(swordProgram, gl.LINK_STATUS)) {
    const errorMessage = gl.getProgramInfoLog(swordProgram);
    showError(`Failed to link GPU program: ${errorMessage}`);
    return;
  }

  const positionLoc = gl.getAttribLocation(swordProgram, 'vertexPosition');
  const normalLoc = gl.getAttribLocation(swordProgram, 'vertexNormal');
  const colorLoc = gl.getAttribLocation(swordProgram, 'vertexColor');
  if (positionLoc < 0 || normalLoc < 0 || colorLoc < 0) {
    showError('Failed to get one or more attribute locations');
    return;
  }
  const mvpLoc = gl.getUniformLocation(swordProgram, 'uModelViewProj');
  const modelLoc = gl.getUniformLocation(swordProgram, 'uModel');

  //
  // Setup Step 3b: Particle shaders. Position, size and color are all
  // derived from uTime in the vertex/fragment shaders rather than being
  // recomputed on the CPU each frame - each particle just loops through
  // rise -> shrink -> fade on its own, offset by its random seed.
  //
  const particleVertexSourceCode = `#version 300 es
  precision mediump float;

  in vec3 aBasePos;
  in float aSeed;

  uniform float uTime;
  uniform mat4 uModelViewProj;

  out float vAge;

  void main() {
    float lifetime = 0.9 + 0.6 * fract(aSeed * 13.17);
    float spawnOffset = fract(aSeed) * lifetime;
    float ageT = mod(uTime + spawnOffset, lifetime) / lifetime;
    vAge = ageT;

    vec3 pos = aBasePos;
    // Rise distance is intentionally small now - the base positions already
    // cover the full blade, so each particle only needs to lick a little
    // further up from wherever it spawned rather than traveling the whole
    // blade length, which is what kept the fire feeling pinned to the tip.
    pos.y += ageT * 0.10;
    pos.x += sin(uTime * 6.0 + aSeed * 20.0) * 0.015 * ageT;
    pos.z += cos(uTime * 5.0 + aSeed * 17.0) * 0.015 * ageT;

    gl_Position = uModelViewProj * vec4(pos, 1.0);
    gl_PointSize = mix(11.0, 2.0, ageT);
  }`;

  const particleVertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(particleVertexShader, particleVertexSourceCode);
  gl.compileShader(particleVertexShader);
  if (!gl.getShaderParameter(particleVertexShader, gl.COMPILE_STATUS)) {
    const errorMessage = gl.getShaderInfoLog(particleVertexShader);
    showError(`Failed to compile particle vertex shader: ${errorMessage}`);
    return;
  }

  const particleFragmentSourceCode = `#version 300 es
  precision mediump float;

  in float vAge;
  out vec4 outputColor;

  void main() {
    // gl_PointCoord makes each point a little square texture - treat it as a
    // circle so particles read as soft blobs instead of glowing squares
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float edgeFade = smoothstep(0.5, 0.0, d);

    vec3 colorYoung = vec3(1.0, 0.9, 0.4);
    vec3 colorOld = vec3(0.85, 0.2, 0.05);
    vec3 color = mix(colorYoung, colorOld, vAge);

    float alpha = edgeFade * (1.0 - vAge);
    outputColor = vec4(color, alpha);
  }`;

  const particleFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(particleFragmentShader, particleFragmentSourceCode);
  gl.compileShader(particleFragmentShader);
  if (!gl.getShaderParameter(particleFragmentShader, gl.COMPILE_STATUS)) {
    const errorMessage = gl.getShaderInfoLog(particleFragmentShader);
    showError(`Failed to compile particle fragment shader: ${errorMessage}`);
    return;
  }

  const particleProgram = gl.createProgram();
  gl.attachShader(particleProgram, particleVertexShader);
  gl.attachShader(particleProgram, particleFragmentShader);
  gl.linkProgram(particleProgram);
  if (!gl.getProgramParameter(particleProgram, gl.LINK_STATUS)) {
    const errorMessage = gl.getProgramInfoLog(particleProgram);
    showError(`Failed to link particle GPU program: ${errorMessage}`);
    return;
  }

  const particlePosLoc = gl.getAttribLocation(particleProgram, 'aBasePos');
  const particleSeedLoc = gl.getAttribLocation(particleProgram, 'aSeed');
  if (particlePosLoc < 0 || particleSeedLoc < 0) {
    showError('Failed to get one or more particle attribute locations');
    return;
  }
  const particleMvpLoc = gl.getUniformLocation(particleProgram, 'uModelViewProj');
  const particleTimeLoc = gl.getUniformLocation(particleProgram, 'uTime');

  //
  // Setup Step 4: drawSword()/drawParticles() each bind their own buffers and
  // set their own uniforms right before drawing. This replaced binding
  // everything once up front, because with two programs now sharing the
  // context, whichever buffer was bound last "wins" - so each draw call has
  // to (re-)point its attributes at the right buffers every time.
  //
  gl.clearColor(0.08, 0.08, 0.08, 1.0);
  gl.enable(gl.DEPTH_TEST);

  function drawSword(mvp, model) {
    gl.useProgram(swordProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.enableVertexAttribArray(normalLoc);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    gl.uniformMatrix4fv(mvpLoc, false, mvp);
    gl.uniformMatrix4fv(modelLoc, false, model);

    // Opaque geometry: normal blending off, depth writes on
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
  }

  function drawParticles(mvp, timeSeconds) {
    gl.useProgram(particleProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, particlePosBuffer);
    gl.enableVertexAttribArray(particlePosLoc);
    gl.vertexAttribPointer(particlePosLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, particleSeedBuffer);
    gl.enableVertexAttribArray(particleSeedLoc);
    gl.vertexAttribPointer(particleSeedLoc, 1, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(particleMvpLoc, false, mvp);
    gl.uniform1f(particleTimeLoc, timeSeconds);

    // Additive blending gives the glow look; depth writes stay off so
    // overlapping particles blend together instead of harshly occluding
    // each other (they're still depth-tested against the sword itself)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
  }

  //
  // Drag-to-rotate: track pointer movement and turn it into yaw/pitch instead
  // of letting the angle advance on its own every frame. Mouse and touch are
  // both wired up so this works on desktop and mobile.
  //
  let rotY = 0;
  let rotX = 0.3; // initial tilt, same as the old static angle
  let isDragging = false;
  let lastX = 0, lastY = 0;

  function dragStart(x, y) {
    isDragging = true;
    lastX = x;
    lastY = y;
    canvas.style.cursor = 'grabbing';
  }
  function dragMove(x, y) {
    if (!isDragging) return;
    const dx = x - lastX;
    const dy = y - lastY;
    lastX = x;
    lastY = y;
    rotY += dx * 0.01;
    rotX += dy * 0.01;
    // Clamp pitch so the sword can't be flipped past straight up/down
    rotX = Math.max(-1.4, Math.min(1.4, rotX));
  }
  function dragEnd() {
    isDragging = false;
    canvas.style.cursor = 'grab';
  }

  canvas.style.cursor = 'grab';
  canvas.addEventListener('mousedown', (e) => dragStart(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => dragMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', dragEnd);

  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    dragStart(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    dragMove(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', dragEnd);

  function renderFrame() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height || 1;
    const projection = mat4Perspective(45 * Math.PI / 180, aspect, 0.1, 10);
    const view = mat4Translate(0, 0, -2.6);
    const model = mat4Multiply(mat4RotateY(rotY), mat4RotateX(rotX));

    const viewModel = mat4Multiply(view, model);
    const mvp = mat4Multiply(projection, viewModel);

    drawSword(mvp, model);
    drawParticles(mvp, performance.now() / 1000);

    requestAnimationFrame(renderFrame);
  }
  requestAnimationFrame(renderFrame);
}

try {
  sword3D();
} catch (e) {
  showError(`Uncaught JavaScript exception: ${e}`);
}
