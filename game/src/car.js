// Aurora Falls — vehicles: arcade driving with real snow feel.
// One clear job: how a car moves, slides, drifts and takes damage on ice.
import * as THREE from 'three';
import { TUNING, clamp, lerp } from './config.js';

const CAR_COLORS = [0xc0392b, 0x2471a3, 0x1e8449, 0x7d3c98, 0xb7950b, 0x5d6d7e, 0xe67e22, 0x16a085];

export function buildCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1a26, roughness: 0.1, metalness: 0.8 });
  const isPlow = kind === 'snowplow';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(isPlow ? 2.6 : 2, 0.75, isPlow ? 5.4 : 4.4),
    bodyMat,
  );
  body.position.y = 0.65;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, isPlow ? 2.2 : 2.2), glassMat);
  cabin.position.set(0, 1.3, isPlow ? -0.4 : -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  if (isPlow) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.1, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.4, metalness: 0.6 }),
    );
    blade.position.set(0, 0.5, 2.9);
    blade.rotation.x = -0.25;
    g.add(blade);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  g.userData.wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
    g.userData.wheels.push(w);
  }
  // Headlight cones: visible beams cutting through the snowfall.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe9b0, transparent: true, opacity: 0.07,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (const s of [-0.7, 0.7]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 7, 12, 1, true), beamMat);
    cone.rotation.x = -Math.PI / 2 - 0.06;
    cone.position.set(s, 0.75, 5.6);
    g.add(cone);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0 }),
    );
    lamp.position.set(s, 0.8, 2.25);
    g.add(lamp);
  }
  const spot = new THREE.SpotLight(0xffe9b0, 40, 40, 0.5, 0.5, 1.4);
  spot.position.set(0, 1, 2.2);
  const target = new THREE.Object3D();
  target.position.set(0, 0, 14);
  g.add(target);
  spot.target = target;
  g.add(spot);
  g.userData.spot = spot;
  return g;
}

export class Vehicle {
  constructor(scene, x, z, heading, kind = 'sedan', color = null) {
    this.scene = scene;
    this.kind = kind;
    this.mesh = buildCarMesh(color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], kind);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = TUNING.carHealth;
    this.burning = false;
    this.burnTimer = 0;
    this.exploded = false;
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.stuckTimer = 0;
    this.upgrades = { engine: 0, tires: 0, armor: 0 };
  }

  get pos() { return { x: this.x, z: this.z }; }

  // Arcade ice physics: grip scales with upgrades and crew perks; the car
  // keeps sliding after the wheel straightens, and the handbrake drops grip
  // so the tail steps out for a drift.
  drive(dt, input, gripBonus = 0) {
    if (this.exploded || this.burning) return;
    const tireBonus = TUNING.tireGripBonus[this.upgrades.tires] ?? 0;
    const grip = (input.handbrake ? TUNING.driftGrip : TUNING.iceGrip) + gripBonus + tireBonus;
    const engineMul = 1 + this.upgrades.engine * 0.14;
    const topSpeed = TUNING.playerTopSpeed * engineMul;
    if (input.forward) this.speed += TUNING.playerAccel * engineMul * dt;
    if (input.back) this.speed -= TUNING.playerBrake * dt;
    if (!input.forward && !input.back) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    }
    this.speed = clamp(this.speed, -14, topSpeed);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer = lerp(this.steer, steerTarget, clamp(dt * 7, 0, 1));
    const turnRate = this.steer * 1.9 * grip * clamp(Math.abs(this.speed) / 12, 0, 1) * Math.sign(this.speed || 1);
    this.heading += turnRate * dt;
    // Slide: velocity keeps a memory of the old heading on ice.
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const slide = 1 - grip;
    this.slideX = lerp(this.slideX ?? 0, fx * this.speed, clamp(dt * (2 + grip * 6), 0, 1));
    this.slideZ = lerp(this.slideZ ?? 0, fz * this.speed, clamp(dt * (2 + grip * 6), 0, 1));
    void slide;
    this.x += this.slideX * dt;
    this.z += this.slideZ * dt;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Wheels spin and the front pair steers.
    const spin = this.speed * dt * 2.4;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.burning) {
      this.burnTimer -= dt;
      if (this.burnTimer <= 0) this.explode();
    }
  }

  // A shot car catches fire, burns a few seconds, then explodes and leaves a
  // wreck that keeps hurting whatever touches it.
  damage(amount, fromExplosion = false) {
    if (this.exploded) return;
    const armorMul = 1 - this.upgrades.armor * 0.15;
    this.health -= amount * armorMul;
    if (this.health <= 35 && !this.burning) {
      this.burning = true;
      this.burnTimer = 3 + Math.random() * 2;
      this.startFire();
    }
    if (this.health <= 0 && !fromExplosion) this.explode();
  }

  startFire() {
    const fire = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 2.4, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.85 }),
    );
    fire.position.set(0, 1.6, 0);
    this.mesh.add(fire);
    this.fireMesh = fire;
    const light = new THREE.PointLight(0xff6a00, 40, 18, 1.6);
    light.position.set(0, 2, 0);
    this.mesh.add(light);
    this.fireLight = light;
  }

  explode() {
    if (this.exploded) return;
    this.exploded = true;
    this.burning = false;
    if (this.fireMesh) this.mesh.remove(this.fireMesh);
    if (this.fireLight) this.mesh.remove(this.fireLight);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.9 }),
    );
    flash.position.y = 1;
    this.mesh.add(flash);
    this.flashMesh = flash;
    this.flashTimer = 0.4;
    // The wreck stays: blackened, smoking, still in the way.
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) o.material = o.material.clone();
    });
    this.mesh.children.forEach((o) => {
      if (o.isMesh && o.material && o.material.color && o !== flash) o.material.color.setHex(0x1a1a1a);
    });
  }

  update(dt) {
    if (this.flashMesh) {
      this.flashTimer -= dt;
      this.flashMesh.scale.setScalar(Math.max(0.01, this.flashTimer / 0.4));
      if (this.flashTimer <= 0) this.mesh.remove(this.flashMesh);
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}
