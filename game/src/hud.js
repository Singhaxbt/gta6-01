// hud.js — DOM HUD: circular minimap, stars, money, health, objective,
// timer, speed, crosshair, toasts, hints and the menu overlays.
import { fmtMoney, fmtTime } from './util.js';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    minimap: $('minimap'),
    stars: $('stars'),
    money: $('money'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    objective: $('objective'),
    timer: $('timer'),
    speed: $('speed'),
    speedLabel: $('speed-label'),
    crosshair: $('crosshair'),
    toasts: $('toasts'),
    hint: $('hint'),
    menuStart: $('menu-start'),
    menuPause: $('menu-pause'),
    menuEnd: $('menu-end'),
    endTitle: $('end-title'),
    endText: $('end-text'),
  };
  const ctx = el.minimap.getContext('2d');
  const mmSize = el.minimap.width;
  const toasts = [];
  let lastStars = -1;
  let lastMoney = -1;
  let lastHealth = -1;
  let lastObjective = '';
  let lastTimer = '';
  let lastSpeed = -1;

  function toast(msg) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    el.toasts.appendChild(div);
    toasts.push({ div, t: 4 });
    while (toasts.length > 4) {
      const old = toasts.shift();
      old.div.remove();
    }
  }

  function showOnly(menu) {
    el.menuStart.classList.toggle('hidden', menu !== 'start');
    el.menuPause.classList.toggle('hidden', menu !== 'pause');
    el.menuEnd.classList.toggle('hidden', menu !== 'end');
    el.hud.classList.toggle('hidden', menu === 'start');
  }

  function showEnd(kind) {
    el.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    el.endTitle.style.color = kind === 'busted' ? '#7ec8f7' : '#ff5a4e';
    el.endText.textContent =
      kind === 'busted'
        ? 'The Solmar PD caught up with Dario. Hospital bill: $200.'
        : 'Dario went down. The docs at Solmar General patched him up — $200.';
    showOnly('end');
  }

  // Buttons.
  $('btn-start').addEventListener('click', () => G.startGame());
  $('btn-resume').addEventListener('click', () => G.resumeGame());
  $('btn-quit').addEventListener('click', () => G.quitToMenu());
  $('btn-respawn').addEventListener('click', () => G.respawn());

  function drawMinimap() {
    const S = mmSize;
    const w = S;
    const h = S;
    ctx.clearRect(0, 0, w, h);
    // Circular clip.
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    const worldMinX = -185;
    const worldMaxX = 265;
    const worldMinZ = -185;
    const worldMaxZ = 185;
    const sx = (x) => ((x - worldMinX) / (worldMaxX - worldMinX)) * w;
    const sz = (z) => ((z - worldMinZ) / (worldMaxZ - worldMinZ)) * h;
    // Sea + sand.
    ctx.fillStyle = '#1d6f87';
    ctx.fillRect(sx(252), 0, w, h);
    ctx.fillStyle = '#eed9a4';
    ctx.fillRect(sx(190), 0, sx(252) - sx(190), h);
    ctx.fillStyle = '#2c2c30';
    ctx.fillRect(0, 0, sx(185), h);
    // Roads.
    ctx.strokeStyle = '#55555c';
    ctx.lineWidth = 3;
    for (const x of G.city.roads.xs) {
      ctx.beginPath();
      ctx.moveTo(sx(x), sz(-180));
      ctx.lineTo(sx(x), sz(180));
      ctx.stroke();
    }
    for (const z of G.city.roads.zs) {
      ctx.beginPath();
      ctx.moveTo(sx(-180), sz(z));
      ctx.lineTo(sx(180), sz(z));
      ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#c9a06a';
    for (const b of G.city.buildings) {
      ctx.fillRect(sx(b.x - b.w / 2), sz(b.z - b.d / 2), Math.max(1.5, sx(b.x + b.w / 2) - sx(b.x - b.w / 2)), Math.max(1.5, sz(b.z + b.d / 2) - sz(b.z - b.d / 2)));
    }
    // Plaza fountain.
    ctx.fillStyle = '#9fd8e8';
    ctx.beginPath();
    ctx.arc(sx(0), sz(0), 3, 0, Math.PI * 2);
    ctx.fill();
    // Mission marker (pulsing gold diamond).
    if (G.missions.pillar.visible) {
      const pulse = 3 + Math.sin(G.time * 5) * 1.2;
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath();
      ctx.moveTo(sx(G.missions.target.x), sz(G.missions.target.z) - pulse);
      ctx.lineTo(sx(G.missions.target.x) + pulse, sz(G.missions.target.z));
      ctx.lineTo(sx(G.missions.target.x), sz(G.missions.target.z) + pulse);
      ctx.lineTo(sx(G.missions.target.x) - pulse, sz(G.missions.target.z));
      ctx.closePath();
      ctx.fill();
    }
    // Cometa marker while Mission 2 is open.
    if (!G.save.missionsDone[1] && (!G.missions.active || G.missions.index !== 1 || G.missions.phase === 'A')) {
      ctx.fillStyle = '#ff2222';
      ctx.beginPath();
      ctx.arc(sx(G.cometa.pos.x), sz(G.cometa.pos.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic dots.
    ctx.fillStyle = '#ffffff';
    for (const car of G.traffic) {
      if (car.dead) continue;
      ctx.fillRect(sx(car.pos.x) - 1, sz(car.pos.z) - 1, 2, 2);
    }
    // Police: flashing dots.
    const flash = Math.floor(G.time * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2222' : '#2244ff';
    for (const car of G.police) {
      if (!car.active || car.dead) continue;
      ctx.beginPath();
      ctx.arc(sx(car.pos.x), sz(car.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = sx(G.player.pos.x);
    const py = sz(G.player.pos.z);
    const heading = G.car ? G.car.heading : G.player.heading;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading); // canvas +y is world +z, so the arrow turns with heading
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function update(dt) {
    // Toasts fade.
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      t.t -= dt;
      if (t.t <= 0) {
        t.div.remove();
        toasts.splice(i, 1);
      }
    }
    if (G.mode !== 'playing' && G.mode !== 'paused') return;
    drawMinimap();
    if (G.wanted !== lastStars) {
      lastStars = G.wanted;
      el.stars.textContent = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
      el.stars.style.color = G.wanted > 0 ? '#ff5a4e' : '#ffffff';
    }
    const money = Math.round(G.save.money);
    if (money !== lastMoney) {
      lastMoney = money;
      el.money.textContent = fmtMoney(money);
    }
    const health = Math.round(G.player.health);
    if (health !== lastHealth) {
      lastHealth = health;
      el.healthFill.style.width = `${Math.max(0, health)}%`;
      el.healthText.textContent = `HEALTH ${health}`;
    }
    const obj = G.objectiveText();
    if (obj !== lastObjective) {
      lastObjective = obj;
      el.objective.textContent = obj;
    }
    const timer = G.missions.active ? fmtTime(G.missions.timeLeft) : '';
    if (timer !== lastTimer) {
      lastTimer = timer;
      el.timer.textContent = timer;
      el.timer.style.color = G.missions.timeLeft < 20 ? '#ff5a4e' : '#ffc93c';
    }
    const kmh = G.car ? Math.round(Math.abs(G.car.speed) * 3.6) : 0;
    if (kmh !== lastSpeed) {
      lastSpeed = kmh;
      el.speed.textContent = String(kmh);
      el.speedLabel.textContent = G.car ? 'KM/H — DRIVING' : 'KM/H — ON FOOT';
    }
    el.crosshair.style.display = G.player.onFoot ? 'block' : 'none';
    const inCar = G.car ? 'E — exit car · Space — handbrake' : 'E — steal car · M — mission · Click — shoot';
    el.hint.textContent = `WASD move · Shift run · ${inCar} · N mute · Esc pause`;
  }

  return { toast, showOnly, showEnd, update };
}
