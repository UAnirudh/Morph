import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

test("mobile layout exposes the compact navigation and keeps the canvas usable", async ({ page }) => {
  await demoLogin(page);
  await expect(page.getByRole("navigation", { name: "Workspace sections" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revenue command center" })).toBeVisible();
  // The desktop rail is rendered but hidden below the lg breakpoint.
  await expect(page.getByRole("navigation", { name: "Workspace", exact: true, includeHidden: true })).toBeHidden();

  await page.getByRole("link", { name: "Leads" }).first().click();
  await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
});
