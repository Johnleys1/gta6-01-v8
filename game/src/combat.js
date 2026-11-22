// Aurora Falls — combat: the 4-weapon wheel, shooting on foot and from a
// car, and the fire chain that turns a shot car into a burning wreck.
// One clear job: everything that goes bang.
import * as THREE from 'three';
import { WEAPONS, TUNING } from './config.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.weaponIndex = 0;
    this.ammo = WEAPONS.map((w) => w.mag);
    this.cooldown = 0;
    this.tracers = [];
    this.muzzle = null;
  }

  get weapon() { return WEAPONS[this.weaponIndex]; }

  cycleWeapon(dir = 1) {
    this.weaponIndex = (this.weaponIndex + dir + WEAPONS.length) % WEAPONS.length;
    return this.weapon;
  }

  selectWeapon(i) {
    if (i >= 0 && i < WEAPONS.length) this.weaponIndex = i;
    return this.weapon;
  }

  // Hitscan shot from the player toward a world point. Returns what it hit.
  shoot(origin, target, vehicles, peds) {
    if (this.cooldown > 0) return null;
    const w = this.weapon;
    if (this.ammo[this.weaponIndex] <= 0) {
      this.ammo[this.weaponIndex] = w.mag; // auto reload
      this.cooldown = 0.8;
      return { reloaded: true };
    }
    this.ammo[this.weaponIndex] -= 1;
    this.cooldown = w.rate;
    this.spawnTracer(origin, target);
    this.spawnMuzzle(origin);
    const dir = new THREE.Vector3().subVectors(target, origin).normalize();
    const pellets = w.pellets ?? 1;
    let hit = null;
    for (let p = 0; p < pellets; p++) {
      const spread = 0.02 * (w.id === 'shotgun' ? 3 : 1);
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * spread;
      d.y += (Math.random() - 0.5) * spread;
      d.z += (Math.random() - 0.5) * spread;
      d.normalize();
      const ray = new THREE.Raycaster(origin, d, 0, w.range);
      const meshes = [];
      for (const v of vehicles) {
        if (v.exploded) continue;
        v.mesh.traverse((o) => { if (o.isMesh) meshes.push(o); });
      }
      const hits = ray.intersectObjects(meshes, false);
      if (hits.length > 0) {
        // Find which vehicle owns the mesh.
        for (const v of vehicles) {
          let found = false;
          v.mesh.traverse((o) => { if (o === hits[0].object) found = true; });
          if (found) {
            v.damage(w.damage, false);
            hit = { type: 'vehicle', vehicle: v, point: hits[0].point };
            break;
          }
        }
      }
    }
    return hit;
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9b0, transparent: true, opacity: 0.9,
    }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  spawnMuzzle(pos) {
    if (this.muzzle) this.scene.remove(this.muzzle);
    this.muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.95 }),
    );
    this.muzzle.position.copy(pos);
    this.scene.add(this.muzzle);
    setTimeout(() => { if (this.muzzle) { this.scene.remove(this.muzzle); this.muzzle = null; } }, 60);
  }

  // An exploded car hurts everything near it, then the chain can jump to
  // the next car. Burning wrecks keep damaging what touches them.
  explosionDamage(center, vehicles, onPlayerDamage) {
    const r = TUNING.explosionRadius;
    for (const v of vehicles) {
      if (v.exploded) continue;
      const d = Math.hypot(v.x - center.x, v.z - center.z);
      if (d < r) v.damage(TUNING.explosionDamage * (1 - d / (r * 1.4)), true);
    }
    return r;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const t of this.tracers) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.08) * 0.9;
    }
    const dead = this.tracers.filter((t) => t.life <= 0);
    for (const t of dead) this.scene.remove(t.line);
    this.tracers = this.tracers.filter((t) => t.life > 0);
  }
}
