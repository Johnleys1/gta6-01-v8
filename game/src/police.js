// Aurora Falls — the law: AFPD dispatch, wanted stars 1–5, the NORTHERN-1
// helicopter with its searchlight, roadblocks, spike strips and RAM/PIT units.
// One clear job: make the player feel hunted, and make escape possible.
import * as THREE from 'three';
import { TUNING, clamp } from './config.js';
import { Vehicle, buildCarMesh } from './car.js';

function buildHeliMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a5a7d, roughness: 0.4, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 5), bodyMat);
  g.add(body);
  // White belly stripe + nav lights: the silhouette must read against the
  // night sky from a low chase camera.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.45, 0.35, 5.05),
    new THREE.MeshBasicMaterial({ color: 0xe8f0ff }),
  );
  stripe.position.y = -0.4;
  g.add(stripe);
  for (const s of [-1.25, 1.25]) {
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff2233 : 0x33ff66 }),
    );
    nav.position.set(s, 0.2, 1.5);
    g.add(nav);
  }
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.9, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x0e1a26, roughness: 0.1, metalness: 0.8 }),
  );
  glass.position.set(0, 0.2, 2);
  g.add(glass);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rotor.position.y = 1;
  g.add(rotor);
  g.userData.rotor = rotor;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4), bodyMat);
  tail.position.set(0, 0.3, -4.2);
  g.add(tail);
  // The searchlight: a real spotlight plus a visible cone sweeping the snow.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(5.5, 42, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  cone.position.y = -21;
  g.add(cone);
  const spot = new THREE.SpotLight(0xfff2b0, 220, 70, 0.32, 0.45, 1.2);
  spot.position.set(0, -0.5, 0);
  const target = new THREE.Object3D();
  target.position.set(0, -42, 0);
  g.add(target);
  spot.target = target;
  g.add(spot);
  // Red/blue flashers.
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2233 }),
  );
  flash.position.set(0, 1.1, 0);
  g.add(flash);
  g.userData.flash = flash;
  return g;
}

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.wanted = 0;
    this.heat = 0; // 0..1, how hard the chase is right now
    this.units = [];
    this.roadblocks = [];
    this.spikes = [];
    this.heli = null;
    this.heliMesh = null;
    this.decayTimer = 0;
    this.spawnTimer = 0;
    this.lastCrime = -100;
  }

  addWanted(stars, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + stars, 0, 5);
    if (this.wanted > before) {
      this.heat = 1;
      this.decayTimer = TUNING.wantedDecaySeconds;
      this.lastCrime = performance.now() / 1000;
    }
    return this.wanted;
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    this.despawnAll();
  }

  spawnUnit(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 55 + Math.random() * 25;
    const x = playerPos.x + Math.cos(angle) * dist;
    const z = playerPos.z + Math.sin(angle) * dist;
    const v = new Vehicle(this.scene, x, z, Math.atan2(playerPos.x - x, playerPos.z - z), 'sedan', 0x101418);
    v.driver = 'police';
    v.cruise = 30;
    // Light bar.
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2233 }),
    );
    bar.position.set(0, 1.72, 0);
    v.mesh.add(bar);
    v.lightBar = bar;
    const light = new THREE.PointLight(0x3355ff, 26, 26, 1.8);
    light.position.set(0, 2.2, 0);
    v.mesh.add(light);
    v.flashLight = light;
    this.units.push(v);
    return v;
  }

  spawnRoadblock(playerPos, heading, dist = 38, forceSpikes = false) {
    const group = new THREE.Group();
    const x = playerPos.x + Math.sin(heading) * dist;
    const z = playerPos.z + Math.cos(heading) * dist;
    group.position.set(x, 0, z);
    group.rotation.y = heading + Math.PI / 2;
    const barMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.4, metalness: 0.4 });
    for (const off of [-4, 0, 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 0.5), barMat);
      bar.position.set(off, 0.7, 0);
      group.add(bar);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.45, 0.52),
        new THREE.MeshBasicMaterial({ color: 0xff2233 }),
      );
      stripe.position.set(off, 1.05, 0);
      group.add(stripe);
    }
    // Amber beacon on the middle bar: the block must read at a glance,
    // even from a low chase camera in the dark.
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
    );
    beacon.position.set(0, 1.7, 0);
    group.add(beacon);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), barMat);
    pole.position.set(0, 1.35, 0);
    group.add(pole);
    this.scene.add(group);
    this.roadblocks.push({ group, x, z, beacon });
    // A spike strip beside the block: run over it and a tire pops.
    if (forceSpikes || Math.random() < 0.7) this.spawnSpikes(x + 6, z + 6);
    return group;
  }

  spawnSpikes(x, z) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.12, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, metalness: 0.3 }),
    );
    base.position.y = 0.06;
    group.add(base);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    for (let i = 0; i < 8; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.75, 4), mat);
      spike.position.set((i - 3.5) * 0.55, 0.4, 0);
      group.add(spike);
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.spikes.push({ group, x, z, hit: false });
  }

  ensureHeli(playerPos, heading = 0) {
    if (this.heli || this.wanted < 3) return;
    this.heliMesh = buildHeliMesh();
    // Start ahead of the player so the searchlight sweeps the road ahead,
    // in the chase camera's view — not hovering over the camera. Low, far
    // ahead, and offset to the side: straight ahead the heli hides behind
    // the downtown towers from a low chase camera.
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    this.heliMesh.position.set(playerPos.x + fx * 45 + rx * 18, 16, playerPos.z + fz * 45 + rz * 18);
    this.scene.add(this.heliMesh);
    this.heli = { x: playerPos.x + fx * 45 + rx * 18, z: playerPos.z + fz * 45 + rz * 18, y: 16, angle: 0 };
  }

  despawnHeli() {
    if (this.heliMesh) this.scene.remove(this.heliMesh);
    this.heli = null;
    this.heliMesh = null;
  }

  despawnAll() {
    for (const u of this.units) u.dispose();
    this.units = [];
    for (const r of this.roadblocks) this.scene.remove(r.group);
    this.roadblocks = [];
    for (const s of this.spikes) this.scene.remove(s.group);
    this.spikes = [];
    this.despawnHeli();
  }

  // The chase: units ram and PIT, the helicopter tracks from above, and the
  // wanted level cools off only when the player stays out of sight.
  update(dt, time, player, onPlayerHit) {
    const wantedCount = Math.min(this.wanted, 5);
    const targetUnits = this.wanted === 0 ? 0 : 1 + Math.floor(this.wanted / 2);
    this.spawnTimer -= dt;
    if (this.units.length < targetUnits && this.spawnTimer <= 0 && this.wanted > 0) {
      this.spawnUnit(player);
      this.spawnTimer = 3;
      if (this.wanted >= 2 && this.roadblocks.length < this.wanted - 1 && Math.random() < 0.5) {
        this.spawnRoadblock(player, player.heading);
      }
    }
    if (this.wanted >= 3) this.ensureHeli(player, player.heading);
    if (this.wanted < 3) this.despawnHeli();

    // Blink every roadblock beacon amber.
    for (const r of this.roadblocks) {
      if (r.beacon) r.beacon.material.color.setHex(Math.floor(time * 3) % 2 === 0 ? 0xffaa00 : 0x442200);
    }

    for (const u of this.units) {
      if (u.exploded) continue;
      const dx = player.x - u.x, dz = player.z - u.z;
      const d = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - u.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      u.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
      const ram = d < 14 && this.wanted >= 4; // RAM/PIT at high wanted
      const speed = ram ? 34 : 26 + this.wanted * 1.5;
      u.speed = Math.min(u.speed + 10 * dt, speed);
      u.x += Math.sin(u.heading) * u.speed * dt;
      u.z += Math.cos(u.heading) * u.speed * dt;
      u.mesh.position.set(u.x, 0, u.z);
      u.mesh.rotation.y = u.heading;
      // Flash the light bar red/blue.
      const phase = Math.floor(time * 6) % 2 === 0;
      u.lightBar.material.color.setHex(phase ? 0xff2233 : 0x2255ff);
      u.flashLight.color.setHex(phase ? 0xff2233 : 0x2255ff);
      if (d < 4.5) {
        onPlayerHit(TUNING.policeRamDamage * (ram ? 2 : 1));
        u.speed *= 0.4;
        u.heading += 0.6;
      }
      u.update(dt);
    }
    this.units = this.units.filter((u) => !u.exploded || u.flashTimer > 0);

    if (this.heli && this.heliMesh) {
      this.heli.angle += dt * 0.5;
      // Circle a point ahead of the player so the searchlight stays in the
      // chase camera's view, sweeping the road the player is about to drive.
      // Low, far ahead, offset to the side: straight ahead it hides behind
      // the downtown towers from a low chase camera.
      const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
      const rx = Math.cos(player.heading), rz = -Math.sin(player.heading);
      const cx = player.x + fx * 45 + rx * 18, cz = player.z + fz * 45 + rz * 18;
      const tx = cx + Math.cos(this.heli.angle) * 12;
      const tz = cz + Math.sin(this.heli.angle) * 12;
      this.heli.x = lerp(this.heli.x, tx, clamp(dt * 0.8, 0, 1));
      this.heli.z = lerp(this.heli.z, tz, clamp(dt * 0.8, 0, 1));
      this.heliMesh.position.set(this.heli.x, 16 + Math.sin(time * 0.8) * 1.5, this.heli.z);
      this.heliMesh.rotation.y = Math.atan2(player.x - this.heli.x, player.z - this.heli.z);
      this.heliMesh.userData.rotor.rotation.y += dt * 22;
      const phase = Math.floor(time * 5) % 2 === 0;
      this.heliMesh.userData.flash.material.color.setHex(phase ? 0xff2233 : 0x2255ff);
    }

    // Wanted cools off after a quiet stretch — faster in a blizzard.
    if (this.wanted > 0) {
      this.decayTimer -= dt;
      if (this.decayTimer <= 0) {
        this.wanted -= 1;
        this.decayTimer = TUNING.wantedDecaySeconds;
        if (this.wanted === 0) this.despawnAll();
      }
    }
  }

  // Did the player car just run over a spike strip? Pops one tire: top speed
  // drops and the car pulls to one side until repaired.
  checkSpikes(car) {
    for (const s of this.spikes) {
      if (s.hit) continue;
      const dx = car.x - s.x, dz = car.z - s.z;
      if (dx * dx + dz * dz < 9) {
        s.hit = true;
        this.scene.remove(s.group);
        return true;
      }
    }
    return false;
  }

  checkRoadblock(car) {
    for (const r of this.roadblocks) {
      const dx = car.x - r.x, dz = car.z - r.z;
      if (dx * dx + dz * dz < 16) return r;
    }
    return null;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }
