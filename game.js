// ═══════════════════════════════════════════════════════════════
//  🏏  CRICKET DOODLE — Mobile & Desktop Responsive Arcade Engine
//  Everything on a single <canvas>. Click / Tap / Space to bat.
//  Core mechanic: Timing Meter with oscillating needle.
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  /* ─── Canvas & High-DPI Mobile Scaling ────────────────────── */
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');
  const W = 800, H = 520;
  const ASPECT_RATIO = W / H;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const container = document.getElementById('app-container');
    const availWidth = container ? container.clientWidth : window.innerWidth;
    const availHeight = container ? container.clientHeight : window.innerHeight;

    let displayW = availWidth;
    let displayH = availWidth / ASPECT_RATIO;

    if (displayH > availHeight) {
      displayH = availHeight;
      displayW = availHeight * ASPECT_RATIO;
    }

    // High-DPI physical resolution
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    // CSS Display dimensions
    canvas.style.width = Math.floor(displayW) + 'px';
    canvas.style.height = Math.floor(displayH) + 'px';

    // Scale canvas context to logical (800x520) resolution
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
    ctx.scale((canvas.width / W), (canvas.height / H));
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

  /* ─── Palette ────────────────────────────────────────────── */
  const C = {
    skyTop:     '#c8e6fc', skyBot:     '#e8f4fd',
    grass1:     '#6abf40', grass2:     '#5aad32',
    pitch:      '#e2c97a', pitchLine:  '#f0dfa0',
    outline:    '#3b3022',
    white:      '#ffffff',
    batWood:    '#c48a3c', batHandle:  '#f2e2b8',
    ballRed:    '#e04030', ballShine:  '#f48070',
    blue:       '#4285f4', red:        '#ea4335',
    yellow:     '#fbbc04', green:      '#34a853',
    skin:       '#fdd9b5', skinDark:   '#d4a76a',
    stump:      '#f0d58c', stumpEdge:  '#c4a55a',
    shadow:     'rgba(50,40,20,0.18)',
    scoreBg:    'rgba(255,255,255,0.88)',
    panelStroke:'rgba(50,40,20,0.12)',
    textMain:   '#3b3022',
    textMuted:  '#9a8e7e',
    meterBg:    '#e8e0d0',
    meterPerfect:'#34a853', meterGood:'#fbbc04', meterBad:'#ea4335',
  };

  /* ─── Tiny Web-Audio synth ───────────────────────────────── */
  let aCtx = null, soundOn = true;
  function ensureAudio() {
    if (!aCtx) aCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (aCtx.state === 'suspended') aCtx.resume();
  }
  function tone(f, d, t, v) {
    if (!soundOn || !aCtx) return;
    try {
      const o = aCtx.createOscillator(), g = aCtx.createGain();
      o.type = t || 'sine';
      o.frequency.setValueAtTime(f, aCtx.currentTime);
      g.gain.setValueAtTime(v || 0.22, aCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, aCtx.currentTime + d);
      o.connect(g).connect(aCtx.destination);
      o.start(); o.stop(aCtx.currentTime + d);
    } catch (_) {}
  }
  // Sound library
  function sfxCrack() {
    tone(320, 0.07, 'triangle', 0.7);
    tone(140, 0.12, 'triangle', 0.5);
    tone(2200, 0.03, 'sawtooth', 0.15);
  }
  function sfxCheerSix() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.28), i * 70));
  }
  function sfxCheerFour() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'sine', 0.24), i * 90));
  }
  function sfxOut() { tone(180, 0.18, 'sawtooth', 0.4); tone(90, 0.28, 'sawtooth', 0.3); }
  function sfxBowl() { tone(550, 0.05, 'sine', 0.10); }
  function sfxBounce() { tone(900, 0.04, 'triangle', 0.12); }
  function sfxClick() { tone(660, 0.04, 'sine', 0.12); }

  /* ─── Constants ──────────────────────────────────────────── */
  const MAX_WICKETS  = 3;
  const GROUND_Y     = 380;
  const PITCH_TOP    = 100;
  const PITCH_BOT    = 430;
  const BATSMAN_X    = 400;
  const BATSMAN_Y    = GROUND_Y;
  const METER_Y      = H - 38;
  const METER_W      = 320;
  const METER_H      = 18;
  const METER_X      = (W - METER_W) / 2;

  /* ─── State ──────────────────────────────────────────────── */
  let state       = 'TITLE';  // TITLE | BOWLING | RESULT | GAMEOVER
  let score       = 0;
  let wickets     = 0;
  let balls       = 0;
  let highScore   = +(localStorage.getItem('doodle_hs2') || 0);
  let lastResult  = '';       // SIX, FOUR, 2, 1, OUT, DOT, BOWLED
  let resultTimer = 0;
  let shakeTimer  = 0;
  let shakeIntensity = 0;
  let frame       = 0;
  let difficulty  = 1;

  /* ─── Timing Meter ───────────────────────────────────────── */
  const meter = {
    pos: 0,
    dir: 1,
    speed: 0.018,
    active: false,
    frozenPos: -1,
    frozenTimer: 0,
  };

  const ZONE_PERFECT = 0.14;
  const ZONE_GOOD    = 0.28;

  function getMeterZone(pos) {
    const d = Math.abs(pos - 0.5);
    if (d <= ZONE_PERFECT) return 'PERFECT';
    if (d <= ZONE_GOOD)    return 'GOOD';
    return 'BAD';
  }

  /* ─── Ball ───────────────────────────────────────────────── */
  const ball = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    radius: 5,
    active: false,
    hit: false,
    trail: [],
    squash: 1,
    bounced: false,
    bounceY: 0,
    shadowScale: 1,
    heightOffset: 0,
  };

  /* ─── Bowler ─────────────────────────────────────────────── */
  const bowler = {
    baseY: PITCH_TOP + 10,
    runY: 0,
    phase: 'IDLE',
    armAngle: 0,
    deliveryFrame: 0,
  };

  /* ─── Batsman ────────────────────────────────────────────── */
  const bat = {
    angle: -0.55,
    swinging: false,
    swingT: 0,
    idleBob: 0,
    impactFlash: 0,
  };

  /* ─── Fielders ───────────────────────────────────────────── */
  const fielderDefs = [
    { homeX: 180, homeY: 200, jersey: C.red },
    { homeX: 620, homeY: 200, jersey: C.red },
    { homeX: 400, homeY: 120, jersey: '#d93025' },
  ];
  let fielders = fielderDefs.map(f => ({
    x: f.homeX, y: f.homeY, tx: f.homeX, ty: f.homeY,
    jersey: f.jersey, anim: 'IDLE', animT: 0,
  }));

  /* ─── Particles ──────────────────────────────────────────── */
  let particles    = [];
  let floatingText = [];

  /* ─── Clouds ─────────────────────────────────────────────── */
  const clouds = [
    { x: 90, y: 30, w: 95 },
    { x: 380, y: 18, w: 70 },
    { x: 620, y: 38, w: 105 },
    { x: 250, y: 50, w: 60 },
  ];

  /* ─── Helpers ────────────────────────────────────────────── */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(lo, hi)  { return lo + Math.random() * (hi - lo); }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  }
  function springEase(t) {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }

  /* ═══════════════════════════════════════════════════════════
     DRAWING FUNCTIONS
     ═══════════════════════════════════════════════════════════ */

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(1, C.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND_Y);
  }

  function drawClouds() {
    ctx.fillStyle = C.white;
    clouds.forEach(c => {
      const dx = Math.sin(frame * 0.002 + c.x * 0.03) * 8;
      const cx = c.x + dx;
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.ellipse(cx, c.y, c.w * 0.48, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx - c.w * 0.26, c.y + 5, c.w * 0.30, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + c.w * 0.28, c.y + 4, c.w * 0.26, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function drawGround() {
    ctx.fillStyle = C.grass1;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = C.grass2;
    for (let y = GROUND_Y; y < H; y += 20) {
      ctx.fillRect(0, y, W, 10);
    }
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.ellipse(400, 270, 365, 195, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPitch() {
    ctx.fillStyle = C.pitch;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(378, PITCH_TOP);
    ctx.lineTo(422, PITCH_TOP);
    ctx.lineTo(438, PITCH_BOT);
    ctx.lineTo(362, PITCH_BOT);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.strokeStyle = C.pitchLine;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(374, PITCH_TOP + 28); ctx.lineTo(426, PITCH_TOP + 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(360, GROUND_Y + 8);  ctx.lineTo(440, GROUND_Y + 8);  ctx.stroke();

    drawStumps(400, PITCH_TOP + 6, 0.55);
    drawStumps(400, PITCH_BOT - 6, 0.95);
  }

  function drawStumps(x, y, s) {
    const sw = 3 * s, sh = 22 * s, gap = 6 * s;
    ctx.strokeStyle = C.stumpEdge; ctx.lineWidth = 1.5;
    ctx.fillStyle = C.stump;
    for (let i = -1; i <= 1; i++) {
      const sx = x + i * gap - sw / 2;
      ctx.fillRect(sx, y - sh, sw, sh);
      ctx.strokeRect(sx, y - sh, sw, sh);
    }
    ctx.fillStyle = C.yellow;
    ctx.fillRect(x - gap - sw, y - sh, gap * 2 + sw * 2, 3 * s);
  }

  function drawShadow(x, y, rx, ry) {
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry || rx * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPerson(x, y, jersey, scale, flipX, armA, diving) {
    const s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flipX ? -s : s, s);

    drawShadow(0, 14, 12, 4);

    ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
    const legSpread = diving ? 8 : 0;
    ctx.beginPath(); ctx.moveTo(-4, 2);  ctx.lineTo(-6 - legSpread, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 2);   ctx.lineTo(6 + legSpread, 14);  ctx.stroke();

    ctx.fillStyle = C.outline;
    ctx.beginPath(); ctx.ellipse(-6 - legSpread, 15, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6 + legSpread, 15, 5, 3, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = jersey;
    ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -5, 12, 13, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    const aa = armA || 0;
    ctx.strokeStyle = C.skin; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-11, -8); ctx.lineTo(-17 + (diving ? -8 : 0), -8 + Math.sin(aa) * 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, -8);  ctx.lineTo(17 + (diving ? 8 : 0), -8 + Math.sin(-aa) * 10); ctx.stroke();

    ctx.fillStyle = C.skin; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -22, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = C.outline;
    ctx.beginPath(); ctx.arc(-3, -23, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -23, 1.8, 0, Math.PI * 2);  ctx.fill();

    ctx.strokeStyle = C.outline; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, -20, 3.5, 0.15, Math.PI - 0.15); ctx.stroke();

    ctx.fillStyle = jersey; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, -28, 11, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.restore();
  }

  function drawBatsman() {
    const x = BATSMAN_X, y = BATSMAN_Y;
    const bob = Math.sin(bat.idleBob) * 1.2;

    ctx.save();
    ctx.translate(x, y + bob);

    if (bat.impactFlash > 0) {
      ctx.globalAlpha = bat.impactFlash * 0.4;
      ctx.fillStyle = C.yellow;
      ctx.beginPath(); ctx.arc(12, -10, 35, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawShadow(0, 18, 16, 5);

    ctx.fillStyle = C.white; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.roundRect(-10, 0, 8, 18, 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(2, 0, 8, 18, 2);   ctx.fill(); ctx.stroke();

    ctx.fillStyle = C.outline;
    ctx.beginPath(); ctx.ellipse(-6, 19, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6, 19, 6, 3.5, 0, 0, Math.PI * 2);  ctx.fill();

    ctx.fillStyle = C.blue; ctx.strokeStyle = C.outline; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(0, -8, 14, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = C.white; ctx.font = 'bold 11px Nunito'; ctx.textAlign = 'center';
    ctx.fillText('18', 0, -3);

    ctx.strokeStyle = C.skin; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-13, -12); ctx.lineTo(-21, -2); ctx.stroke();
    ctx.fillStyle = C.yellow;
    ctx.beginPath(); ctx.arc(-21, -1, 4, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(13, -12);

    let batAngle = -0.55;
    if (bat.swinging) {
      const t = bat.swingT;
      const e = easeInOutCubic(t);
      batAngle = lerp(-0.55, 2.6, e);
    }
    ctx.rotate(batAngle);

    ctx.strokeStyle = C.skin; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 11); ctx.stroke();
    ctx.fillStyle = C.yellow;
    ctx.beginPath(); ctx.arc(0, 12, 3.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = C.batHandle; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.roundRect(-2.5, 12, 5, 11, 2); ctx.fill(); ctx.stroke();

    let bw = 10, bh = 20;
    if (bat.swinging) {
      const t = bat.swingT;
      if (t > 0.3 && t < 0.6) {
        const s = Math.sin((t - 0.3) / 0.3 * Math.PI);
        bw = 10 + s * 4;
        bh = 20 - s * 4;
      }
    }
    ctx.fillStyle = C.batWood; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-bw / 2, 23, bw, bh, [2, 2, 4, 4]); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.stumpEdge; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(0, 23 + bh - 3); ctx.stroke();

    ctx.restore();

    ctx.fillStyle = C.skin; ctx.strokeStyle = C.outline; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(0, -28, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = C.blue; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -31, 13, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#8ab4e8'; ctx.lineWidth = 1.3;
    for (let gx = -6; gx <= 6; gx += 4) {
      ctx.beginPath(); ctx.moveTo(gx, -24); ctx.lineTo(gx, -17); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-7, -20); ctx.lineTo(7, -20); ctx.stroke();

    ctx.fillStyle = C.outline;
    ctx.beginPath(); ctx.arc(-4, -28, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -28, 1.8, 0, Math.PI * 2);  ctx.fill();

    ctx.strokeStyle = C.outline; ctx.lineWidth = 1.6;
    if (lastResult === 'OUT' || lastResult === 'BOWLED') {
      ctx.beginPath(); ctx.arc(0, -20, 3, Math.PI + 0.3, -0.3); ctx.stroke();
    } else if (lastResult === 'SIX') {
      ctx.beginPath(); ctx.arc(0, -23, 5, 0.1, Math.PI - 0.1); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, -23, 3.5, 0.15, Math.PI - 0.15); ctx.stroke();
    }

    ctx.restore();
  }

  function drawBowler() {
    const bx = 400;
    let by = bowler.baseY + bowler.runY;

    let armA = 0;
    if (bowler.phase === 'RUNNING') {
      armA = Math.sin(frame * 0.2) * 0.7;
    } else if (bowler.phase === 'DELIVERING') {
      armA = -Math.PI * 0.5 + bowler.deliveryFrame * 0.35;
    } else {
      armA = Math.sin(frame * 0.04) * 0.2;
    }

    drawPerson(bx, by, C.red, 0.8, false, armA, false);
  }

  function drawFielders() {
    fielders.forEach((f, i) => {
      f.x = lerp(f.x, f.tx, 0.05);
      f.y = lerp(f.y, f.ty, 0.05);
      const s = 0.52 + (f.y / H) * 0.22;
      const armA = f.anim === 'DIVE'
        ? Math.sin(f.animT * 3) * 1.5
        : Math.sin(frame * 0.04 + i * 2.1) * 0.25;
      const isDiving = f.anim === 'DIVE';
      drawPerson(f.x, f.y, f.jersey, s, i % 2 === 1, armA, isDiving);

      if (f.anim === 'DIVE') {
        f.animT += 0.016;
        if (f.animT > 1) { f.anim = 'IDLE'; f.animT = 0; }
      }
    });
  }

  function drawBall() {
    if (!ball.active) return;

    if (ball.trail.length > 1) {
      ctx.strokeStyle = 'rgba(224,64,48,0.2)';
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      ball.trail.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    const shadowY = ball.y + ball.heightOffset;
    const shadowR = ball.radius * ball.shadowScale;
    drawShadow(ball.x, shadowY, shadowR * 1.4, shadowR * 0.4);

    const r = ball.radius;
    const bx = ball.x, by = ball.y;
    const sq = ball.squash;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1 / sq, sq);

    ctx.fillStyle = C.ballRed;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, -0.9, 0.9); ctx.stroke();

    ctx.fillStyle = C.ballShine;
    ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.3, r * 0.28, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function drawTimingMeter() {
    if (state !== 'BOWLING' && meter.frozenTimer <= 0) return;

    const mx = METER_X, my = METER_Y, mw = METER_W, mh = METER_H;

    ctx.fillStyle = C.scoreBg;
    ctx.strokeStyle = C.panelStroke;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(mx - 12, my - 22, mw + 24, mh + 36, 12); ctx.fill(); ctx.stroke();

    ctx.fillStyle = C.textMuted;
    ctx.font = '700 10px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText('⏱ TIMING', W / 2, my - 8);

    ctx.font = '800 8px Nunito';
    ctx.fillStyle = C.meterBad;    ctx.textAlign = 'left';  ctx.fillText('MISS', mx + 4, my - 8);
    ctx.fillStyle = C.meterPerfect; ctx.textAlign = 'center'; ctx.fillText('PERFECT', W / 2, my - 8);
    ctx.fillStyle = C.meterBad;    ctx.textAlign = 'right'; ctx.fillText('MISS', mx + mw - 4, my - 8);

    ctx.fillStyle = C.meterBg;
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, mh / 2); ctx.fill();

    const perfectL = mw * (0.5 - ZONE_PERFECT);
    const perfectR = mw * (0.5 + ZONE_PERFECT);
    const goodL    = mw * (0.5 - ZONE_GOOD);
    const goodR    = mw * (0.5 + ZONE_GOOD);

    ctx.fillStyle = C.meterGood;
    ctx.beginPath(); ctx.roundRect(mx + goodL, my + 1, goodR - goodL, mh - 2, (mh - 2) / 2); ctx.fill();
    ctx.fillStyle = C.meterPerfect;
    ctx.beginPath(); ctx.roundRect(mx + perfectL, my + 1, perfectR - perfectL, mh - 2, (mh - 2) / 2); ctx.fill();

    ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, mh / 2); ctx.stroke();

    const needlePos = meter.frozenTimer > 0 ? meter.frozenPos : meter.pos;
    const nx = mx + needlePos * mw;

    const zone = getMeterZone(needlePos);
    if (zone === 'PERFECT') {
      ctx.fillStyle = 'rgba(52,168,83,0.25)';
      ctx.beginPath(); ctx.arc(nx, my + mh / 2, 14, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.moveTo(nx, my - 3);
    ctx.lineTo(nx - 5, my - 10);
    ctx.lineTo(nx + 5, my - 10);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(nx, my); ctx.lineTo(nx, my + mh); ctx.stroke();

    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.moveTo(nx, my + mh + 3);
    ctx.lineTo(nx - 5, my + mh + 10);
    ctx.lineTo(nx + 5, my + mh + 10);
    ctx.closePath();
    ctx.fill();
  }

  function drawHUD() {
    if (state === 'TITLE' || state === 'GAMEOVER') return;

    ctx.fillStyle = C.scoreBg;
    ctx.strokeStyle = C.panelStroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(14, 10, 165, 54, 12); ctx.fill(); ctx.stroke();

    ctx.fillStyle = C.textMuted; ctx.font = '800 10px Nunito'; ctx.textAlign = 'left';
    ctx.fillText('SCORE', 26, 26);
    ctx.fillStyle = C.textMain; ctx.font = '900 28px Nunito';
    ctx.fillText(score, 26, 54);

    for (let i = 0; i < MAX_WICKETS; i++) {
      ctx.fillStyle = i < wickets ? C.red : '#ddd8cc';
      ctx.beginPath(); ctx.arc(115 + i * 16, 28, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.outline; ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = C.textMuted; ctx.font = '700 11px Nunito'; ctx.textAlign = 'right';
    ctx.fillText('Ball ' + balls, 170, 55);

    ctx.fillStyle = C.scoreBg; ctx.strokeStyle = C.panelStroke; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(W - 115, 10, 100, 36, 10); ctx.fill(); ctx.stroke();

    ctx.fillStyle = C.yellow; ctx.font = '900 10px Nunito'; ctx.textAlign = 'left';
    ctx.fillText('★ BEST', W - 107, 26);
    ctx.fillStyle = C.textMain; ctx.font = '900 16px Nunito';
    ctx.fillText(highScore, W - 107, 42);

    ctx.fillStyle = C.scoreBg; ctx.strokeStyle = C.panelStroke; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(W - 115, 52, 100, 18, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.textMuted; ctx.font = '700 9px Nunito'; ctx.textAlign = 'center';
    const lvlLabel = difficulty <= 2 ? 'EASY' : difficulty <= 4 ? 'MEDIUM' : difficulty <= 6 ? 'HARD' : 'INSANE';
    ctx.fillText('⚡ ' + lvlLabel, W - 65, 64);
  }

  function spawnDust(cx, cy, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: cx, y: cy,
        vx: rand(-2, 2), vy: rand(-3, 0),
        size: rand(3, 6),
        color: '#d4c8a0',
        alpha: 0.7,
        type: 'dust',
      });
    }
  }

  function spawnSparkles(cx, cy, count) {
    const colors = [C.yellow, C.white, '#fff4c0', '#ffe066'];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: cx, y: cy,
        vx: rand(-8, 8), vy: rand(-10, -3),
        size: rand(3, 7),
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        type: 'sparkle',
      });
    }
  }

  function spawnConfetti(cx, cy, count) {
    const colors = [C.blue, C.red, C.yellow, C.green, C.white];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: cx, y: cy,
        vx: rand(-9, 9), vy: rand(-12, -3),
        size: rand(5, 10),
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        rot: rand(0, 6.28), rotV: rand(-0.15, 0.15),
        type: 'confetti',
      });
    }
  }

  function addFloating(text, x, y, color, big) {
    floatingText.push({
      text, x, y: y, startY: y, color,
      alpha: 1, t: 0,
      big: !!big,
    });
  }

  function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.alpha -= p.type === 'dust' ? 0.025 : 0.014;
      if (p.alpha <= 0) { particles.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (p.type === 'sparkle') {
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(frame * 0.1 + i);
        const s = p.size * p.alpha;
        ctx.beginPath();
        for (let j = 0; j < 4; j++) {
          const a = (j / 4) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
          const a2 = ((j + 0.5) / 4) * Math.PI * 2;
          ctx.lineTo(Math.cos(a2) * s * 0.35, Math.sin(a2) * s * 0.35);
        }
        ctx.closePath(); ctx.fill();
      } else if (p.type === 'confetti') {
        ctx.translate(p.x, p.y);
        if (p.rot !== undefined) { p.rot += p.rotV; ctx.rotate(p.rot); }
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  function updateAndDrawFloatingText() {
    for (let i = floatingText.length - 1; i >= 0; i--) {
      const ft = floatingText[i];
      ft.t += 0.018;

      const springY = springEase(Math.min(ft.t * 2, 1));
      ft.y = ft.startY - springY * (ft.big ? 65 : 45);

      ft.alpha = ft.t > 0.5 ? Math.max(0, 1 - (ft.t - 0.5) * 2) : 1;

      if (ft.alpha <= 0) { floatingText.splice(i, 1); continue; }

      const scale = ft.big
        ? 1.0 + springEase(Math.min(ft.t * 3, 1)) * 0.5
        : 0.8 + springEase(Math.min(ft.t * 3, 1)) * 0.3;

      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.translate(ft.x, ft.y);
      ctx.scale(scale, scale);

      ctx.font = ft.big ? '900 36px Nunito' : '800 22px Nunito';
      ctx.textAlign = 'center';

      ctx.strokeStyle = C.white;
      ctx.lineWidth = 5;
      ctx.strokeText(ft.text, 0, 0);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);

      ctx.restore();
    }
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(232,240,224,0.88)';
    ctx.fillRect(0, 0, W, H);

    const title = 'CRICKET';
    const colors = [C.blue, C.red, C.yellow, C.blue, C.green, C.red, C.yellow];
    ctx.font = '900 68px Nunito'; ctx.textAlign = 'center';

    let totalW = 0;
    const widths = [];
    for (const ch of title) { const w = ctx.measureText(ch).width; widths.push(w); totalW += w; }

    let cx = W / 2 - totalW / 2;
    for (let i = 0; i < title.length; i++) {
      const bounce = Math.sin(frame * 0.045 + i * 0.7) * 6;
      ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
      ctx.fillStyle = colors[i]; ctx.textAlign = 'left';
      ctx.strokeText(title[i], cx, 165 + bounce);
      ctx.fillText(title[i], cx, 165 + bounce);
      cx += widths[i];
    }

    ctx.font = '800 20px Nunito'; ctx.textAlign = 'center';
    ctx.fillStyle = C.textMain;
    ctx.fillText('🏏  Doodle Cricket  🏏', W / 2, 205);

    ctx.font = '700 14px Nunito'; ctx.fillStyle = C.textMuted;
    ctx.fillText('Time the needle in the green zone to score runs!', W / 2, 245);
    ctx.fillText('Tap anywhere or press Space to bat.', W / 2, 268);

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = C.meterBg;
    ctx.beginPath(); ctx.roundRect(W/2 - 80, 284, 160, 10, 5); ctx.fill();
    ctx.fillStyle = C.meterGood;
    ctx.beginPath(); ctx.roundRect(W/2 - 40, 285, 80, 8, 4); ctx.fill();
    ctx.fillStyle = C.meterPerfect;
    ctx.beginPath(); ctx.roundRect(W/2 - 16, 285, 32, 8, 4); ctx.fill();
    ctx.globalAlpha = 1;

    const btnW = 190, btnH = 50, btnX = W / 2 - btnW / 2, btnY = 310;
    const pulse = 1 + Math.sin(frame * 0.06) * 0.025;

    ctx.save();
    ctx.translate(W / 2, btnY + btnH / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-W / 2, -(btnY + btnH / 2));

    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.roundRect(btnX + 2, btnY + 3, btnW, btnH, 26); ctx.fill();
    ctx.fillStyle = C.green; ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.white; ctx.font = '900 19px Nunito'; ctx.textAlign = 'center';
    ctx.fillText('▶  PLAY', W / 2, btnY + 33);
    ctx.restore();

    ctx.font = '600 10px Nunito'; ctx.fillStyle = '#bfb5a3'; ctx.textAlign = 'center';
    ctx.fillText('A doodle tribute to cricket', W / 2, H - 16);
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(232,240,224,0.90)';
    ctx.fillRect(0, 0, W, H);

    const isNew = score > 0 && score >= highScore;

    ctx.font = '900 44px Nunito'; ctx.textAlign = 'center';
    ctx.strokeStyle = C.white; ctx.lineWidth = 5;
    ctx.fillStyle = C.textMain;
    const ttl = isNew ? '🎉 New Record!' : 'Game Over!';
    ctx.strokeText(ttl, W / 2, 140); ctx.fillText(ttl, W / 2, 140);

    ctx.font = '900 76px Nunito';
    ctx.fillStyle = C.blue; ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
    ctx.strokeText(score, W / 2, 235); ctx.fillText(score, W / 2, 235);

    ctx.font = '800 17px Nunito'; ctx.fillStyle = C.textMuted;
    ctx.fillText('RUNS', W / 2, 258);

    ctx.font = '700 13px Nunito'; ctx.fillStyle = C.textMain;
    ctx.fillText(balls + ' balls  •  ' + wickets + ' wickets  •  Best: ' + highScore, W / 2, 295);

    const btnW = 220, btnH = 50, btnX = W / 2 - btnW / 2, btnY = 325;
    const pulse = 1 + Math.sin(frame * 0.06) * 0.025;
    ctx.save();
    ctx.translate(W / 2, btnY + btnH / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-W / 2, -(btnY + btnH / 2));

    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.roundRect(btnX + 2, btnY + 3, btnW, btnH, 26); ctx.fill();
    ctx.fillStyle = C.blue; ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.white; ctx.font = '900 18px Nunito'; ctx.textAlign = 'center';
    ctx.fillText('🔄  PLAY AGAIN', W / 2, btnY + 33);
    ctx.restore();
  }

  /* ═══════════════════════════════════════════════════════════
     GAME LOGIC
     ═══════════════════════════════════════════════════════════ */

  function resetGame() {
    score = 0; wickets = 0; balls = 0;
    difficulty = 1;
    lastResult = ''; resultTimer = 0;
    particles = []; floatingText = [];
    bat.swinging = false; bat.swingT = 0; bat.impactFlash = 0;
    ball.active = false; ball.hit = false;
    meter.frozenTimer = 0; meter.frozenPos = -1;
    fielders = fielderDefs.map(f => ({
      x: f.homeX, y: f.homeY, tx: f.homeX, ty: f.homeY,
      jersey: f.jersey, anim: 'IDLE', animT: 0,
    }));
    state = 'BOWLING';
    scheduleDelivery();
  }

  function calcDifficulty() {
    difficulty = 1 + Math.floor(score / 10);
  }

  function scheduleDelivery() {
    if (wickets >= MAX_WICKETS) { endGame(); return; }
    calcDifficulty();
    setTimeout(() => {
      if (state === 'GAMEOVER') return;
      startDelivery();
    }, 800);
  }

  function startDelivery() {
    state = 'BOWLING';
    balls++;

    bowler.runY = 0;
    bowler.phase = 'RUNNING';
    bowler.deliveryFrame = 0;

    const speedMult = 1 + (difficulty - 1) * 0.15;
    const lineVar = rand(-1.0, 1.0);

    ball.x = 400;
    ball.y = PITCH_TOP + 55;
    ball.vx = lineVar;
    ball.vy = (3.8 + rand(-0.3, 0.3)) * speedMult;
    ball.radius = 5;
    ball.active = true;
    ball.hit = false;
    ball.trail = [];
    ball.squash = 1;
    ball.bounced = false;
    ball.bounceY = rand(240, 300);
    ball.shadowScale = 1;
    ball.heightOffset = 0;

    bat.swinging = false; bat.swingT = 0; bat.impactFlash = 0;

    meter.active = true;
    meter.pos = 0;
    meter.dir = 1;
    meter.speed = (0.016 + difficulty * 0.003) * speedMult;
    meter.frozenPos = -1;
    meter.frozenTimer = 0;

    sfxBowl();
  }

  function triggerSwing() {
    ensureAudio();

    if (state === 'TITLE')    { resetGame(); return; }
    if (state === 'GAMEOVER') { resetGame(); return; }
    if (state !== 'BOWLING' || bat.swinging || !ball.active) return;

    meter.active = false;
    meter.frozenPos = meter.pos;
    meter.frozenTimer = 90;

    bat.swinging = true;
    bat.swingT = 0;

    const zone = getMeterZone(meter.pos);

    ball.hit = true;
    sfxCrack();

    let runs = 0;
    let resultText = '';
    let resultColor = C.textMain;

    if (zone === 'PERFECT') {
      runs = 6;
      resultText = 'SIX! 🚀';
      resultColor = C.yellow;
      sfxCheerSix();
      ball.vy = -14; ball.vx = rand(-5, 5);
      shakeTimer = 15; shakeIntensity = 6;
      spawnSparkles(BATSMAN_X + 10, BATSMAN_Y - 15, 30);
      spawnConfetti(BATSMAN_X, BATSMAN_Y - 50, 45);
      bat.impactFlash = 1;
      lastResult = 'SIX';

      fielders.forEach(f => { f.anim = 'IDLE'; });

    } else if (zone === 'GOOD') {
      const distFromCenter = Math.abs(meter.pos - 0.5);
      if (distFromCenter <= 0.20) {
        runs = 4;
        resultText = 'FOUR! 🏏';
        resultColor = C.green;
        sfxCheerFour();
        ball.vy = -8; ball.vx = rand(-8, 8);
        shakeTimer = 6; shakeIntensity = 3;
        spawnSparkles(BATSMAN_X + 10, BATSMAN_Y - 10, 15);
        bat.impactFlash = 0.6;
        lastResult = 'FOUR';

        let nearest = 0, nearDist = Infinity;
        fielders.forEach((f, i) => {
          const d = Math.hypot(f.x - (ball.x + ball.vx * 15), f.y - (ball.y + ball.vy * 15));
          if (d < nearDist) { nearDist = d; nearest = i; }
        });
        fielders[nearest].anim = 'DIVE';
        fielders[nearest].animT = 0;
        fielders[nearest].tx = fielders[nearest].x + ball.vx * 8;
        fielders[nearest].ty = fielders[nearest].y + ball.vy * 5;

      } else {
        runs = Math.random() > 0.4 ? 2 : 1;
        resultText = '+' + runs + (runs > 1 ? ' Runs' : ' Run');
        resultColor = C.blue;
        ball.vy = -5; ball.vx = rand(-4, 4);
        lastResult = '' + runs;
        spawnDust(BATSMAN_X + 5, BATSMAN_Y + 5, 8);

        const fi = Math.floor(Math.random() * fielders.length);
        fielders[fi].tx = fielders[fi].x + ball.vx * 6;
        fielders[fi].ty = fielders[fi].y + ball.vy * 4;
      }

    } else {
      runs = 0;
      wickets++;
      lastResult = 'OUT';
      resultColor = C.red;
      sfxOut();

      if (meter.pos < 0.3) {
        resultText = 'Caught! 😵';
        ball.vy = -3; ball.vx = rand(-5, 5);
      } else {
        resultText = 'Edged Out! 😵';
        ball.vy = -2; ball.vx = rand(-4, 4);
      }

      fielders.forEach(f => { f.anim = 'IDLE'; });
    }

    score += runs;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('doodle_hs2', '' + highScore);
    }

    addFloating(resultText, BATSMAN_X, BATSMAN_Y - 50, resultColor, runs >= 4);
    resultTimer = 100;
    state = 'RESULT';

    setTimeout(() => {
      fielders.forEach((f, i) => {
        f.tx = fielderDefs[i].homeX;
        f.ty = fielderDefs[i].homeY;
      });
      if (wickets >= MAX_WICKETS) { endGame(); }
      else { state = 'BOWLING'; scheduleDelivery(); }
    }, 2200);
  }

  function endGame() {
    state = 'GAMEOVER';
    meter.active = false;
  }

  function updateBall() {
    if (!ball.active) return;

    if (!ball.hit) {
      ball.y += ball.vy;
      ball.x += ball.vx;
      ball.radius = 4 + (ball.y / H) * 5;

      if (ball.y >= ball.bounceY && !ball.bounced) {
        ball.bounced = true;
        ball.squash = 0.6;
        sfxBounce();
        spawnDust(ball.x, ball.y, 6);
      }

      ball.squash = lerp(ball.squash, 1, 0.12);

      if (ball.bounced) {
        const distAfterBounce = ball.y - ball.bounceY;
        ball.heightOffset = Math.max(0, Math.sin(distAfterBounce * 0.03) * 20);
        ball.shadowScale = 1 + ball.heightOffset * 0.02;
      }

      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 10) ball.trail.shift();

      if (ball.y >= PITCH_BOT + 5 && !ball.hit) {
        ball.active = false;
        if (Math.abs(ball.x - 400) < 16) {
          wickets++;
          lastResult = 'BOWLED';
          sfxOut();
          addFloating('BOWLED! 💥', BATSMAN_X, BATSMAN_Y - 50, C.red, true);
          shakeTimer = 8; shakeIntensity = 4;
        } else {
          lastResult = 'DOT';
          addFloating('Dot Ball', BATSMAN_X, BATSMAN_Y - 45, C.textMuted, false);
        }
        resultTimer = 80;
        state = 'RESULT';
        meter.active = false;

        setTimeout(() => {
          if (wickets >= MAX_WICKETS) { endGame(); }
          else { state = 'BOWLING'; scheduleDelivery(); }
        }, 1800);
      }
    } else {
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vy += 0.15;
      ball.radius = Math.max(2, ball.radius - 0.04);

      if (ball.vy < -4) {
        ball.squash = 1.3;
      } else {
        ball.squash = lerp(ball.squash, 1, 0.08);
      }

      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 10) ball.trail.shift();

      if (ball.y < -60 || ball.x < -60 || ball.x > W + 60 || ball.y > H + 60) {
        ball.active = false;
      }
    }
  }

  function updateBowler() {
    if (bowler.phase === 'RUNNING') {
      bowler.runY += 2.2;
      if (bowler.runY >= 55) {
        bowler.phase = 'DELIVERING';
        bowler.deliveryFrame = 0;
      }
    } else if (bowler.phase === 'DELIVERING') {
      bowler.deliveryFrame += 0.5;
      if (bowler.deliveryFrame > 8) {
        bowler.phase = 'DONE';
      }
    }
  }

  function updateBat() {
    bat.idleBob += 0.04;
    if (bat.swinging) {
      bat.swingT += 0.07;
      if (bat.swingT >= 1) {
        bat.swinging = false;
        bat.swingT = 0;
      }
    }
    if (bat.impactFlash > 0) bat.impactFlash -= 0.03;
  }

  function updateMeter() {
    if (!meter.active) {
      if (meter.frozenTimer > 0) meter.frozenTimer--;
      return;
    }
    meter.pos += meter.speed * meter.dir;
    if (meter.pos >= 1) { meter.pos = 1; meter.dir = -1; }
    if (meter.pos <= 0) { meter.pos = 0; meter.dir = 1; }
  }

  function updateResultTimer() {
    if (resultTimer > 0) resultTimer--;
    else if (state !== 'TITLE' && state !== 'GAMEOVER') lastResult = '';
  }

  /* ═══════════════════════════════════════════════════════════
     MAIN LOOP
     ═══════════════════════════════════════════════════════════ */

  function loop() {
    frame++;

    ctx.save();
    if (shakeTimer > 0) {
      shakeTimer--;
      const intensity = shakeIntensity * (shakeTimer / 15);
      ctx.translate(rand(-intensity, intensity), rand(-intensity, intensity));
    }

    ctx.clearRect(0, 0, W, H);

    drawSky();
    drawClouds();
    drawGround();
    drawPitch();
    drawFielders();
    drawBowler();
    drawBall();
    drawBatsman();

    updateAndDrawParticles();
    updateAndDrawFloatingText();

    drawHUD();
    drawTimingMeter();

    if (state === 'TITLE')    drawTitle();
    if (state === 'GAMEOVER') drawGameOver();

    ctx.restore();

    if (state === 'BOWLING') {
      updateBall();
      updateBowler();
    } else if (state === 'RESULT') {
      updateBall();
    }
    updateBat();
    updateMeter();
    updateResultTimer();

    requestAnimationFrame(loop);
  }

  /* ─── Touch & Input Handlers ─────────────────────────────── */
  const handleAction = (e) => {
    if (e) e.preventDefault();
    triggerSwing();
  };

  // Canvas Touch & Mouse Pointer
  canvas.addEventListener('pointerdown', handleAction);
  canvas.addEventListener('touchstart', handleAction, { passive: false });

  // On-Screen Touch Swing Button
  const mobileBtn = document.getElementById('mobileSwingBtn');
  if (mobileBtn) {
    mobileBtn.addEventListener('pointerdown', handleAction);
    mobileBtn.addEventListener('touchstart', handleAction, { passive: false });
  }

  // Keyboard Space / Enter
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      triggerSwing();
    }
  });

  /* ─── Boot ───────────────────────────────────────────────── */
  requestAnimationFrame(loop);

})();
