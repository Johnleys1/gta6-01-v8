// Aurora Falls — the HUD: health, wanted stars, money, objective, speed,
// weapon wheel, minimap, radio and the crew radio barks.
// One clear job: everything the player reads while playing.
import { WEAPONS, RADIOS } from './config.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'health-fill', 'health-num', 'money', 'objective', 'speed',
      'wanted', 'weapon-name', 'ammo', 'radio', 'message', 'minimap', 'banner',
      'start-screen', 'mission-list', 'standing', 'toast']) {
      this.el[id] = document.getElementById(id);
    }
    this.map = this.el.minimap.getContext('2d');
    this.messages = [];
    this.bannerTimer = 0;
  }

  showStart(missions, completed, standing) {
    this.el['start-screen'].style.display = 'flex';
    this.el['mission-list'].innerHTML = missions.map((m) => `
      <div class="mission-row ${completed.has(m.id) ? 'done' : ''}">
        <span class="mission-num">${String(m.id).padStart(2, '0')}</span>
        <span class="mission-title">${m.title}</span>
        <span class="mission-reward">$${m.reward.toLocaleString()}</span>
        <span class="mission-state">${completed.has(m.id) ? 'DONE' : 'OPEN'}</span>
      </div>`).join('');
    this.el.standing.textContent = Object.entries(standing)
      .map(([d, v]) => `${d}: ${v}`).join('  ·  ');
  }

  hideStart() { this.el['start-screen'].style.display = 'none'; }

  banner(text, sub = '') {
    this.el.banner.innerHTML = `<div class="banner-title">${text}</div><div class="banner-sub">${sub}</div>`;
    this.el.banner.style.opacity = '1';
    this.bannerTimer = 3;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    setTimeout(() => { this.el.toast.style.opacity = '0'; }, 2600);
  }

  bark(who, text, color) {
    const line = document.createElement('div');
    line.className = 'bark';
    line.innerHTML = `<b style="color:${color}">${who}</b> ${text}`;
    this.el.message.appendChild(line);
    while (this.el.message.children.length > 4) this.el.message.removeChild(this.el.message.firstChild);
    setTimeout(() => line.remove(), 9000);
  }

  // The minimap: the whole city at a glance — player, objective, police,
  // crew and safe houses, with June's patrol marks.
  drawMinimap(state) {
    const ctx = this.map;
    const S = 168;
    const W = 900;
    const toMap = (x, z) => [(x / W + 0.5) * S, (z / W + 0.5) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(8, 14, 28, 0.85)';
    ctx.fillRect(0, 0, S, S);
    // Lake and districts.
    ctx.fillStyle = '#7fb8d8';
    ctx.beginPath();
    const [lx, ly] = toMap(40, 260);
    ctx.arc(lx, ly, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(...toMap(i * 70, -210));
      ctx.lineTo(...toMap(i * 70, 130));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(...toMap(-170, -40 + i * 70));
      ctx.lineTo(...toMap(170, -40 + i * 70));
      ctx.stroke();
    }
    // Objective marker.
    if (state.objective) {
      const [ox, oy] = toMap(state.objective.x, state.objective.z);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(ox, oy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    // Safe houses.
    ctx.fillStyle = '#39ff88';
    for (const s of state.safeHouses ?? []) {
      const [sx, sy] = toMap(s.x, s.z);
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }
    // Police.
    ctx.fillStyle = '#ff2233';
    for (const u of state.policeUnits ?? []) {
      const [px, py] = toMap(u.x, u.z);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.heli) {
      const [hx, hy] = toMap(state.heli.x, state.heli.z);
      ctx.fillStyle = '#ff9de2';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-state.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  update(state, dt) {
    this.el['health-fill'].style.width = `${Math.max(0, state.health)}%`;
    this.el['health-num'].textContent = Math.ceil(Math.max(0, state.health));
    this.el.money.textContent = `$${state.money.toLocaleString()}`;
    this.el.objective.textContent = state.objectiveText;
    this.el.speed.textContent = state.inCar
      ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : 'ON FOOT';
    // Wanted stars.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
    this.el.wanted.textContent = stars;
    this.el.wanted.style.color = state.wanted >= 3 ? '#ff5566' : '#ffd23e';
    const w = WEAPONS[state.weaponIndex];
    this.el['weapon-name'].textContent = `${state.weaponIndex + 1} · ${w.name}`;
    this.el.ammo.textContent = `${state.ammo[state.weaponIndex]} / ${w.mag}`;
    this.el.radio.textContent = `${RADIOS[state.radio].id} — ${RADIOS[state.radio].name}`;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.style.opacity = '0';
    }
    this.drawMinimap(state);
  }
}
