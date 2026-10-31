async (page) => {
  const results = [];
  const check = (name, condition, detail) => {
    results.push({ name, passed: !!condition, detail });
    if (!condition) throw new Error(name + ": " + JSON.stringify(detail));
  };
  const state = () => page.evaluate(() => window.__KOW__.snapshot());
  const canvas = page.locator(".game-canvas canvas");
  await page.getByRole("button", {name: "Arrow keys", exact: true}).click();
  await canvas.focus();
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(3200);await page.keyboard.up('ArrowRight');await page.waitForTimeout(250);await page.keyboard.press('e');await page.waitForTimeout(200);
  check('Local guide dialogue', (await page.locator('.toast').innerText()).includes('Welcome to'));
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Return to arrival point',exact:false}).click();await page.waitForTimeout(200);await canvas.focus();
  const initial = await state();
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(900);
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(200);
  const walk = await state();
  check(
    "Arrow movement",
    Math.hypot(
      walk.position.x - initial.position.x,
      walk.position.z - initial.position.z,
    ) > 1,
    { from: initial.position, to: walk.position },
  );
  await page.keyboard.down("Shift");
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(550);
  const run = await state();
  await page.keyboard.up("ArrowDown");
  await page.keyboard.up("Shift");
  check("Run animation and speed", run.motion === "running", run.motion);
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");
  await page.waitForTimeout(180);
  const jump = await state();
  check("Jump leaves ground", jump.groundY > 0.15, jump.groundY);
  await page.waitForTimeout(800);
  check("Jump lands", (await state()).groundY === 0);
  // Re-enter the nearest vehicle using the actual interaction key.
  await page.keyboard.press("e");
  await page.waitForTimeout(300);
  let driving = await state();
  check("Vehicle entry", driving.driving, driving.near);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(1300);
  await page.keyboard.up("ArrowUp");
  driving = await state();
  check("Car acceleration", driving.speed > 8, driving.speed);
  const yaw = driving.yaw;
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(650);
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.up("ArrowUp");
  const steer = await state();
  check("Car steering", Math.abs(steer.yaw - yaw) > 0.02, {
    before: yaw,
    after: steer.yaw,
  });
  await page.keyboard.down("Space");
  await page.waitForTimeout(1300);
  await page.keyboard.up("Space");
  await page.keyboard.press("e");
  await page.waitForTimeout(350);
  check("Safe vehicle exit", !(await state()).driving);
  await page
    .getByRole("button", { name: "Mouse movement", exact: true })
    .click();
  await canvas.focus();
  let mouseWorked = false;
  const beforeMouse = await state();
  const box = await canvas.boundingBox();
  let afterMouse = beforeMouse;
  for (const [x, y] of [
    [0.5, 0.76],
    [0.43, 0.7],
    [0.57, 0.7],
    [0.5, 0.6],
  ]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(650);
    afterMouse = await state();
    if (
      Math.hypot(
        afterMouse.position.x - beforeMouse.position.x,
        afterMouse.position.z - beforeMouse.position.z,
      ) > 0.3
    ) {
      mouseWorked = true;
      break;
    }
  }
  check("Mouse click ground movement", mouseWorked, {
    from: beforeMouse.position,
    to: afterMouse.position,
    path: afterMouse.path.length,
  });
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  const save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kow.save.v2")),
  );
  check(
    "Save preserves avatar and region",
    save.version === 2 &&
      save.region === "thrissur" &&
      save.avatar.gender === "female",
    save,
  );
  await page.keyboard.press("m");
  check(
    "Map opens with key",
    await page
      .getByRole("heading", { name: "Your Kerala.", exact: true })
      .isVisible(),
  );
  await page
    .getByRole("textbox", { name: "Search places", exact: true })
    .fill("Calicut International");
  await page.waitForTimeout(200);
  check(
    "Karipur search returns Malappuram",
    (await page.locator(".search-results").innerText()).includes("Malappuram"),
  );
  await page
    .getByRole("button", { name: "Close world map", exact: true })
    .click();
  await canvas.focus();
  await page.keyboard.press("Escape");
  check(
    "Pause opens",
    await page
      .getByRole("heading", { name: "The world can wait.", exact: true })
      .isVisible(),
  );
  const pausedBefore = await state();
  await page.waitForTimeout(400);
  const pausedAfter = await state();
  check(
    "Pause stops simulation",
    pausedBefore.position.x === pausedAfter.position.x &&
      pausedBefore.position.z === pausedAfter.position.z,
  );
  await page
    .getByRole("button", { name: "Resume journey", exact: false })
    .click();
  await page.screenshot({ path: "output/playwright/phase8-suite/05-tested-controls.png" });
  return { results, performance: await state() };
}
