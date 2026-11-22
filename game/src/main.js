// Aurora Falls — the game itself: boot, loop, input, player, camera,
// missions, side jobs and the deterministic screenshot modes.
// One clear job: tie every system together into a playable open world.
import * as THREE from 'three';
import { WORLD, MISSIONS, DISTRICTS, TUNING, mulberry32, clamp, lerp, dist2 } from './config.js';
import { Weather } from './weather.js';
import { City } from './city.js';
import { Vehicle } from './car.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { loadSave, storeSave, buyUpgrade, addStanding, respectRank } from './save.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || null;
const SEED = Number(params.get('seed') || 7);
const TEST_MODE = params.has('test');
const FAST = params.has('fast'); // low-spec mode for headless testing: no shadows, less snow

const rng = mulberry32(SEED);

export class Game {
  constructor() {
    this.save = loadSave();
    this.health = this.save.health;
    this.money = this.save.money;
    this.started = false;
    this.paused = false;
    this.time = 0;
    this.frameCount = 0;
    this.camLock = false;
    this.keys = {};
    this.mouseDown = false;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDist = 11;
    this.flatTire = false;
    this.taxi = null;
    this.delivery = null;
    this.raceState = null;
    this.pickups = [];
    this.beacon = null;
    this.objective = null;
    this.safeHouses = [
      { x: -260, z: 180, name: 'Mine Town safe house' },
      { x: 250, z: -150, name: 'Resort safe house' },
      { x: 0, z: -40, name: 'Downtown safe house' },
    ];
    this.boot();
  }

  boot() {
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !FAST;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
    this.city = new City(this.scene);
    this.weather = new Weather(this.scene, mulberry32(4242), FAST ? 1200 : 3200);
    this.traffic = new Traffic(this.scene, this.city);
    this.police = new Police(this.scene, this.city);
    this.combat = new Combat(this.scene);
    this.hud = new HUD();
    this.audio = new AudioEngine();
    this.missions = new Missions((type, payload) => this.onMissionEvent(type, payload));
    for (const id of this.save.missionsDone) this.missions.completed.add(id);

    // The player on foot: a winter-coated figure with a visible weapon.
    this.playerMesh = new THREE.Group();
    const coat = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd23e, roughness: 0.8 }),
    );
    coat.position.y = 1.05;
    coat.castShadow = true;
    this.playerMesh.add(coat);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.7 }),
    );
    head.position.y = 1.95;
    this.playerMesh.add(head);
    this.playerMesh.position.set(0, 0, 20);
    this.scene.add(this.playerMesh);
    this.player = { x: 0, z: 20, heading: 0, vehicle: null, onFoot: true, speed: 0 };
    // A starter car parked by the plaza so the first drive is one keypress away.
    this.starterCar = new Vehicle(this.scene, 4, 28, 0, 'sedan', 0xc0392b);
    this.starterCar.driver = null;

    this.bindInput();
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.hud.showStart(MISSIONS, this.missions.completed, this.save.standing);
    this.hud.update(this.hudState(), 0);
    if (SHOT) this.stageShot(SHOT);
    if (TEST_MODE) import('./test.js').then((m) => m.runTests(this));
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  bindInput() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.audio.ensure();
      if (!this.started) {
        if (e.code === 'Enter' || e.code === 'Space') this.startGame();
        return;
      }
      if (e.code === 'KeyM') this.startNextMission();
      if (e.code === 'KeyE') this.tryInteract();
      if (e.code === 'KeyF') this.tryCarjack();
      if (e.code === 'KeyQ') this.combat.cycleWeapon(-1);
      if (e.code === 'Digit1') this.combat.selectWeapon(0);
      if (e.code === 'Digit2') this.combat.selectWeapon(1);
      if (e.code === 'Digit3') this.combat.selectWeapon(2);
      if (e.code === 'Digit4') this.combat.selectWeapon(3);
      if (e.code === 'KeyR') this.audio.cycleRadio();
      if (e.code === 'KeyG') this.tryGarage();
      if (e.code === 'KeyT') this.startTaxi();
      if (e.code === 'Escape') this.togglePause();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.tryShoot(); }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    addEventListener('mousemove', (e) => {
      if (!this.started || this.paused) return;
      this.camYaw -= e.movementX * 0.0032;
      this.camPitch = clamp(this.camPitch + e.movementY * 0.0022, 0.05, 1.1);
    });
    document.getElementById('start-btn').addEventListener('click', () => this.startGame());
  }

  startGame() {
    if (this.started) return;
    this.started = true;
    this.audio.ensure();
    this.hud.hideStart();
    this.hud.banner('AURORA FALLS', 'KAI — getaway driver. Press M for the next job.');
    try {
      const p = document.body.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* pointer lock needs a user gesture; fine without it */ }
  }

  togglePause() {
    this.paused = !this.paused;
    this.hud.toast(this.paused ? 'Paused — Esc to resume' : 'Resumed');
  }

  startNextMission() {
    const id = this.missions.nextJob();
    if (!id) { this.hud.toast('All 8 missions done — Aurora Falls is yours.'); return; }
    if (this.missions.start(id)) this.setObjectiveForStage();
  }

  onMissionEvent(type, payload) {
    if (type === 'mission-start') {
      this.hud.banner(`MISSION ${payload.id} — ${payload.title}`, payload.brief);
      this.audio.blip(660, 0.25, 'sine', 0.25);
      this.setObjectiveForStage();
    } else if (type === 'mission-stage') {
      this.setObjectiveForStage();
    } else if (type === 'mission-done') {
      this.money += payload.reward;
      this.save.money = this.money;
      this.save.missionsDone = [...this.missions.completed];
      this.save.respect += payload.reward;
      addStanding(this.save, payload.district, 25);
      storeSave(this.save);
      this.hud.banner('MISSION COMPLETE', `${payload.title} — $${payload.reward.toLocaleString()} · respect up`);
      this.audio.blip(880, 0.4, 'sine', 0.3);
      this.clearPickups();
      this.objective = null;
    } else if (type === 'mission-failed') {
      this.hud.banner('MISSION FAILED', payload.reason);
      this.clearPickups();
      this.objective = null;
    } else if (type === 'bark') {
      this.hud.bark(payload.crew.name, payload.text, payload.crew.color);
    } else if (type === 'collect') {
      this.audio.blip(990, 0.15, 'sine', 0.22);
    }
  }

  setObjectiveForStage() {
    const s = this.missions.stage;
    this.clearPickups();
    if (!s) { this.objective = null; return; }
    if (s.type === 'driveTo') {
      this.objective = { x: s.x, z: s.z };
      this.spawnBeacon(s.x, s.z, 0xffd23e);
    } else if (s.type === 'collect') {
      const m = this.missions.current;
      const cx = m.district === 'downtown' ? 0 : m.district === 'resort' ? 250 : m.district === 'lake' ? 40 : -40;
      const cz = m.district === 'downtown' ? -40 : m.district === 'resort' ? -220 : m.district === 'lake' ? 260 : -330;
      this.objective = { x: cx, z: cz };
      this.spawnBeacon(cx, cz, 0x39ff88);
      for (let i = 0; i < s.count; i++) {
        const a = (i / s.count) * Math.PI * 2;
        this.spawnPickup(cx + Math.cos(a) * 14, cz + Math.sin(a) * 14);
      }
    } else if (s.type === 'steal') {
      const plow = this.traffic.plows.find((p) => !p.exploded);
      if (plow) { this.objective = { x: plow.x, z: plow.z }; this.spawnBeacon(plow.x, plow.z, 0xffc21a); }
    } else if (s.type === 'race') {
      this.objective = { x: 40, z: 260 };
      this.spawnBeacon(40, 260, 0xff7a1a);
      this.raceState = { laps: 0, lastCross: 0, started: false };
    } else if (s.type === 'escape' || s.type === 'wanted') {
      this.objective = null;
    }
  }

  spawnBeacon(x, z, color) {
    if (this.beacon) this.scene.remove(this.beacon);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beacon.position.set(x, 30, z);
    this.scene.add(beacon);
    this.beacon = beacon;
  }

  spawnPickup(x, z) {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.9),
      new THREE.MeshStandardMaterial({ color: 0x39ff88, emissive: 0x39ff88, emissiveIntensity: 0.9, roughness: 0.2 }),
    );
    mesh.position.set(x, 1.4, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, x, z });
  }

  clearPickups() {
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; }
  }

  // --- Interaction -------------------------------------------------------

  nearestDrivable(maxDist = 7) {
    const all = [this.starterCar, ...this.traffic.cars, ...this.traffic.plows, ...this.police.units];
    let best = null, bestD = maxDist * maxDist;
    for (const v of all) {
      if (v.exploded || v.driver === 'player') continue;
      const d2 = dist2(this.player.x, this.player.z, v.x, v.z);
      if (d2 < bestD) { bestD = d2; best = v; }
    }
    return best;
  }

  tryInteract() {
    // Pick up a mission collectible.
    for (const p of [...this.pickups]) {
      if (dist2(this.player.x, this.player.z, p.x, p.z) < 16) {
        this.scene.remove(p.mesh);
        this.pickups = this.pickups.filter((q) => q !== p);
        this.missions.collect();
        this.hud.toast('Picked up — keep going.');
        return;
      }
    }
    // Enter the nearest car.
    const v = this.nearestDrivable();
    if (v && !this.player.vehicle) {
      if (v.driver === 'traffic' || v.driver === 'plow') this.commitCrime(1, 'stole a car');
      v.driver = 'player';
      this.player.vehicle = v;
      this.player.onFoot = false;
      this.playerMesh.visible = false;
      this.hud.toast(v.kind === 'snowplow' ? 'Snowplow yours. Clear the Pass.' : 'Car yours. Drive.');
      this.audio.blip(520, 0.12, 'sine', 0.2);
    } else if (this.player.vehicle) {
      const car = this.player.vehicle;
      car.driver = null;
      car.speed = 0;
      this.player.vehicle = null;
      this.player.onFoot = true;
      this.player.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
      this.player.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
      this.playerMesh.visible = true;
    }
  }

  tryCarjack() {
    if (this.player.vehicle) return;
    const v = this.nearestDrivable(6);
    if (!v) return;
    // Yank the driver out: they flee on foot, the car is yours.
    const ped = this.traffic.peds[0];
    if (ped) { ped.x = v.x + 3; ped.z = v.z + 3; }
    this.commitCrime(1, 'carjacked a driver');
    v.driver = 'player';
    this.player.vehicle = v;
    this.player.onFoot = false;
    this.playerMesh.visible = false;
    this.hud.toast('Carjacked. The driver ran for it.');
  }

  tryShoot() {
    if (!this.started || this.paused) return;
    this.audio.ensure();
    const origin = this.camera.position.clone();
    const target = new THREE.Vector3();
    this.camera.getWorldDirection(target);
    target.multiplyScalar(80).add(origin);
    const vehicles = [this.starterCar, ...this.traffic.cars, ...this.traffic.plows, ...this.police.units];
    const hit = this.combat.shoot(origin, target, vehicles, this.traffic.peds);
    if (hit && !hit.reloaded) {
      this.audio.gunshot();
      if (hit.type === 'vehicle') {
        this.commitCrime(1, 'opened fire');
        if (hit.vehicle.exploded) this.onExplosion(hit.vehicle);
      }
    } else if (!hit) {
      this.audio.gunshot();
    }
  }

  commitCrime(stars, what) {
    const before = this.police.wanted;
    this.police.addWanted(stars, what);
    if (this.police.wanted > before) this.missions.bark('wanted');
    this.audio.siren(this.police.wanted > 0);
  }

  onExplosion(vehicle) {
    this.audio.explosion();
    this.combat.explosionDamage(
      { x: vehicle.x, z: vehicle.z },
      [this.starterCar, ...this.traffic.cars, ...this.traffic.plows, ...this.police.units],
      null,
    );
    const d = Math.hypot(this.player.x - vehicle.x, this.player.z - vehicle.z);
    if (d < TUNING.explosionRadius) this.damagePlayer(TUNING.explosionDamage * (1 - d / 14));
    if (this.player.vehicle === vehicle) {
      this.player.vehicle = null;
      this.player.onFoot = true;
      this.playerMesh.visible = true;
      this.player.x = vehicle.x + 4;
      this.player.z = vehicle.z + 4;
    }
  }

  tryGarage() {
    const next = ['engine', 'tires', 'armor', 'paint'][this.garageIndex ?? 0];
    this.garageIndex = ((this.garageIndex ?? 0) + 1) % 4;
    const res = buyUpgrade(this.save, next);
    if (res.ok) {
      this.hud.toast(`${next.toUpperCase()} level ${res.level} — $${res.cost}.`);
      if (this.player.vehicle) this.player.vehicle.upgrades = { ...this.save.upgrades };
    } else {
      this.hud.toast(`Garage ${next}: ${res.reason}.`);
    }
  }

  startTaxi() {
    if (this.taxi || !this.player.vehicle) return;
    const dest = this.city.roads[Math.floor(Math.random() * this.city.roads.length)];
    this.taxi = { x: dest.x, z: dest.z, fare: 60 + Math.floor(Math.random() * 120) };
    this.objective = { x: dest.x, z: dest.z };
    this.spawnBeacon(dest.x, dest.z, 0xffc21a);
    this.hud.toast(`Taxi job — take the fare to the marker ($${this.taxi.fare}).`);
  }

  damagePlayer(amount) {
    this.health -= amount;
    this.save.health = Math.max(0, Math.round(this.health));
    if (this.health <= 0) {
      // Busted / wasted: respawn at the downtown safe house, lighter wallet.
      this.health = 100;
      this.money = Math.max(0, this.money - 200);
      this.save.money = this.money;
      this.save.health = 100;
      storeSave(this.save);
      this.police.clearWanted();
      this.audio.siren(false);
      if (this.player.vehicle) { this.player.vehicle.driver = null; this.player.vehicle = null; }
      this.player.onFoot = true;
      this.player.x = 0; this.player.z = -40;
      this.playerMesh.visible = true;
      this.playerMesh.position.set(0, 0, -40);
      this.hud.banner('WASTED', 'AFPD dropped you at the downtown safe house. -$200.');
    }
  }

  // --- Frame -------------------------------------------------------------

  hudState() {
    return {
      health: this.health,
      money: this.money,
      wanted: this.police.wanted,
      objectiveText: this.missions.objectiveText,
      inCar: !!this.player.vehicle,
      speed: this.player.vehicle ? this.player.vehicle.speed : 0,
      weaponIndex: this.combat.weaponIndex,
      ammo: this.combat.ammo,
      radio: this.audio.radioIndex,
      player: { x: this.player.x, z: this.player.z, heading: this.player.heading },
      objective: this.objective,
      safeHouses: this.safeHouses,
      policeUnits: this.police.units.map((u) => ({ x: u.x, z: u.z })),
      heli: this.police.heli,
    };
  }

  frame(t) {
    const dt = Math.min(0.05, (t - (this.lastT ?? t)) / 1000 || 0.016);
    this.lastT = t;
    this.frameCount++;
    if (!this.started || this.paused) {
      // Menu orbit: slow drift over the plaza so the start screen lives.
      this.time += dt;
      this.weather.update(dt, { x: 0, z: 0 });
      this.camera.position.set(Math.sin(this.time * 0.05) * 60, 26, -40 + Math.cos(this.time * 0.05) * 60);
      this.camera.lookAt(0, 4, -40);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.time += dt;
    this.updatePlayer(dt);
    this.traffic.update(dt, this.time, this.player);
    this.police.update(dt, this.time, this.player, (dmg) => this.damagePlayer(dmg * dt * 8));
    this.combat.update(dt);
    this.missions.update(dt, { player: this.player, police: this.police });
    this.weather.update(dt, this.player);
    this.updatePickups(dt);
    this.updateSideJobs(dt);
    this.updateCamera(dt);
    this.audio.setEngine(this.player.vehicle ? Math.abs(this.player.vehicle.speed) / TUNING.playerTopSpeed : 0, !!this.player.vehicle);
    this.audio.siren(this.police.wanted > 0);
    this.hud.update(this.hudState(), dt);
    // Exploded cars hurt the player up close and chain into neighbours.
    for (const v of [this.starterCar, ...this.traffic.cars, ...this.traffic.plows, ...this.police.units]) {
      if (v.exploded && !v.chainDone) {
        v.chainDone = true;
        this.onExplosion(v);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  updatePlayer(dt) {
    const k = this.keys;
    const input = {
      forward: !!(k.KeyW || k.ArrowUp),
      back: !!(k.KeyS || k.ArrowDown),
      left: !!(k.KeyA || k.ArrowLeft),
      right: !!(k.KeyD || k.ArrowRight),
      handbrake: !!k.Space,
    };
    const car = this.player.vehicle;
    if (car) {
      const mayaBonus = this.missions.completed.has(4) ? TUNING.mayaGripBonus : 0;
      car.drive(dt, input, mayaBonus);
      // Collisions with buildings push the car back and scrape health.
      const hit = this.city.collideCircle(car.x, car.z, 2.2);
      if (hit) {
        car.x -= Math.sin(car.heading) * car.speed * dt * 2;
        car.z -= Math.cos(car.heading) * car.speed * dt * 2;
        if (Math.abs(car.speed) > 12) {
          car.damage(TUNING.scrapeDamage);
          this.damagePlayer(0.4);
        }
        car.speed *= 0.5;
      }
      if (!this.city.inBounds(car.x, car.z)) {
        car.x = clamp(car.x, -WORLD.size + 10, WORLD.size - 10);
        car.z = clamp(car.z, -WORLD.size + 10, WORLD.size - 10);
        car.speed *= 0.3;
      }
      // Spike strips pop a tire: slower, pulls sideways.
      if (this.police.checkSpikes(car)) {
        this.flatTire = true;
        this.hud.toast('Spike strip! Tire popped — find a garage (G).');
        this.audio.blip(180, 0.3, 'sawtooth', 0.25);
      }
      if (this.flatTire) car.speed = clamp(car.speed, -8, 22);
      const block = this.police.checkRoadblock(car);
      if (block && Math.abs(car.speed) > 8) {
        car.damage(18);
        car.speed *= -0.25;
        this.damagePlayer(6);
        this.hud.toast('Roadblock! Maya says drift it, don\u2019t ram it.');
      }
      this.player.x = car.x;
      this.player.z = car.z;
      this.player.heading = car.heading;
      this.player.speed = car.speed;
      // Mission collect while driving counts too.
      for (const p of [...this.pickups]) {
        if (dist2(car.x, car.z, p.x, p.z) < 20) {
          this.scene.remove(p.mesh);
          this.pickups = this.pickups.filter((q) => q !== p);
          this.missions.collect();
        }
      }
    } else {
      // On foot: walk, with the camera facing the movement direction.
      const mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      const mz = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
      const len = Math.hypot(mx, mz) || 1;
      const speed = k.ShiftLeft ? 9 : 5;
      this.player.x += (mx / len) * speed * dt * (mx || mz ? 1 : 0);
      this.player.z += (mz / len) * speed * dt * (mx || mz ? 1 : 0);
      if (mx || mz) this.player.heading = Math.atan2(mx / len, mz / len);
      this.playerMesh.position.set(this.player.x, 0, this.player.z);
      this.playerMesh.rotation.y = this.player.heading;
      this.playerMesh.position.y = Math.abs(Math.sin(this.time * 10)) * 0.06;
      if (this.mouseDown) this.tryShoot();
    }
  }

  updatePickups(dt) {
    for (const p of this.pickups) {
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 1.4 + Math.sin(this.time * 3 + p.x) * 0.25;
    }
    if (this.beacon) this.beacon.rotation.y += dt * 0.4;
  }

  updateSideJobs(dt) {
    // Taxi drop-off.
    if (this.taxi && this.player.vehicle) {
      if (dist2(this.player.x, this.player.z, this.taxi.x, this.taxi.z) < 144) {
        this.money += this.taxi.fare;
        this.save.money = this.money;
        this.save.taxisDone += 1;
        storeSave(this.save);
        this.hud.toast(`Taxi done — +$${this.taxi.fare}.`);
        this.taxi = null;
        this.objective = null;
        if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; }
      }
    }
    // Ice-road race laps: cross the start line on the lake loop.
    if (this.raceState && this.player.vehicle) {
      const d = Math.hypot(this.player.x - 40, this.player.z - 260);
      const nearLine = Math.abs(this.player.z - 260) < 6 && Math.abs(this.player.x - 40) < 92;
      if (nearLine && this.time - this.raceState.lastCross > 4) {
        this.raceState.lastCross = this.time;
        this.raceState.laps += 1;
        this.missions.lap();
        this.hud.toast(`Lap ${this.raceState.laps} on the ice.`);
      }
      void d;
    }
  }

  updateCamera(dt) {
    if (this.camLock) return;
    const target = this.player.vehicle
      ? { x: this.player.x, z: this.player.z, y: 1.5 }
      : { x: this.player.x, z: this.player.z, y: 1.8 };
    const yaw = this.player.heading + Math.PI + this.camYaw;
    const cx = target.x + Math.sin(yaw) * this.camDist;
    const cz = target.z + Math.cos(yaw) * this.camDist;
    const cy = target.y + 4 + this.camPitch * 7;
    this.camera.position.x = lerp(this.camera.position.x, cx, clamp(dt * 6, 0, 1));
    this.camera.position.y = lerp(this.camera.position.y, cy, clamp(dt * 6, 0, 1));
    this.camera.position.z = lerp(this.camera.position.z, cz, clamp(dt * 6, 0, 1));
    this.camera.lookAt(target.x, target.y + 2.5, target.z);
  }

  // --- Deterministic screenshot staging -----------------------------------

  stageShot(shot) {
    // The game boots straight into the staged scene so a screenshot run is
    // reproducible: same seed, same light, same chase.
    this.started = true;
    this.audio.ensure = () => {};
    const place = (x, z, heading) => {
      this.player.x = x; this.player.z = z; this.player.heading = heading;
      this.playerMesh.position.set(x, 0, z);
      this.playerMesh.rotation.y = heading;
    };
    if (shot === 'cover') {
      // Night chase: wanted 3, NORTHERN-1 overhead, roadblock + spikes ahead.
      this.police.addWanted(3, 'cover');
      this.police.heat = 1;
      const car = new Vehicle(this.scene, 0, 60, Math.PI, 'sedan', 0xc0392b);
      car.driver = 'player';
      car.upgrades = { ...this.save.upgrades };
      this.player.vehicle = car;
      this.player.onFoot = false;
      this.playerMesh.visible = false;
      place(0, 60, Math.PI);
      // Rolling chase, not a sprint: the roadblock 38 m ahead must still be
      // in frame when the screenshot is taken.
      car.speed = 16;
      this.police.ensureHeli(this.player, Math.PI);
      // Closer than the gameplay default so the block is large in frame.
      this.police.spawnRoadblock(this.player, Math.PI, 25, true);
      this.police.spawnUnit(this.player);
      this.police.spawnUnit(this.player);
      this.missions.start(1);
      this.setObjectiveForStage();
      this.weather.night = 0.95;
      this.weather.blizzardTarget = 0;
      this.camYaw = 0;
    } else if (shot === 'race') {
      const car = new Vehicle(this.scene, 40, 180, 0, 'sedan', 0xff7a1a);
      car.driver = 'player';
      car.upgrades = { ...this.save.upgrades };
      this.player.vehicle = car;
      this.player.onFoot = false;
      this.playerMesh.visible = false;
      place(40, 180, 0);
      car.speed = 30;
      this.missions.start(7);
      this.setObjectiveForStage();
      this.weather.night = 0.85;
    } else if (shot === 'heist') {
      place(250, -180, Math.PI);
      this.missions.start(2);
      this.setObjectiveForStage();
      this.weather.night = 0.9;
      this.police.wanted = 2;
    } else if (shot === 'neon') {
      const car = new Vehicle(this.scene, -10, -20, Math.PI * 0.75, 'sedan', 0x19e3ff);
      car.driver = 'player';
      car.upgrades = { ...this.save.upgrades };
      this.player.vehicle = car;
      this.player.onFoot = false;
      this.playerMesh.visible = false;
      place(-10, -20, Math.PI * 0.75);
      car.speed = 18;
      this.weather.night = 1;
      this.weather.blizzardTarget = 0;
    }
    this.hud.hideStart();
    document.getElementById('crosshair').style.display = 'block';
    // No mission banner in a staged shot, and snap the camera to its follow
    // position at once: at a few frames per second the menu-orbit lerp
    // would still be travelling when the screenshot is taken.
    this.hud.bannerTimer = 0;
    this.el_banner_hide();
    const target = { x: this.player.x, z: this.player.z, y: 1.5 };
    const yaw = this.player.heading + Math.PI + this.camYaw;
    this.camera.position.set(
      target.x + Math.sin(yaw) * this.camDist,
      target.y + 4 + this.camPitch * 7,
      target.z + Math.cos(yaw) * this.camDist,
    );
    this.camera.lookAt(target.x, target.y + 2.5, target.z);
  }

  el_banner_hide() {
    const b = document.getElementById('banner');
    if (b) b.style.opacity = '0';
  }
}

// Boot when the DOM is ready.
const game = new Game();
window.__auroraFalls = game;
