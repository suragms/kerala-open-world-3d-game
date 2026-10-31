async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const regions = await page.evaluate(
    async () => await (await fetch("/data/regions.json")).json(),
  );
  const results = [];
  for (const region of regions) {
    await page
      .getByRole("button", { name: "Open world map", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: `Select ${region.name}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Explore this location", exact: true })
      .click();
    await page.waitForFunction(
      (id) => window.__KOW__?.diagnostics().region === id,
      region.id,
    );
    await page.waitForTimeout(650);
    const state = await page.evaluate(() => window.__KOW__.snapshot());
    const diag = await page.evaluate(() => window.__KOW__.diagnostics());
    if (!Number.isFinite(state.position.x) || diag.roads < 1 || diag.blocked)
      throw new Error(`Invalid world in ${region.id}`);
    const canvas=page.locator('.game-canvas canvas');await canvas.focus();
    let moved=false;
    for(const key of ['ArrowRight','ArrowLeft','ArrowDown']){
      const from=await page.evaluate(()=>window.__KOW__.snapshot().position);
      await page.keyboard.down(key);await page.waitForTimeout(350);await page.keyboard.up(key);await page.waitForTimeout(120);
      const after=await page.evaluate(()=>window.__KOW__.snapshot().position);
      if(await page.evaluate(()=>window.__KOW__.diagnostics().blocked))throw new Error(`Movement entered an obstacle in ${region.id}`);
      moved ||= Math.hypot(after.x-from.x,after.z-from.z)>.25;if(moved)break;
    }
    if(!moved)throw new Error(`No tested keyboard direction moved in ${region.id}`);
    await page.screenshot({
      path: `output/playwright/phase8-suite/district-${region.id}.png`,
    });
    results.push({
      district: region.id,
      roads: diag.roads,
      features: diag.features,
      fps: state.fps,
      chunks: state.chunks,
      traffic: state.traffic,
      pedestrians: state.pedestrians,
      position: state.position,
      moved,
    });
  }
  return { districts: results, errors };
}
