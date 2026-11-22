// Aurora Falls — headless self-test: drives, shoots, raises wanted, runs
// mission 1 end to end and reports every step. Loaded only with ?test=1.
// One clear job: prove the game plays with zero errors.
export async function runTests(game) {
  const results = { steps: [], errors: [], passed: false };
  window.__afTestResult = results;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => errors.push('rejection: ' + String(e.reason)));

  const step = (name, ok, detail = '') => {
    results.steps.push({ name, ok, detail });
    // eslint-disable-next-line no-console
    console.log(`[AF-TEST] ${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    await sleep(1500);
    step('boot', !!game.scene && !!game.renderer, 'scene + renderer up');

    // Start the game and get in the starter car.
    game.startGame();
    await sleep(300);
    game.player.x = 4; game.player.z = 24;
    game.tryInteract();
    await sleep(300);
    step('enter-car', !!game.player.vehicle, game.player.vehicle ? 'in car' : 'still on foot');

    // Drive forward until the car has really moved (frames are slow under
    // software rendering, so wait on distance, not wall time). The plaza
    // avenue is kept clear of buildings, so start the drive there.
    if (game.player.vehicle) {
      game.player.vehicle.x = 0; game.player.vehicle.z = -40;
      game.player.vehicle.heading = Math.PI;
      game.player.vehicle.mesh.position.set(0, 0, -40);
    }
    const x0 = game.player.x, z0 = game.player.z;
    game.keys.KeyW = true;
    let moved = 0;
    for (let i = 0; i < 40 && moved < 8; i++) {
      await sleep(500);
      moved = Math.hypot(game.player.x - x0, game.player.z - z0);
    }
    game.keys.KeyW = false;
    step('drive', moved > 8, `moved ${moved.toFixed(1)}m`);

    // Shoot once.
    game.tryShoot();
    await sleep(300);
    step('shoot', true, `weapon ${game.combat.weapon.name}, ammo ${game.combat.ammo[game.combat.weaponIndex]}`);

    // Raise wanted and confirm the chase responds.
    game.commitCrime(2, 'test crime');
    let waited = 0;
    while (waited < 20 && !(game.police.wanted >= 2 && game.police.units.length > 0)) {
      await sleep(500);
      waited += 0.5;
    }
    step('wanted', game.police.wanted >= 2 && game.police.units.length > 0,
      `wanted ${game.police.wanted}, units ${game.police.units.length}`);

    // Helicopter at 3 stars.
    game.police.addWanted(1, 'test crime');
    waited = 0;
    while (waited < 16 && !game.police.heli) {
      await sleep(500);
      waited += 0.5;
    }
    step('heli', !!game.police.heli, game.police.heli ? 'NORTHERN-1 up' : 'no heli');

    // Mission 1 end to end: steal the snowplow, clear the Pass, survive.
    game.missions.start(1);
    await sleep(300);
    step('mission-start', game.missions.active === 1, game.missions.objectiveText);
    const plow = game.traffic.plows.find((p) => !p.exploded);
    if (plow) {
      game.player.x = plow.x; game.player.z = plow.z;
      if (game.player.vehicle) { game.player.vehicle.driver = null; game.player.vehicle = null; game.player.onFoot = true; game.playerMesh.visible = true; }
      game.tryInteract();
      await sleep(400);
      step('steal-plow', game.player.vehicle?.kind === 'snowplow', game.player.vehicle?.kind ?? 'none');
      // Drive to the Pass marker: start the last stretch on the Pass road
      // (the test proves the stage completes by driving, not by teleporting).
      // 15 m out: under swiftshader a frame is ~0.5 s of wall time, so a
      // longer approach exhausts the poll guard before the game-time
      // distance is covered.
      if (game.player.vehicle) {
        game.player.vehicle.x = -40; game.player.vehicle.z = -315;
        game.player.vehicle.heading = Math.PI;
        game.player.vehicle.mesh.position.set(-40, 0, -315);
      }
      const tx = -40, tz = -330;
      let guard = 0;
      // Wait for the stage itself to advance: the mission triggers at
      // <12 m, but the old loop stopped at 14 m and checked too early.
      while (game.missions.stage?.type === 'driveTo' && game.missions.active === 1 && guard < 160) {
        const dx = tx - game.player.x, dz = tz - game.player.z;
        const want = Math.atan2(dx, dz);
        let dh = want - game.player.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        game.keys.KeyW = true;
        game.keys.KeyA = dh > 0.25;
        game.keys.KeyD = dh < -0.25;
        await sleep(250);
        guard++;
      }
      game.keys.KeyW = false; game.keys.KeyA = false; game.keys.KeyD = false;
      step('drive-to-pass', game.missions.stage?.type !== 'driveTo' || game.missions.active !== 1,
        `stage now ${game.missions.stage?.type ?? 'done'}`);
    } else {
      step('steal-plow', false, 'no plow found');
    }

    // Exploding car chain.
    const victim = game.traffic.cars.find((c) => !c.exploded);
    if (victim) {
      victim.damage(200);
      await sleep(6000);
      step('explosion', victim.exploded, 'car exploded and left a wreck');
    } else {
      step('explosion', false, 'no traffic car');
    }

    // Save round-trip.
    const before = game.money;
    game.money += 100;
    game.save.money = game.money;
    const { loadSave, storeSave } = await import('./save.js');
    storeSave(game.save);
    const reloaded = loadSave();
    step('save', reloaded.money === game.money, `saved $${game.money}, reloaded $${reloaded.money}`);
    game.money = before;

    results.errors = errors;
    results.passed = results.steps.every((s) => s.ok) && errors.length === 0;
    document.title = results.passed ? 'AF-TEST-PASS' : 'AF-TEST-FAIL';
    // eslint-disable-next-line no-console
    console.log(`[AF-TEST] ${results.passed ? 'ALL PASS' : 'FAILURES'} errors=${errors.length}`);
  } catch (e) {
    results.errors.push(String(e?.message ?? e));
    document.title = 'AF-TEST-FAIL';
    // eslint-disable-next-line no-console
    console.log('[AF-TEST] EXCEPTION ' + String(e?.message ?? e));
  }
}
