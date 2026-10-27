// Swimming fish drawn on a 2D canvas above the water.
// Fish wander mostly left/right, wrap around the screen edges,
// and dart away when the cursor comes close.
// The big cartoon goldfish and clownfish are calm: they watch the cursor and blink.
(() => {
  const canvas = document.getElementById('fish');
  const ctx = canvas.getContext('2d');

  const COUNT = 14;          // number of small fish
  const GOLDFISH_COUNT = 1;  // number of big cartoon goldfish
  const CLOWNFISH_COUNT = 1; // number of big cartoon clownfish
  const MINI_COUNT = 100;    // tiny fish that swarm around the cursor
  const HUNT_RADIUS = 260;   // how far (px) big fish notice tiny fish
  const HUNT_SPEED = 170;    // big fish speed while chasing
  const MINI_PALETTES = [
    ['#2ec4ff', '#e0f7ff'],  // neon blue
    ['#ff4d6d', '#ffe0e6'],  // red
    ['#ffe14d', '#fffbe0'],  // yellow
    ['#7bffb2', '#e6fff0'],  // mint
  ];
  const FLEE_RADIUS = 160;   // cursor distance (px) that scares fish
  const PALETTES = [         // [back color, belly color]
    ['#ff8a3d', '#ffd9a8'],  // orange
    ['#ffcf3f', '#fff5c2'],  // yellow
    ['#2fb8d0', '#c9f6ff'],  // cyan
    ['#ff5d8f', '#ffd0de'],  // pink
    ['#8f7dff', '#e2ddff'],  // violet
    ['#9fb3c2', '#ffffff'],  // silver
  ];

  let W = 0, H = 0;
  const pointer = { x: -1e4, y: -1e4 };
  const fish = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  function makeFish() {
    const depth = Math.random();           // 0 = far away, 1 = close
    const dir = Math.random() < 0.5 ? 0 : Math.PI;
    const [back, belly] = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    return {
      x: rand(0, W),
      y: rand(H * 0.15, H * 0.95),
      depth,
      length: 28 + depth * 50,
      angle: dir,
      targetAngle: dir,
      baseDir: dir,
      speed: 40,
      cruise: rand(30, 60) * (0.6 + depth * 0.6),
      phase: rand(0, Math.PI * 2),
      turnTimer: rand(1, 4),
      back,
      belly,
    };
  }

  // Eye position of each cartoon fish in its own coordinates (facing +x, length 1)
  const EYES = {
    goldfish: { x: 0.17, y: -0.09 },
    clownfish: { x: 0.32, y: -0.07 },
  };
  // Mouth position of each cartoon fish, same units
  const MOUTHS = {
    goldfish: { x: 0.4, y: 0.1 },
    clownfish: { x: 0.45, y: 0.08 },
  };
  const BLINK_DURATION = 0.18;

  // Converts a point in a fish's own coordinates (length units) to screen position
  function toWorld(f, lx, ly) {
    const flip = Math.cos(f.angle) < 0 ? -1 : 1;
    const x = lx * f.length, y = ly * f.length * flip;
    const cos = Math.cos(f.angle), sin = Math.sin(f.angle);
    return { x: f.x + x * cos - y * sin, y: f.y + x * sin + y * cos };
  }

  // Big cartoon fish ('goldfish' or 'clownfish'): ignore the cursor,
  // hunt tiny fish, and have a moving, blinking eye
  function makeCartoonFish(kind) {
    const f = makeFish();
    f.kind = kind;
    f.depth = 1;
    const screen = Math.min(W, H);
    f.length = kind === 'clownfish'
      ? Math.max(150, Math.min(250, screen * 0.3))
      : Math.max(110, Math.min(190, screen * 0.22));
    f.cruise = rand(30, 40);
    f.eyePos = EYES[kind];
    f.look = { x: 0, y: 0 };        // where the eye points, -1..1
    f.lookTarget = { x: 1, y: 0 };
    f.lookTimer = 0;
    f.blink = 0;                     // 0 = open, 1 = closed
    f.blinkTime = -1;                // time into the current blink, -1 when not blinking
    f.blinkTimer = rand(1, 3);
    f.doubleBlink = false;
    f.hungerTimer = rand(1, 3);      // waits this long before hunting again
    f.prey = null;
    f.mouth = { x: f.x, y: f.y };    // mouth position on screen
    f.mouthOpen = 0;                 // 0..1, opens as prey gets close
    f.gulp = 0;                      // 1 right after eating, fades out
    return f;
  }

  function updateEye(f, dt) {
    // Watch the prey while hunting, otherwise the cursor
    const eye = toWorld(f, f.eyePos.x, f.eyePos.y);
    const flip = Math.cos(f.angle) < 0 ? -1 : 1;
    const cos = Math.cos(f.angle), sin = Math.sin(f.angle);
    const tx = f.prey ? f.prey.x : pointer.x, ty = f.prey ? f.prey.y : pointer.y;
    const vx = tx - eye.x, vy = ty - eye.y;
    const d = Math.hypot(vx, vy);
    if (d < 600) {
      // Look at the target: convert to the fish's own coordinates
      const lx = vx * cos + vy * sin;
      const ly = (-vx * sin + vy * cos) * flip;
      const k = Math.min(1, d / 60) / (d || 1);
      f.lookTarget.x = lx * k;
      f.lookTarget.y = ly * k;
    } else {
      // Glance around on its own
      f.lookTimer -= dt;
      if (f.lookTimer <= 0) {
        const a = rand(-1.2, 1.2);
        const r = rand(0.3, 1);
        f.lookTarget.x = Math.cos(a) * r;
        f.lookTarget.y = Math.sin(a) * r;
        f.lookTimer = rand(0.8, 2.5);
      }
    }
    const ease = Math.min(1, dt * 12);
    f.look.x += (f.lookTarget.x - f.look.x) * ease;
    f.look.y += (f.lookTarget.y - f.look.y) * ease;

    // Blinking
    if (f.blinkTime < 0) {
      f.blinkTimer -= dt;
      if (f.blinkTimer <= 0) f.blinkTime = 0;
    }
    if (f.blinkTime >= 0) {
      f.blinkTime += dt;
      f.blink = Math.sin(Math.PI * Math.min(1, f.blinkTime / BLINK_DURATION));
      if (f.blinkTime >= BLINK_DURATION) {
        f.blink = 0;
        f.blinkTime = -1;
        // Sometimes blink twice in a row
        f.doubleBlink = !f.doubleBlink && Math.random() < 0.25;
        f.blinkTimer = f.doubleBlink ? 0.12 : rand(2, 5);
      }
    }
  }

  // Finds the nearest tiny fish to chase, and eats it when it reaches the mouth
  function hunt(f, dt) {
    f.mouth = toWorld(f, MOUTHS[f.kind].x, MOUTHS[f.kind].y);
    f.gulp = Math.max(0, f.gulp - dt * 2.5);
    f.prey = null;

    f.hungerTimer -= dt;
    let bestD = HUNT_RADIUS;
    if (f.hungerTimer <= 0) {
      for (const o of fish) {
        if (!o.mini || o.eaten) continue;
        const d = Math.hypot(o.x - f.mouth.x, o.y - f.mouth.y);
        if (d < bestD) { bestD = d; f.prey = o; }
      }
    }

    const wantOpen = f.prey && bestD < 90 ? 1 : 0;
    f.mouthOpen += (wantOpen - f.mouthOpen) * Math.min(1, dt * 10);

    if (f.prey && bestD < f.length * 0.08 + 8) {
      eat(f.prey, f.mouth);
      f.prey = null;
      f.mouthOpen = 0;
      f.gulp = 1;
      f.hungerTimer = rand(1.2, 3.5);
    }
  }

  function eat(mini, at) {
    mini.eaten = true;
    mini.respawn = rand(2, 5);
    for (let i = 0; i < 5; i++) {
      bubbles.push({
        x: at.x + rand(-6, 6), y: at.y + rand(-6, 6),
        r: rand(1.5, 4), vy: rand(-60, -30), vx: rand(-15, 15), life: 1,
      });
    }
  }

  // ---------- Bubbles from a bite ----------
  const bubbles = [];

  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt * 0.8;
      if (b.life <= 0) bubbles.splice(i, 1);
    }
  }

  function drawBubbles() {
    ctx.lineWidth = 1.2;
    for (const b of bubbles) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${b.life * 0.8})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---------- Mini fish: a school that circles the cursor ----------
  const schoolTarget = { x: 0, y: 0, goalX: 0, goalY: 0, timer: 0 };

  function makeMini() {
    const [back, belly] = MINI_PALETTES[Math.floor(Math.random() * MINI_PALETTES.length)];
    return {
      mini: true,
      x: rand(0, W),
      y: rand(0, H),
      vx: rand(-40, 40),
      vy: rand(-40, 40),
      angle: 0,
      depth: 0.8,
      length: rand(10, 17),
      phase: rand(0, Math.PI * 2),
      orbitAngle: rand(0, Math.PI * 2),
      orbitRadius: rand(30, 110),
      orbitSpeed: rand(0.6, 1.4) * (Math.random() < 0.5 ? -1 : 1),
      maxSpeed: rand(260, 380),
      back,
      belly,
    };
  }

  // Where the school gathers: the cursor, or a slowly drifting spot when it's away
  function updateSchoolTarget(dt) {
    if (pointer.x > -1e3) {
      schoolTarget.x = pointer.x;
      schoolTarget.y = pointer.y;
      return;
    }
    schoolTarget.timer -= dt;
    if (schoolTarget.timer <= 0) {
      schoolTarget.goalX = rand(W * 0.15, W * 0.85);
      schoolTarget.goalY = rand(H * 0.2, H * 0.85);
      schoolTarget.timer = rand(3, 6);
    }
    const ease = Math.min(1, dt * 0.5);
    schoolTarget.x += (schoolTarget.goalX - schoolTarget.x) * ease;
    schoolTarget.y += (schoolTarget.goalY - schoolTarget.y) * ease;
  }

  function updateMini(f, dt) {
    // Eaten fish come back later from a side of the screen
    if (f.eaten) {
      f.respawn -= dt;
      if (f.respawn > 0) return;
      f.eaten = false;
      f.x = Math.random() < 0.5 ? -20 : W + 20;
      f.y = rand(H * 0.2, H * 0.9);
      f.vx = f.x < 0 ? 150 : -150;
      f.vy = 0;
    }

    // Each fish circles the target on its own orbit
    f.orbitAngle += f.orbitSpeed * dt;
    const destX = schoolTarget.x + Math.cos(f.orbitAngle) * f.orbitRadius;
    const destY = schoolTarget.y + Math.sin(f.orbitAngle) * f.orbitRadius * 0.7;

    const dx = destX - f.x, dy = destY - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = Math.min(f.maxSpeed, d * 2.5 + 40);
    let wantX = dx / d * speed, wantY = dy / d * speed;

    // Keep a little space from each other
    for (const o of fish) {
      if (o === f) continue;
      if (o.kind) {
        // Try to dodge a big fish's mouth
        const mx = f.x - o.mouth.x, my = f.y - o.mouth.y;
        const md = Math.hypot(mx, my);
        if (md > 0 && md < 70) {
          wantX += mx / md * (70 - md) * 3;
          wantY += my / md * (70 - md) * 3;
        }
        continue;
      }
      if (!o.mini || o.eaten) continue;
      const sx = f.x - o.x, sy = f.y - o.y;
      const sd = Math.hypot(sx, sy);
      if (sd > 0 && sd < 16) {
        wantX += sx / sd * (16 - sd) * 12;
        wantY += sy / sd * (16 - sd) * 12;
      }
    }

    const ease = Math.min(1, dt * 3);
    f.vx += (wantX - f.vx) * ease;
    f.vy += (wantY - f.vy) * ease;
    f.x += f.vx * dt;
    f.y += f.vy * dt;

    const v = Math.hypot(f.vx, f.vy);
    if (v > 5) f.angle = Math.atan2(f.vy, f.vx);
    f.phase += dt * (8 + v * 0.06);
  }

  function update(f, dt) {
    if (f.mini) return updateMini(f, dt);

    // Pick a new wandering direction now and then
    f.turnTimer -= dt;
    if (f.turnTimer <= 0) {
      if (Math.random() < 0.15) f.baseDir = f.baseDir === 0 ? Math.PI : 0;
      f.targetAngle = f.baseDir + rand(-0.45, 0.45);
      f.turnTimer = rand(2, 5);
    }

    // Stay away from the very top and bottom
    const facingRight = Math.cos(f.baseDir) > 0;
    if (f.y < H * 0.1) f.targetAngle = f.baseDir + (facingRight ? 0.5 : -0.5);
    if (f.y > H * 0.95) f.targetAngle = f.baseDir + (facingRight ? -0.5 : 0.5);

    // Flee from the cursor (the big cartoon fish stay calm)
    let targetSpeed = f.cruise;
    const dx = f.x - pointer.x, dy = f.y - pointer.y;
    const dist = f.kind ? Infinity : Math.hypot(dx, dy);
    if (dist < FLEE_RADIUS) {
      f.targetAngle = Math.atan2(dy, dx);
      f.baseDir = Math.cos(f.targetAngle) > 0 ? 0 : Math.PI;
      targetSpeed = f.cruise * 4 * (1 - dist / FLEE_RADIUS) + f.cruise;
      f.turnTimer = rand(1, 2);
    }

    // Big fish chase the nearest tiny fish
    let turnRate = dist < FLEE_RADIUS ? 6 : 1.5;
    if (f.kind) {
      hunt(f, dt);
      if (f.prey) {
        f.targetAngle = Math.atan2(f.prey.y - f.y, f.prey.x - f.x);
        f.baseDir = Math.cos(f.targetAngle) > 0 ? 0 : Math.PI;
        f.turnTimer = rand(1, 2);
        targetSpeed = HUNT_SPEED;
        turnRate = 3.5;
      }
    }

    // Smoothly turn and change speed
    let diff = f.targetAngle - f.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    f.angle += diff * Math.min(1, dt * turnRate);
    f.speed += (targetSpeed - f.speed) * Math.min(1, dt * 2);

    f.x += Math.cos(f.angle) * f.speed * dt;
    f.y += Math.sin(f.angle) * f.speed * dt;
    f.phase += dt * (5 + f.speed * 0.08);

    // Wrap around horizontally, keep inside vertically
    const m = f.length;
    if (f.x < -m) f.x = W + m;
    if (f.x > W + m) f.x = -m;
    f.y = Math.max(m * 0.5, Math.min(H - m * 0.5, f.y));

    if (f.kind) updateEye(f, dt);
  }

  // Draws a row of rounded bumps from the current point to (x1, y1),
  // bulging outward for paths traced counter-clockwise on screen.
  function scallop(x0, y0, x1, y1, n, amp) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 1; i <= n; i++) {
      const ax = x0 + dx * (i - 1) / n, ay = y0 + dy * (i - 1) / n;
      const bx = x0 + dx * i / n, by = y0 + dy * i / n;
      ctx.quadraticCurveTo((ax + bx) / 2 + nx * amp, (ay + by) / 2 + ny * amp, bx, by);
    }
  }

  // Cartoon eye that looks toward f.look and blinks with f.blink.
  // Drawn in fish-length units, inside the cartoon fish's transform.
  function drawEye(f, o) {
    const EX = f.eyePos.x, EY = f.eyePos.y, RX = o.rx, RY = o.ry;
    const irisR = RX * 0.7;
    const ix = EX + f.look.x * (RX - irisR * 0.7);
    const iy = EY + f.look.y * (RY - irisR * 0.8);

    const eyePath = new Path2D();
    eyePath.ellipse(EX, EY, RX, RY, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill(eyePath);

    ctx.save();
    ctx.clip(eyePath);
    ctx.fillStyle = o.iris;
    ctx.beginPath();
    ctx.arc(ix, iy, irisR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#05051a';
    ctx.beginPath();
    ctx.arc(ix, iy, irisR * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ix - irisR * 0.3, iy - irisR * 0.35, irisR * 0.28, 0, Math.PI * 2);
    ctx.arc(ix + irisR * 0.35, iy + irisR * 0.35, irisR * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // Eyelid slides down from the top while blinking
    if (f.blink > 0) {
      const lidY = EY - RY + RY * 2 * f.blink;
      ctx.fillStyle = o.lid;
      ctx.fillRect(EX - RX, EY - RY, RX * 2, lidY - (EY - RY));
      ctx.strokeStyle = o.lidLine;
      ctx.lineWidth = 0.01;
      ctx.beginPath();
      ctx.moveTo(EX - RX, lidY);
      ctx.lineTo(EX + RX, lidY);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.012;
    ctx.stroke(eyePath);

    // Brow
    ctx.strokeStyle = o.brow;
    ctx.lineWidth = o.browWidth;
    ctx.beginPath();
    ctx.ellipse(EX, EY, RX + 0.025, RY + 0.025, 0, Math.PI * 1.1, Math.PI * 1.75);
    ctx.stroke();
  }

  // Fan-shaped fin: orange rays with a black scalloped rim, like a clownfish fin.
  // (cx, cy) is the base, r the length, a0..a1 the spread angle.
  function fanFin(cx, cy, r, a0, a1, n) {
    function fanPath(rr) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr);
      for (let i = 1; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n;
        const am = a0 + (a1 - a0) * (i - 0.5) / n;
        ctx.quadraticCurveTo(cx + Math.cos(am) * rr * 1.12, cy + Math.sin(am) * rr * 1.12,
                             cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
    }
    fanPath(r);
    ctx.fillStyle = '#1b1b1b';
    ctx.fill();
    fanPath(r * 0.8);
    ctx.fillStyle = '#ff5a00';
    ctx.fill();

    ctx.strokeStyle = '#c63d00';
    ctx.lineWidth = 0.006;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      ctx.moveTo(cx + Math.cos(a) * r * 0.15, cy + Math.sin(a) * r * 0.15);
      ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
    }
    ctx.stroke();
  }

  // Dark open mouth that grows as prey gets close
  function drawOpenMouth(f) {
    if (f.mouthOpen < 0.05) return;
    const m = MOUTHS[f.kind];
    const L = f.length;
    ctx.save();
    ctx.scale(L, L);
    ctx.beginPath();
    ctx.ellipse(m.x - 0.02, m.y, 0.035 * f.mouthOpen + 0.01, 0.06 * f.mouthOpen, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4a0618';
    ctx.fill();
    ctx.strokeStyle = f.kind === 'goldfish' ? '#ffc823' : '#ff6a10';
    ctx.lineWidth = 0.018;
    ctx.stroke();
    ctx.restore();
  }

  function drawClownfish(f) {
    const s = Math.sin(f.phase) * 0.12;          // tail sway (angle)
    const flap = Math.sin(f.phase * 1.3) * 0.15; // fin flap (angle)
    const OUTLINE = '#a33000';

    ctx.save();
    ctx.scale(f.length, f.length); // draw in units of fish length
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Fins behind the body
    fanFin(-0.3, 0.01, 0.3, Math.PI - 0.8 + s, Math.PI + 0.8 + s, 6);  // tail
    fanFin(-0.12, -0.13, 0.21, -2.9, -1.75 + flap * 0.5, 4);           // back dorsal
    fanFin(0.06, -0.17, 0.25, -2.75, -1.55 + flap * 0.5, 5);           // front dorsal
    fanFin(-0.12, 0.13, 0.2, 1.75 - flap * 0.5, 2.9, 4);               // bottom back
    fanFin(0.08, 0.17, 0.18, 1.35, 2.3 - flap * 0.5, 3);               // bottom front

    // Body
    const bodyPath = new Path2D();
    bodyPath.moveTo(0.48, 0.03);
    bodyPath.bezierCurveTo(0.44, -0.17, 0.22, -0.23, -0.02, -0.21);
    bodyPath.bezierCurveTo(-0.18, -0.18, -0.26, -0.1, -0.33, -0.065);
    bodyPath.lineTo(-0.33, 0.08);
    bodyPath.bezierCurveTo(-0.24, 0.12, -0.06, 0.21, 0.14, 0.21);
    bodyPath.bezierCurveTo(0.36, 0.21, 0.5, 0.14, 0.48, 0.03);
    const grad = ctx.createLinearGradient(0, -0.21, 0, 0.21);
    grad.addColorStop(0, '#ff8a3d');
    grad.addColorStop(0.45, '#ff5a00');
    grad.addColorStop(1, '#e04800');
    ctx.fillStyle = grad;
    ctx.fill(bodyPath);

    // White stripes with black edges (kept inside the body)
    ctx.save();
    ctx.clip(bodyPath);
    for (const [x0, cx, x1, black, white] of [
      [0.23, 0.13, 0.23, 0.11, 0.07],    // head stripe
      [-0.04, -0.12, -0.04, 0.1, 0.06],  // middle stripe
      [-0.29, -0.29, -0.29, 0.065, 0.03] // tail stripe
    ]) {
      for (const [color, width] of [['#1b1b1b', black], ['#fff', white]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x0, -0.3);
        ctx.quadraticCurveTo(cx, 0, x1, 0.3);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.006;
    ctx.stroke(bodyPath);

    // Side fin (in front of the body)
    fanFin(0.1, 0.04, 0.21, Math.PI - 0.75 - flap, Math.PI + 0.85 - flap, 5);

    // Mouth: open smile with pink inside and a puffy upper lip
    ctx.beginPath();
    ctx.moveTo(0.36, 0.075);
    ctx.quadraticCurveTo(0.42, 0.15, 0.475, 0.07);
    ctx.closePath();
    ctx.fillStyle = '#b3123f';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.42, 0.105, 0.03, 0.014, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#f48fb1';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.45, 0.045, 0.06, 0.026, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6a10';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.006;
    ctx.stroke();

    drawEye(f, {
      rx: 0.052, ry: 0.062, iris: '#6d3a1f',
      lid: '#ff6a10', lidLine: OUTLINE, brow: '#1b1b1b', browWidth: 0.014,
    });

    ctx.restore();
  }

  function drawGoldfish(f) {
    const L = f.length;
    const s = Math.sin(f.phase) * 0.06;          // tail sway
    const flap = Math.sin(f.phase * 1.3) * 0.03; // fin flap
    const FIN = '#ee1c1c', FIN_DARK = '#b30000';
    const OUTLINE = '#d97a00';

    ctx.save();
    ctx.scale(L, L); // draw in units of fish length
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    function finStyle() {
      ctx.fillStyle = FIN;
      ctx.strokeStyle = FIN_DARK;
      ctx.lineWidth = 0.01;
      ctx.fill();
      ctx.stroke();
    }

    function finLines(lines) {
      ctx.strokeStyle = FIN_DARK;
      ctx.lineWidth = 0.007;
      ctx.beginPath();
      for (const [x0, y0, cx, cy, x1, y1] of lines) {
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
      }
      ctx.stroke();
    }

    // Tail
    ctx.beginPath();
    ctx.moveTo(-0.24, -0.06);
    ctx.quadraticCurveTo(-0.4, -0.18, -0.62, -0.44 + s);
    scallop(-0.62, -0.44 + s, -0.5, 0.02 + s * 0.5, 3, 0.035);
    scallop(-0.5, 0.02 + s * 0.5, -0.68, 0.46 + s, 3, 0.035);
    ctx.quadraticCurveTo(-0.42, 0.26, -0.24, 0.1);
    ctx.closePath();
    finStyle();
    finLines([
      [-0.28, -0.02, -0.42, -0.15, -0.56, -0.34 + s],
      [-0.28, 0.02, -0.4, 0.02, -0.5, -0.06 + s],
      [-0.28, 0.05, -0.42, 0.15, -0.55, 0.22 + s],
      [-0.28, 0.07, -0.44, 0.26, -0.62, 0.4 + s],
    ]);

    // Dorsal fin
    ctx.beginPath();
    ctx.moveTo(0.08, -0.24);
    ctx.quadraticCurveTo(0.1, -0.45, -0.05, -0.53 + flap);
    scallop(-0.05, -0.53 + flap, -0.33, -0.12, 4, 0.03);
    ctx.lineTo(-0.1, -0.1);
    ctx.closePath();
    finStyle();
    finLines([
      [0.0, -0.25, 0.02, -0.4, -0.06, -0.47 + flap],
      [-0.08, -0.22, -0.1, -0.33, -0.18, -0.36],
      [-0.16, -0.18, -0.2, -0.22, -0.26, -0.22],
    ]);

    // Lower front fin (behind the body)
    ctx.beginPath();
    ctx.moveTo(-0.02, 0.24);
    ctx.quadraticCurveTo(-0.04, 0.36, 0.0, 0.44 - flap);
    scallop(0.0, 0.44 - flap, 0.4, 0.4 + flap, 4, 0.03);
    ctx.lineTo(0.16, 0.24);
    ctx.closePath();
    finStyle();
    finLines([
      [0.04, 0.27, 0.1, 0.36, 0.12, 0.43],
      [0.1, 0.27, 0.2, 0.34, 0.27, 0.41],
    ]);

    // Body
    const bodyPath = new Path2D();
    bodyPath.moveTo(0.36, -0.06);
    bodyPath.bezierCurveTo(0.3, -0.34, -0.12, -0.34, -0.3, -0.02);
    bodyPath.bezierCurveTo(-0.12, 0.3, 0.32, 0.36, 0.38, 0.12);
    bodyPath.bezierCurveTo(0.42, 0.04, 0.4, -0.02, 0.36, -0.06);
    const grad = ctx.createRadialGradient(0.12, -0.12, 0.02, 0.05, 0, 0.42);
    grad.addColorStop(0, '#ffe066');
    grad.addColorStop(0.6, '#ffc20e');
    grad.addColorStop(1, '#f5a000');
    ctx.fillStyle = grad;
    ctx.fill(bodyPath);

    // Scales and head line (kept inside the body)
    ctx.save();
    ctx.clip(bodyPath);
    ctx.strokeStyle = '#f08c00';
    ctx.lineWidth = 0.012;
    for (const [x, y] of [[-0.06, -0.14], [-0.06, 0.0], [-0.06, 0.14], [-0.14, -0.07],
                          [-0.14, 0.07], [-0.14, 0.2], [-0.22, -0.02], [-0.22, 0.1]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.035, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#e88a00';
    ctx.lineWidth = 0.014;
    ctx.beginPath();
    ctx.moveTo(0.06, -0.3);
    ctx.quadraticCurveTo(-0.06, 0.0, 0.08, 0.32);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.012;
    ctx.stroke(bodyPath);

    // Mouth: open smile with pink inside and a puffy upper lip
    ctx.beginPath();
    ctx.moveTo(0.27, 0.07);
    ctx.quadraticCurveTo(0.36, 0.2, 0.42, 0.09);
    ctx.closePath();
    ctx.fillStyle = '#c2185b';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.35, 0.135, 0.04, 0.02, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#f48fb1';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.37, 0.06, 0.08, 0.032, -0.25, 0, Math.PI * 2);
    ctx.fillStyle = '#ffc823';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.01;
    ctx.stroke();

    drawEye(f, {
      rx: 0.085, ry: 0.11, iris: '#1a2a8a',
      lid: '#ffc20e', lidLine: OUTLINE, brow: '#e88a00', browWidth: 0.012,
    });

    // Side fin (in front of the body)
    ctx.beginPath();
    ctx.moveTo(0.07, 0.07);
    ctx.lineTo(-0.07, 0.09);
    scallop(-0.07, 0.09, -0.1, 0.44 + flap * 2, 3, 0.03);
    scallop(-0.1, 0.44 + flap * 2, 0.13, 0.37 + flap * 2, 3, 0.03);
    ctx.closePath();
    finStyle();
    finLines([
      [0.0, 0.1, -0.05, 0.25, -0.06, 0.38 + flap * 2],
      [0.04, 0.1, 0.04, 0.25, 0.06, 0.36 + flap * 2],
    ]);

    ctx.restore();
  }

  function draw(f) {
    const L = f.length;
    const h = L * 0.28;
    const sway = Math.sin(f.phase) * L * 0.1;

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    if (Math.cos(f.angle) < 0) ctx.scale(1, -1); // keep belly down
    ctx.globalAlpha = 0.45 + f.depth * 0.55;    // far fish fade into the water

    if (f.kind) {
      // Body bulges a little right after a gulp
      ctx.scale(1 + f.gulp * 0.06, 1 + f.gulp * 0.12);
      if (f.kind === 'goldfish') drawGoldfish(f);
      else drawClownfish(f);
      drawOpenMouth(f);
      ctx.restore();
      return;
    }

    const grad = ctx.createLinearGradient(0, -h, 0, h);
    grad.addColorStop(0, f.back);
    grad.addColorStop(1, f.belly);

    // Tail
    ctx.fillStyle = f.back;
    ctx.beginPath();
    ctx.moveTo(-L * 0.3, 0);
    ctx.lineTo(-L * 0.56, -L * 0.2 + sway);
    ctx.quadraticCurveTo(-L * 0.47, sway, -L * 0.56, L * 0.2 + sway);
    ctx.closePath();
    ctx.fill();

    // Dorsal fin
    ctx.beginPath();
    ctx.moveTo(L * 0.12, -h * 0.8);
    ctx.quadraticCurveTo(-L * 0.05, -h * 1.6, -L * 0.22, -h * 0.55);
    ctx.closePath();
    ctx.fill();

    // Body
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.bezierCurveTo(L * 0.32, -h * 1.3, -L * 0.18, -h * 1.1, -L * 0.34, sway * 0.3);
    ctx.bezierCurveTo(-L * 0.18, h * 1.1, L * 0.32, h * 1.3, L * 0.5, 0);
    ctx.fill();

    // Gill line
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = Math.max(1, L * 0.02);
    ctx.beginPath();
    ctx.arc(L * 0.38, 0, h * 0.75, Math.PI * 0.7, Math.PI * 1.3);
    ctx.stroke();

    // Side fin
    ctx.fillStyle = f.back;
    ctx.beginPath();
    ctx.ellipse(L * 0.12, h * 0.35, L * 0.1, L * 0.035, 0.5 + Math.sin(f.phase * 1.3) * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(L * 0.34, -h * 0.2, L * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(L * 0.355, -h * 0.2, L * 0.028, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  window.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; });
  window.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });
  window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (t) { pointer.x = t.clientX; pointer.y = t.clientY; }
  }, { passive: true });
  window.addEventListener('touchend', () => { pointer.x = pointer.y = -1e4; });
  window.addEventListener('resize', resize);

  resize();
  for (let i = 0; i < COUNT; i++) fish.push(makeFish());
  for (let i = 0; i < GOLDFISH_COUNT; i++) fish.push(makeCartoonFish('goldfish'));
  for (let i = 0; i < CLOWNFISH_COUNT; i++) fish.push(makeCartoonFish('clownfish'));
  for (let i = 0; i < MINI_COUNT; i++) fish.push(makeMini());
  fish.sort((a, b) => a.depth - b.depth); // draw far fish first
  schoolTarget.x = schoolTarget.goalX = W / 2;
  schoolTarget.y = schoolTarget.goalY = H / 2;

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    ctx.clearRect(0, 0, W, H);
    updateSchoolTarget(dt);
    updateBubbles(dt);
    for (const f of fish) {
      update(f, dt);
      if (!f.eaten) draw(f);
    }
    drawBubbles();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
