// Aurora Falls — the city itself: ground, districts, roads, buildings,
// neon, the frozen lake, the ski slopes and the mountain pass.
// One clear job: turn the district table into a place you can drive through.
import * as THREE from 'three';
import { WORLD, PALETTE, DISTRICTS, mulberry32, dist2 } from './config.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Windows glow warm against the cold facades; each district gets its own
// window rhythm so downtown reads different from the mine town.
function windowTexture(style, rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = style === 'tower' ? '#20242e' : style === 'wood' ? '#4a3626' : '#2b3242';
    g.fillRect(0, 0, w, h);
    const cols = style === 'tower' ? 8 : 5;
    const rows = style === 'tower' ? 16 : 6;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rng() < (style === 'tower' ? 0.55 : 0.4);
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fe8ff') : '#0c0f16';
        g.fillRect(6 + x * (w - 12) / cols, 8 + y * (h - 16) / rows, (w - 12) / cols - 4, (h - 16) / rows - 5);
      }
    }
    if (style === 'wood') {
      g.fillStyle = '#3a2a1c';
      g.fillRect(0, 0, w, 10);
    }
  });
}

function neonTexture(word, color) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'bold 40px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(word, w / 2, h / 2);
    g.shadowBlur = 4;
    g.fillStyle = '#ffffff';
    g.fillText(word, w / 2, h / 2);
  });
}

const NEON_WORDS = ['AURORA', 'HOTEL', 'CASINO', 'BAR', 'SKI', 'LAKE', 'NEON', 'MOTEL', 'CLUB', '24H'];

export class City {
  constructor(scene) {
    this.scene = scene;
    this.rng = mulberry32(20261123);
    this.colliders = []; // {x, z, r} circles the cars bounce off
    this.roads = [];
    this.spawnPoints = {};
    this.buildGround();
    this.buildLake();
    this.buildRoads();
    this.buildDistricts();
    this.buildPass();
    this.buildLamps();
  }

  buildGround() {
    const geo = new THREE.PlaneGeometry(WORLD.size * 2.2, WORLD.size * 2.2, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: PALETTE.snow, roughness: 0.92, metalness: 0 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    // Gentle mountain rim so the valley reads as a bowl.
    const rimGeo = new THREE.RingGeometry(WORLD.size * 0.95, WORLD.size * 2.4, 48);
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: 0xaebfd8, roughness: 1 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.2;
    this.scene.add(rim);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = WORLD.size * (1.05 + this.rng() * 0.5);
      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(90 + this.rng() * 90, 120 + this.rng() * 160, 5),
        new THREE.MeshStandardMaterial({ color: 0xcfdce8, roughness: 1, flatShading: true }),
      );
      peak.position.set(Math.cos(a) * r, 30, Math.sin(a) * r);
      this.scene.add(peak);
    }
  }

  buildLake() {
    // The frozen lake: a wide ice sheet east of downtown, ringed by a promenade.
    const lake = new THREE.Mesh(
      new THREE.CircleGeometry(150, 48),
      new THREE.MeshStandardMaterial({ color: PALETTE.lakeIce, roughness: 0.15, metalness: 0.55 }),
    );
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(40, 0.06, 260);
    lake.receiveShadow = true;
    this.scene.add(lake);
    // Skaters and ice-fishing huts as small figures on the ice.
    for (let i = 0; i < 14; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = this.rng() * 110;
      const skater = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.5, 1.1, 4, 8),
        new THREE.MeshStandardMaterial({ color: [0xff5a5a, 0x3aa0ff, 0xffd23e, 0x39ff88][i % 4], roughness: 0.7 }),
      );
      body.position.y = 1.1;
      skater.add(body);
      skater.position.set(40 + Math.cos(a) * r, 0.1, 260 + Math.sin(a) * r);
      this.scene.add(skater);
    }
    for (let i = 0; i < 6; i++) {
      const hut = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2.6, 3.4),
        new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }),
      );
      const a = this.rng() * Math.PI * 2;
      hut.position.set(40 + Math.cos(a) * 90, 1.4, 260 + Math.sin(a) * 90);
      hut.rotation.y = this.rng() * Math.PI;
      this.scene.add(hut);
    }
    // Ice-road race loop marked on the lake.
    const loopGeo = new THREE.RingGeometry(88, 92, 64);
    const loop = new THREE.Mesh(loopGeo, new THREE.MeshBasicMaterial({ color: PALETTE.neonOrange, transparent: true, opacity: 0.7 }));
    loop.rotation.x = -Math.PI / 2;
    loop.position.set(40, 0.12, 260);
    this.scene.add(loop);
  }

  buildRoads() {
    // A simple grid of avenues through downtown plus spokes to each district.
    const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.55, metalness: 0.15 });
    const iceMat = new THREE.MeshStandardMaterial({ color: PALETTE.asphaltIce, roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.55 });
    const addRoad = (x, z, w, l, rotY = 0) => {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = rotY;
      road.position.set(x, 0.08, z);
      road.receiveShadow = true;
      this.scene.add(road);
      const ice = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, l * 0.94), iceMat);
      ice.rotation.x = -Math.PI / 2;
      ice.rotation.z = rotY;
      ice.position.set(x, 0.1, z);
      this.scene.add(ice);
      this.roads.push({ x, z, w, l, rotY });
    };
    for (let i = -2; i <= 2; i++) {
      addRoad(i * 70, -40, 14, 340); // north-south avenues
      addRoad(0, -40 + i * 70, 340, 14); // east-west streets
    }
    addRoad(-130, 70, 14, 300, Math.PI / 4); // spoke to Old Mine Town
    addRoad(140, -130, 14, 300, -Math.PI / 4); // spoke to Ski Resort
    addRoad(20, 110, 14, 300); // spoke to the lake
    addRoad(-20, -185, 14, 300); // spoke to the Pass
  }

  buildDistricts() {
    const mats = {};
    const texFor = (style) => {
      if (!mats[style]) {
        mats[style] = new THREE.MeshStandardMaterial({
          map: windowTexture(style, mulberry32(1000 + style.length * 77)),
          roughness: 0.85, metalness: 0.05,
          emissive: 0xffffff, emissiveMap: windowTexture(style, mulberry32(2000 + style.length * 91)),
          emissiveIntensity: 0.55,
        });
        // One texture instance per style; emissive map shares it.
        mats[style].emissiveMap = mats[style].map;
      }
      return mats[style];
    };
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.9 });
    for (const d of DISTRICTS) {
      if (d.id === 'lake' || d.id === 'pass') continue;
      const count = d.id === 'downtown' ? 46 : 22;
      for (let i = 0; i < count; i++) {
        const a = this.rng() * Math.PI * 2;
        const r = Math.sqrt(this.rng()) * (d.r - 18);
        const x = d.cx + Math.cos(a) * r;
        const z = d.cz + Math.sin(a) * r;
        if (Math.abs(x) < 24 && Math.abs(z + 40) < 24) continue; // keep the plaza open
        const floors = d.floors[0] + this.rng() * (d.floors[1] - d.floors[0]);
        const w = 10 + this.rng() * 14;
        const depth = 10 + this.rng() * 14;
        const h = floors * 3.4;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), texFor(d.style));
        b.position.set(x, h / 2, z);
        b.rotation.y = (this.rng() - 0.5) * 0.3;
        b.castShadow = true;
        this.scene.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, depth + 0.6), roofMat);
        roof.position.set(x, h + 0.25, z);
        roof.rotation.y = b.rotation.y;
        this.scene.add(roof);
        this.colliders.push({ x, z, r: Math.max(w, depth) * 0.62 });
        if (d.neon && this.rng() < 0.4) {
          const word = NEON_WORDS[Math.floor(this.rng() * NEON_WORDS.length)];
          const color = ['#ff7a1a', '#ff2e88', '#19e3ff', '#39ff88'][Math.floor(this.rng() * 4)];
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 3),
            new THREE.MeshBasicMaterial({ map: neonTexture(word, color), transparent: true }),
          );
          sign.position.set(x, h * 0.72, z + depth / 2 + 0.15);
          this.scene.add(sign);
        }
      }
      this.spawnPoints[d.id] = { x: d.cx, z: d.cz };
    }
    this.buildSkiSlopes();
    this.buildMineProps();
  }

  buildSkiSlopes() {
    // Floodlit piste: a broad slope with lift towers and a cable line.
    const slope = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 220),
      new THREE.MeshStandardMaterial({ color: 0xe6eef8, roughness: 0.9 }),
    );
    slope.rotation.x = -Math.PI / 2.6;
    slope.position.set(250, 18, -300);
    slope.receiveShadow = true;
    this.scene.add(slope);
    for (let i = 0; i < 5; i++) {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 22, 6),
        new THREE.MeshStandardMaterial({ color: 0x333a44, roughness: 0.6, metalness: 0.5 }),
      );
      tower.position.set(250, 12 + i * 2, -380 + i * 40);
      this.scene.add(tower);
      const chair = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1.6, 2),
        new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 }),
      );
      chair.position.set(250, 20 + i * 2, -372 + i * 40);
      this.scene.add(chair);
    }
    // Chalets at the base.
    for (let i = 0; i < 6; i++) {
      const chalet = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 7), new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 0.9 }));
      base.position.y = 2;
      chalet.add(base);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(6.5, 3, 4), new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.95 }));
      roof.position.y = 5.5;
      roof.rotation.y = Math.PI / 4;
      chalet.add(roof);
      chalet.position.set(210 + i * 16, 0, -150 - (i % 2) * 12);
      this.scene.add(chalet);
      this.colliders.push({ x: chalet.position.x, z: chalet.position.z, r: 6 });
    }
  }

  buildMineProps() {
    // Mine headframe and rusted cable-car line over Old Mine Town.
    const frame = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.85 });
    for (const [sx, sz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 16, 6), legMat);
      leg.position.set(sx, 8, sz);
      leg.rotation.z = -sx * 0.06;
      leg.rotation.x = sz * 0.06;
      frame.add(leg);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(7, 2, 7), legMat);
    top.position.y = 16.5;
    frame.add(top);
    frame.position.set(-260, 0, 180);
    this.scene.add(frame);
    this.colliders.push({ x: -260, z: 180, r: 5 });
  }

  buildPass() {
    // The winding mountain road: two tunnel mouths and avalanche galleries.
    for (const [x, z, rot] of [[-40, -330, 0], [-90, -380, 0.5], [10, -380, -0.5]]) {
      const mouth = new THREE.Mesh(
        new THREE.BoxGeometry(16, 8, 4),
        new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.9 }),
      );
      mouth.position.set(x, 4, z);
      mouth.rotation.y = rot;
      this.scene.add(mouth);
      const dark = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 6),
        new THREE.MeshBasicMaterial({ color: 0x05070c }),
      );
      dark.position.set(x, 3, z + 2.1);
      dark.rotation.y = rot;
      this.scene.add(dark);
      this.colliders.push({ x, z, r: 8 });
    }
  }

  buildLamps() {
    // Street lamps along the downtown grid; a few carry real lights, the
    // rest are emissive so the frame stays fast.
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6, metalness: 0.6 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    let lit = 0;
    for (let gx = -2; gx <= 2; gx++) {
      for (let gz = -2; gz <= 2; gz++) {
        const x = gx * 70 + 9;
        const z = -40 + gz * 70 + 9;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
        pole.position.set(x, 3, z);
        this.scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
        bulb.position.set(x, 6.1, z);
        this.scene.add(bulb);
        if (lit < 6) {
          const light = new THREE.PointLight(0xffe9b0, 30, 45, 1.8);
          light.position.set(x, 6, z);
          this.scene.add(light);
          lit++;
        }
      }
    }
  }

  // Circle colliders for cars: buildings, huts, tunnels.
  collideCircle(x, z, r) {
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z;
      const rr = r + c.r;
      if (dx * dx + dz * dz < rr * rr) return c;
    }
    return null;
  }

  inBounds(x, z) {
    return Math.abs(x) < WORLD.size && Math.abs(z) < WORLD.size;
  }

  districtAt(x, z) {
    let best = null, bestD = Infinity;
    for (const d of DISTRICTS) {
      const dd = dist2(x, z, d.cx, d.cz);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }
}
