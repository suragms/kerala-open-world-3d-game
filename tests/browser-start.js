async (page) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page
    .getByRole("button", { name: "Begin your journey", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.querySelector(".home-actions button").disabled,
  );
  await page.screenshot({ path: "output/playwright/01-home.png" });
  await page
    .getByRole("button", { name: "Begin your journey", exact: true })
    .click();
  if (
    !(await page
      .getByRole("button", { name: "Continue", exact: true })
      .isDisabled())
  )
    throw new Error("Character choice must be explicit");
  await page
    .getByRole("button", {
      name: "Male avatar Easygoing. Ready to explore.",
      exact: true,
    })
    .click();
  if (
    await page
      .getByRole("button", { name: "Continue", exact: true })
      .isDisabled()
  )
    throw new Error("Male selection did not enable continue");
  await page
    .getByRole("button", {
      name: "Female avatar Curious. Ready for the road.",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Top option 2", exact: true }).click();
  await page.getByLabel("Hairstyle", { exact: true }).selectOption("long");
  await page.screenshot({ path: "output/playwright/02-character.png" });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const options = await page
    .getByRole("combobox", { name: "Starting district", exact: true })
    .locator("option")
    .count();
  if (options !== 14) throw new Error("Missing districts: " + options);
  await page
    .getByRole("combobox", { name: "Starting district", exact: true })
    .selectOption("wayanad");
  await page
    .getByRole("combobox", { name: "Starting district", exact: true })
    .selectOption("thrissur");
  await page.screenshot({ path: "output/playwright/03-location-map.png" });
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.waitForFunction(() => window.__KOW__?.snapshot().chunks >= 20);
  await page.waitForTimeout(800);
  await page.screenshot({ path: "output/playwright/04-thrissur.png" });
  const result = {
    characterChoiceRequired: true,
    maleSelected: true,
    femaleSelected: true,
    customization: true,
    districtOptions: options,
    errors,
    diagnostics: await page.evaluate(() => window.__KOW__.diagnostics()),
    state: await page.evaluate(() => window.__KOW__.snapshot()),
  };
  if (errors.length) throw new Error(errors.join("\n"));
  return result;
}
