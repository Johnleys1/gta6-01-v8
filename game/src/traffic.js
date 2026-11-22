// Aurora Falls — the living city: traffic, pedestrians, skiers, snowplows.
// One clear job: everyone who is not the player, the police or a mission.
import * as THREE from 'three';
import { WORLD, mulberry32, clamp } from './config.js';
import { Vehicle } from './car.js';

function makePedestrian(color) {
  const g = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 8), coat);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.7 }),
  );
  head.position.y = 1.95;
  g.add(head);
  const hat = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.9 }),
  );
  hat.position.y = 2.05;
  g.add(hat);
  return g;
}

export class Traffic {
  constructor(scene, city, count = 26) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(777);
    this.cars = [];
    this.peds = [];
    this.plows = [];
    this.skiers = [];
    for (let i = 0; i < count; i++) this.spawnCar();
    for (let i = 0; i < 22; i++) this.spawnPed();
    for (let i = 0; i < 3; i++) this.spawnPlow();
    for (let i = 0; i < 8; i++) this.spawnSkier();
  }

  randomRoadPoint() {
    const r = this.city.roads[Math.floor(this.rng() * this.city.roads.length)];
    const t = (this.rng() - 0.5) * (r.l - 20);
    const along = r.rotY === 0 ? { x: r.x, z: r.z + t } : { x: r.x + t, z: r.z };
    return { ...along, heading: r.rotY === 0 ? 0 : Math.PI / 2 };
  }

  spawnCar() {
    const p = this.randomRoadPoint();
    const v = new Vehicle(this.scene, p.x, p.z, p.heading + (this.rng() < 0.5 ? 0 : Math.PI));
    v.driver = 'traffic';
    v.cruise = 9 + this.rng() * 7;
    v.lane = (this.rng() - 0.5) * 5;
    this.cars.push(v);
    return v;
  }

  spawnPed() {
    const d = this.city.districtAt((this.rng() - 0.5) * 700, (this.rng() - 0.5) * 700);
    const mesh = makePedestrian([0xc0392b, 0x2471a3, 0x7d3c98, 0xb7950b, 0x16a085][Math.floor(this.rng() * 5)]);
    const x = d.cx + (this.rng() - 0.5) * d.r;
    const z = d.cz + (this.rng() - 0.5) * d.r;
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.peds.push({ mesh, x, z, heading: this.rng() * Math.PI * 2, speed: 1 + this.rng() * 1.2, wobble: this.rng() * 10 });
  }

  spawnPlow() {
    const p = this.randomRoadPoint();
    const v = new Vehicle(this.scene, p.x, p.z, p.heading, 'snowplow', 0xffc21a);
    v.driver = 'plow';
    v.cruise = 7;
    this.plows.push(v);
    return v;
  }

  spawnSkier() {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xff2e88, roughness: 0.7 }),
    );
    body.position.y = 1;
    mesh.add(body);
    const skis = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }),
    );
    skis.position.y = 0.08;
    mesh.add(skis);
    mesh.position.set(250 + (this.rng() - 0.5) * 60, 24, -380 + this.rng() * 180);
    this.scene.add(mesh);
    this.skiers.push({ mesh, speed: 6 + this.rng() * 5, t: this.rng() * 10 });
  }

  // Traffic keeps to its lane and slows for the car ahead; pedestrians
  // wander their district; skiers carve down the piste; plows crawl the roads.
  update(dt, time, playerPos) {
    for (const v of this.cars) {
      if (v.exploded) continue;
      const input = { forward: true, back: false, left: false, right: false, handbrake: false };
      v.drive(dt, input, -0.1);
      if (Math.abs(v.speed) < v.cruise) v.speed = Math.min(v.speed + 4 * dt, v.cruise);
      // Wrap around the world edge instead of driving off the map.
      if (!this.city.inBounds(v.x, v.z)) {
        const p = this.randomRoadPoint();
        v.x = p.x; v.z = p.z; v.heading = p.heading;
        v.speed = 0;
      }
      const hit = this.city.collideCircle(v.x, v.z, 2);
      if (hit) { v.heading += Math.PI / 2; v.speed *= 0.4; }
      v.update(dt);
    }
    for (const p of this.peds) {
      p.wobble += dt;
      p.heading += Math.sin(p.wobble * 0.7) * dt * 0.4;
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      if (!this.city.inBounds(p.x, p.z)) p.heading += Math.PI;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // Flee from the player car when it gets close.
      const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 36) {
        p.x += (dx / Math.sqrt(d2 || 1)) * dt * 6;
        p.z += (dz / Math.sqrt(d2 || 1)) * dt * 6;
      }
    }
    for (const v of this.plows) {
      if (v.exploded) continue;
      v.drive(dt, { forward: true, back: false, left: false, right: false, handbrake: false }, -0.15);
      if (Math.abs(v.speed) < v.cruise) v.speed = Math.min(v.speed + 3 * dt, v.cruise);
      if (!this.city.inBounds(v.x, v.z)) { const p = this.randomRoadPoint(); v.x = p.x; v.z = p.z; v.speed = 0; }
      v.update(dt);
    }
    for (const s of this.skiers) {
      s.t += dt;
      s.mesh.position.z += s.speed * dt;
      s.mesh.position.x += Math.sin(s.t * 1.4) * dt * 3;
      s.mesh.rotation.z = Math.sin(s.t * 1.4) * 0.3;
      if (s.mesh.position.z > -160) {
        s.mesh.position.z = -380;
        s.mesh.position.x = 250 + (this.rng() - 0.5) * 60;
      }
    }
  }

  nearestCar(x, z, maxDist = 6) {
    let best = null, bestD = maxDist * maxDist;
    for (const v of [...this.cars, ...this.plows]) {
      if (v.exploded || v.driver === 'player') continue;
      const dx = v.x - x, dz = v.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = v; }
    }
    return best;
  }
}
