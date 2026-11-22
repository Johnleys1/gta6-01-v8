// Aurora Falls — the story: 8 staged missions against THE WARDEN, plus the
// crew radio barks that make each one play differently.
// One clear job: what the player is doing right now, and what happens next.
import { MISSIONS, CREW } from './config.js';

const BARKS = {
  start: [
    { who: 'maya', text: 'Maya: Ice roads are mine. Follow my line and we walk out of this.' },
    { who: 'dario', text: 'Dario: Cameras are looped. You have a window — use it.' },
    { who: 'june', text: 'June: Patrols marked on your map. Safe houses too. Move.' },
  ],
  stage: [
    { who: 'maya', text: 'Maya: Nice. Keep it smooth on the ice — no sudden moves.' },
    { who: 'dario', text: 'Dario: That worked. Next door is already open.' },
    { who: 'june', text: 'June: You are clear on my side. Next marker is up.' },
  ],
  wanted: [
    { who: 'june', text: 'June: AFPD is rolling. NORTHERN-1 is up — stay under cover.' },
    { who: 'maya', text: 'Maya: Drift the roadblocks, don\u2019t ram them. Trust the slide.' },
  ],
  done: [
    { who: 'maya', text: 'Maya: Clean. The Warden felt that one.' },
    { who: 'dario', text: 'Dario: Money moved. The mountain is a little less his.' },
    { who: 'june', text: 'June: Another one down. Aurora Falls is ours tonight.' },
  ],
};

export class Missions {
  constructor(onEvent) {
    this.onEvent = onEvent; // (type, payload) — hud, audio, save hooks
    this.completed = new Set();
    this.active = null;
    this.stageIndex = 0;
    this.stageTimer = 0;
    this.stageState = {};
    this.barkIndex = 0;
  }

  get current() {
    return this.active ? MISSIONS[this.active - 1] : null;
  }

  get stage() {
    const m = this.current;
    return m ? m.stages[this.stageIndex] : null;
  }

  get objectiveText() {
    if (!this.current) return 'Free roam — press M for the next job';
    const s = this.stage;
    if (!s) return this.current.title;
    if (s.type === 'escape') {
      const left = Math.max(0, Math.ceil(s.seconds - this.stageTimer));
      return `${s.label} — ${left}s`;
    }
    if (s.type === 'collect') {
      return `${s.label} (${this.stageState.collected ?? 0}/${s.count})`;
    }
    return s.label;
  }

  start(id) {
    const m = MISSIONS[id - 1];
    if (!m || this.completed.has(id) || this.active) return false;
    this.active = id;
    this.stageIndex = 0;
    this.stageTimer = 0;
    this.stageState = {};
    this.onEvent('mission-start', m);
    this.bark('start');
    return true;
  }

  nextJob() {
    for (let i = 1; i <= MISSIONS.length; i++) {
      if (!this.completed.has(i)) return i;
    }
    return null;
  }

  bark(kind) {
    const list = BARKS[kind] ?? BARKS.start;
    const b = list[this.barkIndex % list.length];
    this.barkIndex++;
    this.onEvent('bark', { ...b, crew: CREW[b.who] });
  }

  advance() {
    const m = this.current;
    if (!m) return;
    this.stageIndex++;
    this.stageTimer = 0;
    this.stageState = {};
    if (this.stageIndex >= m.stages.length) {
      this.completed.add(m.id);
      this.onEvent('mission-done', m);
      this.bark('done');
      this.active = null;
      this.stageIndex = 0;
    } else {
      this.bark('stage');
      this.onEvent('mission-stage', { mission: m, stage: this.stage });
    }
  }

  // Called every frame with the live game state; returns nothing, but fires
  // events the HUD and the save system listen to.
  update(dt, state) {
    if (!this.current) return;
    const s = this.stage;
    if (!s) return;
    this.stageTimer += dt;
    switch (s.type) {
      case 'driveTo': {
        const d = Math.hypot(state.player.x - s.x, state.player.z - s.z);
        if (d < 12) this.advance();
        break;
      }
      case 'steal': {
        if (state.player.vehicle && state.player.vehicle.kind === s.vehicle) this.advance();
        break;
      }
      case 'collect': {
        const got = this.stageState.collected ?? 0;
        if (got >= s.count) this.advance();
        break;
      }
      case 'wanted': {
        if (state.police.wanted >= s.stars) this.advance();
        break;
      }
      case 'escape': {
        if (state.police.wanted === 0 && this.stageTimer > 3) this.advance();
        else if (this.stageTimer > s.seconds * 2.5) this.advance(); // never soft-lock
        break;
      }
      case 'race': {
        const laps = this.stageState.laps ?? 0;
        if (laps >= s.laps) this.advance();
        break;
      }
      default:
        break;
    }
  }

  collect() {
    if (!this.current) return;
    const s = this.stage;
    if (s && s.type === 'collect') {
      this.stageState.collected = (this.stageState.collected ?? 0) + 1;
      this.onEvent('collect', { count: this.stageState.collected, need: s.count });
    }
  }

  lap() {
    if (!this.current) return;
    const s = this.stage;
    if (s && s.type === 'race') {
      this.stageState.laps = (this.stageState.laps ?? 0) + 1;
      this.onEvent('lap', { laps: this.stageState.laps, need: s.laps });
    }
  }

  fail(reason) {
    if (!this.current) return;
    const m = this.current;
    this.active = null;
    this.stageIndex = 0;
    this.onEvent('mission-failed', { mission: m, reason });
  }
}
