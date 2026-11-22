// Aurora Falls — shared tuning, palette, districts and mission definitions.
// One clear job: every number the rest of the game agrees on lives here.
export const WORLD = {
  size: 900, // playable square, metres
  groundY: 0,
  seed: 20261123,
  snowDepth: 0.35,
};

export const PALETTE = {
  snow: 0xdfe9f5,
  snowShadow: 0xb9c8de,
  ice: 0x9fd4e8,
  lakeIce: 0x7fb8d8,
  asphalt: 0x23262e,
  asphaltIce: 0x3a4a5c,
  neonOrange: 0xff7a1a,
  neonPink: 0xff2e88,
  neonCyan: 0x19e3ff,
  neonGreen: 0x39ff88,
  auroraGreen: 0x46ffa0,
  auroraPurple: 0x9a5cff,
  nightSky: 0x070b1e,
  duskSky: 0x1b2a4a,
  moonlight: 0xbfd4ff,
  headlight: 0xffe9b0,
  policeRed: 0xff2233,
  policeBlue: 0x2255ff,
  taxiYellow: 0xffc21a,
};

// Five districts of Aurora Falls. Each has a centre, a radius, a building
// style and the neon / light mood that makes it readable at a glance.
export const DISTRICTS = [
  {
    id: 'downtown', name: 'Neon Downtown', cx: 0, cz: -40, r: 170,
    style: 'tower', floors: [14, 26], neon: true,
    blurb: 'Tall towers, neon signs reflecting on icy streets.',
  },
  {
    id: 'mine', name: 'Old Mine Town', cx: -260, cz: 180, r: 130,
    style: 'wood', floors: [2, 4], neon: false,
    blurb: 'Wooden houses, mine shafts, rusted cable cars.',
  },
  {
    id: 'resort', name: 'Ski Resort', cx: 250, cz: -220, r: 150,
    style: 'chalet', floors: [2, 5], neon: false,
    blurb: 'Slopes, lifts, chalets, floodlit pistes.',
  },
  {
    id: 'lake', name: 'Frozen Lake', cx: 40, cz: 260, r: 170,
    style: 'lakeside', floors: [2, 4], neon: false,
    blurb: 'A vast frozen lake with skaters, fishermen, a promenade.',
  },
  {
    id: 'pass', name: 'The Pass', cx: -40, cz: -330, r: 130,
    style: 'tunnel', floors: [1, 3], neon: false,
    blurb: 'A winding mountain road with tunnels and avalanche galleries.',
  },
];

export const CREW = {
  kai: { name: 'KAI', role: 'Getaway driver', color: '#ffd23e' },
  maya: {
    name: 'MAYA', role: 'Driver — ice-road specialist',
    color: '#39ff88',
    perk: 'Getaway cars grip better on snow; drift through roadblocks.',
  },
  dario: {
    name: 'DARIO', role: 'Hacker',
    color: '#19e3ff',
    perk: 'Disables cameras and opens shutters remotely.',
  },
  june: {
    name: 'JUNE', role: 'Lookout',
    color: '#ff9de2',
    perk: 'Marks patrol routes and safe houses on the minimap.',
  },
};

export const WARDEN = {
  name: 'THE WARDEN',
  title: 'Resort magnate who owns the mountain',
};

// 8 staged missions. Each is a set-piece with a twist, not an errand.
export const MISSIONS = [
  {
    id: 1, title: 'First Snow', district: 'pass',
    brief: 'Steal a snowplow, clear a path, escape through the Pass in a blizzard.',
    stages: [
      { type: 'steal', vehicle: 'snowplow', label: 'Steal the snowplow' },
      { type: 'driveTo', x: -40, z: -330, label: 'Clear the Pass road' },
      { type: 'escape', seconds: 30, label: 'Escape the AFPD in the blizzard' },
    ],
    reward: 1200,
  },
  {
    id: 2, title: 'Lift Ticket', district: 'resort',
    brief: 'Ride the cable car up, rob the resort safe house, ski-chase down the piste.',
    stages: [
      { type: 'driveTo', x: 250, z: -220, label: 'Reach the cable car base' },
      { type: 'collect', count: 3, label: 'Rob the resort safe house' },
      { type: 'escape', seconds: 25, label: 'Ski-chase down the piste' },
    ],
    reward: 1800,
  },
  {
    id: 3, title: 'Frozen Assets', district: 'lake',
    brief: 'Crack the frozen-lake vault during the ice festival while the crowd watches.',
    stages: [
      { type: 'driveTo', x: 40, z: 260, label: 'Reach the ice festival' },
      { type: 'collect', count: 4, label: 'Crack the vault' },
      { type: 'escape', seconds: 30, label: 'Lose the crowd and the cops' },
    ],
    reward: 2400,
  },
  {
    id: 4, title: 'Whiteout', district: 'pass',
    brief: "Lose a 5-star chase inside a whiteout, using Maya's drift to slip roadblocks.",
    stages: [
      { type: 'wanted', stars: 5, label: 'Draw a 5-star wanted level' },
      { type: 'escape', seconds: 45, label: 'Lose the chase in the whiteout' },
    ],
    reward: 3000,
  },
  {
    id: 5, title: 'Avalanche', district: 'resort',
    brief: 'Trigger a controlled avalanche to bury a convoy, then loot it before the plows arrive.',
    stages: [
      { type: 'driveTo', x: 250, z: -220, label: 'Reach the avalanche charges' },
      { type: 'collect', count: 5, label: 'Loot the buried convoy' },
      { type: 'escape', seconds: 20, label: 'Clear out before the plows arrive' },
    ],
    reward: 3600,
  },
  {
    id: 6, title: 'Neon Debt', district: 'downtown',
    brief: 'Collect from three downtown clubs before the Warden\u2019s men torch them.',
    stages: [
      { type: 'collect', count: 3, label: 'Collect from the downtown clubs' },
      { type: 'escape', seconds: 30, label: 'Get out before the torches' },
    ],
    reward: 4200,
  },
  {
    id: 7, title: 'The Long Night', district: 'lake',
    brief: "An ice-road race across the frozen lake at midnight against the Warden's champion.",
    stages: [
      { type: 'race', laps: 2, label: 'Beat the Warden\u2019s champion on the ice' },
    ],
    reward: 5000,
  },
  {
    id: 8, title: 'Aurora Heist', district: 'downtown',
    brief: "Rob the Warden's aurora-view penthouse during the festival fireworks, then escape by frozen lake as the whole city chases you.",
    stages: [
      { type: 'driveTo', x: 0, z: -40, label: 'Reach the penthouse tower' },
      { type: 'collect', count: 6, label: 'Empty the penthouse vault' },
      { type: 'escape', seconds: 60, label: 'Escape across the frozen lake' },
    ],
    reward: 12000,
  },
];

export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', damage: 34, rate: 0.22, range: 60, mag: 12 },
  { id: 'shotgun', name: 'Shotgun', damage: 22, rate: 0.9, range: 26, mag: 6, pellets: 6 },
  { id: 'rifle', name: 'Rifle', damage: 55, rate: 0.12, range: 120, mag: 30 },
  { id: 'smg', name: 'SMG', damage: 18, rate: 0.07, range: 45, mag: 32 },
];

export const GARAGE_UPGRADES = [
  { id: 'engine', name: 'Engine', levels: 3, costs: [400, 900, 1800], desc: 'Top speed and acceleration.' },
  { id: 'tires', name: 'Snow Tires', levels: 3, costs: [300, 700, 1400], desc: 'Grip on ice; shorter slides, tighter drifts.' },
  { id: 'armor', name: 'Armor', levels: 3, costs: [500, 1100, 2200], desc: 'Car health and explosion resistance.' },
  { id: 'paint', name: 'Paint', levels: 3, costs: [200, 450, 900], desc: 'Fresh coats: aurora fade, neon drip, matte black.' },
];

export const RADIOS = [
  { id: 'aurora', name: 'AURORA FM', mood: 'Synthwave under the lights', tempo: 112 },
  { id: 'pass', name: 'PASS 94', mood: 'Cold rock for the mountain road', tempo: 140 },
  { id: 'lake', name: 'LAKE LOUNGE', mood: 'Slow jazz by the frozen water', tempo: 72 },
];

export const TUNING = {
  playerAccel: 26,
  playerTopSpeed: 46,
  playerBrake: 42,
  iceGrip: 0.55, // how much steering bites on snow (1 = tarmac)
  driftGrip: 0.32, // while handbraking
  mayaGripBonus: 0.22,
  tireGripBonus: [0, 0.08, 0.16, 0.24],
  policeRamDamage: 3,
  scrapeDamage: 1,
  carHealth: 100,
  playerHealth: 100,
  explosionRadius: 9,
  explosionDamage: 70,
  wantedDecaySeconds: 14,
  blizzardSeconds: 26,
  clearSeconds: 40,
};

// Deterministic RNG so every run builds the same city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
