// hud.js — DOM HUD (cash, wanted stars, health/armor, weapon, speed, clock,
// mission tracker, toasts) and the circular minimap canvas with player,
// police, mission marker, enemies and traffic blips.
import { MISSION_DEFS } from './missions.js';

const WEAPON_LABELS = { pistol: 'PISTOL', smg: 'SMG', shotgun: 'SHOTGUN' };

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cashEl = this.el('cash');
    this.starsEl = this.el('stars');
    this.clockEl = this.el('clock');
    this.healthEl = this.el('healthbar');
    this.armorEl = this.el('armorbar');
    this.weaponEl = this.el('weapon');
    this.speedEl = this.el('speed');
    this.vehEl = this.el('vehname');
    this.titleEl = this.el('mtitle');
    this.objEl = this.el('mobj');
    this.distEl = this.el('mdist');
    this.toastEl = this.el('toast');
    this.toastSubEl = this.el('toastsub');
    this.map = this.el('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastT = 0;
    this.crosshair = this.el('crosshair');
    this.flashEl = this.el('wantedflash');
  }
  toast(title, sub) {
    this.toastEl.textContent = title;
    this.toastSubEl.textContent = sub || '';
    this.toastT = 4;
  }
  update(dt, game) {
    this.toastT = Math.max(0, this.toastT - dt);
    if (this.toastT <= 0) { this.toastEl.textContent = ''; this.toastSubEl.textContent = ''; }
    this.cashEl.textContent = '$' + Math.round(game.state.cash).toLocaleString('en-US');
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="${i < game.wanted ? 'on' : 'off'}">★</span>`;
    this.starsEl.innerHTML = stars;
    const h = Math.floor(game.clockHours);
    const m = Math.floor((game.clockHours - h) * 60);
    const label = game.clockHours < 18 ? 'GOLDEN HOUR' : game.clockHours < 20 ? 'SUNSET' : 'NIGHT';
    this.clockEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${label}`;
    this.healthEl.style.width = Math.max(0, game.health) + '%';
    this.armorEl.style.width = Math.max(0, game.armor) + '%';
    const w = game.weapon;
    const ammo = w === 'pistol' ? '∞' : `${game.ammo[w]} / ${w === 'smg' ? 32 : 6}`;
    this.weaponEl.innerHTML = `${WEAPON_LABELS[w]} <span>${ammo}</span>`;
    const mph = game.inVehicle() ? Math.round(Math.abs(game.vehicle.speed) * 2.2) : 0;
    this.speedEl.innerHTML = `${mph}<small> mph</small>`;
    this.vehEl.textContent = game.inVehicle() ? game.vehicle.def.name : 'ON FOOT';
    this.crosshair.classList.toggle('hidden', game.inVehicle() || game.paused || !game.started);
    // Mission tracker
    const mm = game.missions;
    if (mm.active) {
      this.titleEl.textContent = mm.active.def.name;
      this.objEl.textContent = mm.active.def.brief;
    } else {
      const next = mm.nextMissionIndex(game.state.missionsDone);
      this.titleEl.textContent = next >= 0 ? `NEXT: ${MISSION_DEFS[next].name}` : 'ALL MISSIONS COMPLETE';
      this.objEl.textContent = next >= 0
        ? 'Drive to the yellow marker and press E to start.'
        : 'You own Solmar, Dare. Free roam, fares, races, packages.';
    }
    if (mm.marker) {
      const d = Math.hypot(game.playerPos().x - mm.marker.x, game.playerPos().z - mm.marker.z);
      this.distEl.textContent = `${mm.marker.label} — ${Math.round(d)}m`;
    } else this.distEl.textContent = '';
    // Wanted flash
    const flash = game.wanted >= 3 ? 0.35 + 0.25 * Math.sin(game.time * 6) : 0;
    this.flashEl.style.opacity = game.wanted > 0 ? Math.max(0, flash * (game.wanted / 5)) : 0;
    this.drawMinimap(game);
  }
  drawMinimap(game) {
    const ctx = this.mapCtx, S = 170, C = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#12283a'; ctx.fillRect(0, 0, S, S);
    const toMap = (x, z) => [C + (x / 600) * (C - 4), C + (z / 600) * (C - 4)];
    // District blocks
    ctx.fillStyle = '#3a5a74'; ctx.fillRect(...toMap(-260, -300), (560 / 1200) * S, (600 / 1200) * S);
    ctx.fillStyle = '#c9a86a'; ctx.fillRect(...toMap(300, -300), (130 / 1200) * S, (600 / 1200) * S);
    ctx.fillStyle = '#6b7c8a'; ctx.fillRect(...toMap(-260, 300), (690 / 1200) * S, (300 / 1200) * S);
    ctx.fillStyle = '#2f7fc9'; ctx.fillRect(...toMap(430, -600), (170 / 1200) * S, S);
    ctx.fillStyle = '#7a5a3a'; ctx.fillRect(...toMap(-600, -300), (350 / 1200) * S, (600 / 1200) * S);
    // Roads
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let x = -240; x <= 280; x += 65) { const [ax, ay] = toMap(x, -290); const [bx, by] = toMap(x, 290); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
    for (let z = -280; z <= 290; z += 65) { const [ax, ay] = toMap(-250, z); const [bx, by] = toMap(290, z); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
    const p = game.playerPos();
    // Packages
    ctx.fillStyle = '#ffd54f';
    for (const pkg of game.missions.packages) {
      if (pkg.found) continue;
      const [x, y] = toMap(pkg.x, pkg.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Mission marker (pulsing yellow)
    if (game.missions.marker) {
      const [x, y] = toMap(game.missions.marker.x, game.missions.marker.z);
      const r = 6 + 2.5 * Math.sin(game.time * 5);
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // Police (blue/red)
    ctx.fillStyle = '#4488ff';
    for (const c of game.police.cars) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Enemies (red)
    ctx.fillStyle = '#ff4444';
    for (const e of game.combat.enemies) {
      if (!e.alive) continue;
      const [x, y] = toMap(e.pos.x, e.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow (white, rotated to heading)
    const [px, py] = toMap(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(game.playerAngle());
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // North indicator
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
    ctx.fillText('N', C, 12);
    ctx.restore();
  }
  renderMissionList(el, done) {
    el.innerHTML = MISSION_DEFS.map((d, i) => {
      const cls = done[i] ? 'done' : (i === 0 || done[i - 1] ? '' : 'locked');
      const mark = done[i] ? '✓ ' : (cls === 'locked' ? '🔒 ' : '○ ');
      return `<div class="${cls}">${mark}${d.name} — $${d.payout}</div>`;
    }).join('');
  }
}
