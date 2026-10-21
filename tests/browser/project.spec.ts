import { test, expect } from "@playwright/test";

test("complete capture, draft recovery, source navigation, history, export, backup, and project lifecycle", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".project-list button").first()).toBeVisible();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "New project", exact: true })
    .click();
  await page.getByLabel("Project name").fill("Browser project");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser project", exact: true }),
  ).toBeVisible();
  const originalId = await page.evaluate(() =>
    localStorage.getItem("resume-project"),
  );
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await page.getByLabel("A little context").fill("A complete test project.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("A complete test project.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save my place", exact: true })
    .click();
  await page
    .getByLabel("What are you trying to achieve?", { exact: true })
    .fill("Finish the export.");
  await page
    .getByLabel("What moved forward?", { exact: true })
    .fill("Added the export button.");
  await page
    .getByLabel("What is still in the way?", { exact: true })
    .fill("The date column is missing.");
  await page
    .getByLabel("Your next idea", { exact: true })
    .fill("Add the date field to the mapping.");
  await page.getByLabel("Import source files").setInputFiles([
    {
      name: "extra.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("Completed: Imported source evidence."),
    },
    {
      name: "unused.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Unused text evidence."),
    },
  ]);
  await page.getByRole("checkbox").last().uncheck();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Save my place", exact: true })
    .click();
  await expect(page.getByLabel("Your next idea", { exact: true })).toHaveValue(
    "Add the date field to the mapping.",
  );
  await expect(page.getByText("extra.md", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await expect(page.getByRole("checkbox").last()).not.toBeChecked();
  await page
    .getByRole("button", { name: "Remove unused.txt", exact: true })
    .click();
  await expect(page.getByText("unused.txt", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create resume card", exact: true })
    .click();
  await expect(
    page.getByText("Your recorded idea", { exact: true }),
  ).toBeVisible();
  await page.locator(".next-step-sources button").click();
  await expect(page.locator(".highlighted-line")).toContainText(
    "Next idea: Add the date field",
  );
  await page
    .getByRole("button", { name: "Back to my card", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export card", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("resume-card.md");
  await page
    .getByRole("button", { name: "Let’s pick this up", exact: true })
    .click();
  await expect(
    page.getByText("You’re back in it.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^History/ }).click();
  await page.getByRole("button", { name: /Latest stopping point/ }).click();
  await page.reload();
  await expect(
    page.getByText("Your recorded idea", { exact: true }),
  ).toBeVisible();
  await page.locator(".model-status").click();
  const backupResponse = await page.request.get("/api/backup");
  const backup = await backupResponse.json();
  await page.getByLabel("Import backup file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page
    .getByRole("button", { name: "Restore copies", exact: true })
    .click();
  await expect(page.getByText(/Restored .* project/)).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove this card", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await expect(
    page.getByText("Your recorded idea", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove this card", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove card", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Give future you a head start." }),
  ).toBeVisible();
  await page.locator(".model-status").click();
  await page
    .getByRole("button", { name: "Remove project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove project", exact: true })
    .click();
  const projects = await page.request
    .get("/api/projects")
    .then((response) => response.json());
  expect(
    projects.some((project: { id: string }) => project.id === originalId),
  ).toBe(false);
  expect(
    projects.filter(
      (project: { name: string }) => project.name === "Browser project",
    ),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("generation cancellation keeps drafts and allows another capture", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".project-list button")
    .filter({ hasText: "Weekend Atlas" })
    .first()
    .click();
  await expect(page.locator(".resume-card")).toBeVisible();
  await page
    .getByRole("button", { name: "Save my place", exact: true })
    .click();
  await page
    .getByLabel("What moved forward?", { exact: true })
    .fill("Preserved the draft.");
  await page
    .getByRole("button", { name: "Create resume card", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel generation", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Generation cancelled");
  await expect(
    page.getByLabel("What moved forward?", { exact: true }),
  ).toHaveValue("Preserved the draft.");
  await page
    .getByRole("button", { name: "Create resume card", exact: true })
    .click();
  await expect(
    page.getByText("Your recorded idea", { exact: true }),
  ).toBeVisible();
});

test("mobile navigation, questions, and scrollable capture remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .locator(".project-list button")
    .filter({ hasText: "Weekend Atlas" })
    .first()
    .click();
  await expect(page.locator(".resume-card")).toBeVisible();
  await expect(page.locator(".question-box")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save my place", exact: true })
    .click();
  await page
    .getByLabel("Your next idea", { exact: true })
    .fill("Check the mobile layout.");
  await page
    .getByRole("button", { name: "Create resume card", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Create resume card", exact: true }),
  ).toBeVisible();
  while (await page.locator(".source-selection-row > .icon-button").count())
    await page.locator(".source-selection-row > .icon-button").first().click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Save my place", exact: true })
    .click();
  await expect(page.locator(".source-selection-row")).toHaveCount(0);
});
