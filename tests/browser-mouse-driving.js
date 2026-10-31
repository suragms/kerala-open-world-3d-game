async (page) => {
  const results = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const state = () => page.evaluate(() => window.__KOW__.snapshot());
  const controls = () => page.evaluate(() => window.__KOW__.controls());
  const check = (name, condition, detail) => {
    results.push({ name, passed: !!condition, detail });
    if (!condition) throw new Error(`${name}: ${JSON.stringify(detail)}`);
  };
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: 'Return to arrival point', exact: false }).click();
  await page.getByRole('button', { name: 'Mouse movement', exact: true }).click();
  const canvas = page.locator('.game-canvas canvas');
  const rect = await canvas.boundingBox();
  const center = { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.5 };
  await page.mouse.move(center.x, center.y);
  await page.locator('.interact-prompt').click();
  await page.waitForTimeout(350);
  check('Mouse vehicle entry', (await state()).driving);
  check('Driving prompt switches to Exit vehicle', (await state()).near === 'Exit vehicle', (await state()).near);
  check('Mouse driving hint fits its control card', await page.locator('.control-line--mouse span').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: 'output/playwright/mouse-driving-controls.png' });

  const forward = page.getByRole('button', { name: 'Drive forward', exact: true });
  const forwardBox = await forward.boundingBox();
  await page.mouse.move(forwardBox.x + forwardBox.width / 2, forwardBox.y + forwardBox.height / 2);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(650);
  await page.mouse.up({ button: 'left' });
  check('Forward button moves the vehicle', (await state()).speed > 3, (await state()).speed);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(550);
  let snapshot = await state();
  check('Left mouse drives forward', snapshot.speed > 5, snapshot.speed);
  await page.mouse.move(center.x + rect.width * 0.25, center.y, { steps: 10 });
  await page.waitForTimeout(450);
  check('Pointer movement steers', Math.abs((await state()).steering) > 0.05, (await state()).steering);
  await page.mouse.up({ button: 'left' });

  const pitch = (await controls()).cameraPitch;
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(center.x + 30, center.y - 12, { steps: 4 });
  await page.waitForTimeout(900);
  await page.mouse.up({ button: 'right' });
  check('Right mouse brakes without camera orbit', Math.abs((await controls()).cameraPitch - pitch) < 0.02);

  const reverse = page.getByRole('button', { name: 'Drive in reverse', exact: true });
  const reverseBox = await reverse.boundingBox();
  await page.mouse.move(reverseBox.x + reverseBox.width / 2, reverseBox.y + reverseBox.height / 2);
  const reverseStart = await state();
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(1500);
  await page.mouse.up({ button: 'left' });
  snapshot = await state();
  const reverseDelta = {
    x: snapshot.position.x - reverseStart.position.x,
    z: snapshot.position.z - reverseStart.position.z,
  };
  const forwardDot = reverseDelta.x * Math.sin(reverseStart.yaw) - reverseDelta.z * Math.cos(reverseStart.yaw);
  check('Reverse button brakes, shifts and backs up', snapshot.reverse && forwardDot < -0.8, { speedKmh: snapshot.speed, reverse: snapshot.reverse, forwardDot });

  await page.locator('.interact-prompt').click();
  await page.waitForTimeout(1400);
  snapshot = await state();
  check('Exit request stops the car and returns to walking', !snapshot.driving, snapshot);
  check('Exit leaves the player in a valid open position', !(await page.evaluate(() => window.__KOW__.diagnostics().blocked)));

  const walkStart = snapshot.position;
  const cameraYaw = (await controls()).cameraYaw;
  let walkAccepted = false;
  for (let i = 0; i < 12 && !walkAccepted; i++) {
    const angle = cameraYaw + i * Math.PI / 6;
    const goal = { x: walkStart.x + Math.sin(angle) * 9, z: walkStart.z - Math.cos(angle) * 9 };
    const screen = await page.evaluate(point => window.__KOW__.projectGround(point), goal);
    if (!screen.visible || screen.x < rect.x || screen.x > rect.x + rect.width || screen.y < rect.y || screen.y > rect.y + rect.height) continue;
    await page.mouse.click(screen.x, screen.y);
    await page.waitForTimeout(180);
    walkAccepted = Boolean((await state()).destination);
  }
  check('Mouse click selects a walk destination', walkAccepted, await state());
  await page.waitForTimeout(850);
  snapshot = await state();
  check('Mouse walking follows the selected path', Math.hypot(snapshot.position.x - walkStart.x, snapshot.position.z - walkStart.z) > 0.3, snapshot.position);
  await page.screenshot({ path: 'output/playwright/phase8-mouse-driving.png' });
  check('No browser errors', errors.length === 0, errors);
  return { results };
}
