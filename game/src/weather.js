// Aurora Falls — sky, aurora, snow and blizzard fronts.
// One clear job: everything the player sees when they look up or ahead.
import * as THREE from 'three';
import { PALETTE, TUNING, mulberry32, clamp, lerp } from './config.js';

// A big curved ribbon high in the sky, shaded by a fragment shader so the
// aurora ripples green into purple. The bands drift with time.
const AURORA_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const AURORA_FRAG = `
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float band = sin(vUv.x * 9.0 + uTime * 0.35) * 0.5 + 0.5;
  float band2 = sin(vUv.x * 17.0 - uTime * 0.22 + 1.7) * 0.5 + 0.5;
  float edge = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
  float glow = (band * 0.65 + band2 * 0.35) * edge * uStrength * 1.4;
  vec3 green = vec3(0.27, 1.0, 0.63);
  vec3 purple = vec3(0.60, 0.36, 1.0);
  vec3 col = mix(green, purple, band2 * 0.7);
  gl_FragColor = vec4(col * glow, glow * 0.85);
}`;

export class Weather {
  constructor(scene, rng, snowCount = 3200) {
    this.scene = scene;
    this.rng = rng;
    this.time = 0;
    this.blizzard = 0; // 0 clear .. 1 full whiteout
    this.blizzardTimer = 12;
    this.blizzardTarget = 0;
    this.night = 0.9; // 0 day .. 1 deep night
    this.snowSpeed = 1;
    this.snowCount = snowCount;

    scene.fog = new THREE.FogExp2(0x0a1226, 0.0038);
    scene.background = new THREE.Color(PALETTE.nightSky);

    this.buildStars();
    this.buildAurora();
    this.buildMoon();
    this.buildSnow();
  }

  buildStars() {
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const e = 0.15 + this.rng() * 1.2;
      const r = 800;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.9,
    }));
    this.scene.add(this.stars);
  }

  buildAurora() {
    const geo = new THREE.PlaneGeometry(1500, 380, 48, 8);
    // Bend the ribbon into a shallow arc across the northern sky.
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, -Math.abs(x) * 0.12);
      p.setY(i, p.getY(i) + Math.sin((x / 1500 + 0.5) * Math.PI) * 40);
    }
    geo.computeVertexNormals();
    this.auroraMat = new THREE.ShaderMaterial({
      vertexShader: AURORA_VERT,
      fragmentShader: AURORA_FRAG,
      uniforms: { uTime: { value: 0 }, uStrength: { value: 0.9 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.aurora = new THREE.Mesh(geo, this.auroraMat);
    this.aurora.position.set(0, 200, -420);
    this.aurora.rotation.x = -0.45;
    this.scene.add(this.aurora);
  }

  buildMoon() {
    this.moon = new THREE.Mesh(
      new THREE.CircleGeometry(26, 32),
      new THREE.MeshBasicMaterial({ color: 0xe8f0ff, fog: false }),
    );
    this.moon.position.set(-320, 320, -600);
    this.moon.lookAt(0, 0, 0);
    this.scene.add(this.moon);
    this.moonLight = new THREE.DirectionalLight(PALETTE.moonlight, 0.85);
    this.moonLight.position.set(-200, 300, -150);
    this.scene.add(this.moonLight);
    this.scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x1c2436, 0.55));
  }

  buildSnow() {
    const count = this.snowCount;
    this.snowPos = new Float32Array(count * 3);
    this.snowVel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.snowPos[i * 3] = (this.rng() - 0.5) * 420;
      this.snowPos[i * 3 + 1] = this.rng() * 90;
      this.snowPos[i * 3 + 2] = (this.rng() - 0.5) * 420;
      this.snowVel[i] = 4 + this.rng() * 7;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    // Round soft flakes: square points read as artifacts on snow.
    const flake = document.createElement('canvas');
    flake.width = 32; flake.height = 32;
    const fg = flake.getContext('2d');
    const grad = fg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    fg.fillStyle = grad;
    fg.fillRect(0, 0, 32, 32);
    const flakeTex = new THREE.CanvasTexture(flake);
    this.snowMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.7, transparent: true, opacity: 0.85,
      map: flakeTex, depthWrite: false,
    });
    this.snow = new THREE.Points(geo, this.snowMat);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  // Rolls blizzard fronts in and out on a slow cycle.
  update(dt, playerPos) {
    this.time += dt;
    this.blizzardTimer -= dt;
    if (this.blizzardTimer <= 0) {
      this.blizzardTarget = this.blizzardTarget > 0.5 ? 0 : 1;
      this.blizzardTimer = this.blizzardTarget > 0.5
        ? TUNING.blizzardSeconds : TUNING.clearSeconds;
    }
    const rate = this.blizzardTarget > 0.5 ? dt / 6 : dt / 9;
    this.blizzard = clamp(this.blizzard + (this.blizzardTarget > 0.5 ? rate : -rate), 0, 1);

    // Snow follows the player so the fall never runs out. Direct array
    // access: BufferAttribute getters/setters per flake are far too slow.
    const pos = this.snow.geometry.attributes.position;
    const arr = pos.array;
    const wind = this.blizzard * 14;
    for (let i = 0; i < this.snowCount; i++) {
      const i3 = i * 3;
      let y = arr[i3 + 1] - this.snowVel[i] * dt * (1 + this.blizzard * 1.6);
      let x = arr[i3] + wind * dt + Math.sin(this.time * 0.8 + i) * dt * 0.6;
      if (y < 0) {
        y = 80 + this.rng() * 10;
        x = playerPos.x + (this.rng() - 0.5) * 420;
        arr[i3 + 2] = playerPos.z + (this.rng() - 0.5) * 420;
      }
      if (x > playerPos.x + 210) x = playerPos.x - 210;
      arr[i3 + 1] = y;
      arr[i3] = x;
    }
    pos.needsUpdate = true;

    // Fog thickens hard in a blizzard; the aurora is strongest at night.
    const fogDensity = lerp(0.0032, 0.016, this.blizzard);
    this.scene.fog.density = fogDensity;
    const auroraStrength = lerp(0.25, 1.0, this.night) * (1 - this.blizzard * 0.55);
    this.auroraMat.uniforms.uTime.value = this.time;
    this.auroraMat.uniforms.uStrength.value = auroraStrength;
    this.stars.material.opacity = lerp(0.25, 0.9, this.night) * (1 - this.blizzard * 0.7);
    this.moon.material.opacity = 1;
  }

  visibility() { return 1 - this.blizzard * 0.75; }
  isBlizzard() { return this.blizzard > 0.6; }
}

export function makeRng(seed) { return mulberry32(seed); }
