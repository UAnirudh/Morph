import type { Page } from "@playwright/test";

export async function demoLogin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Enter the seeded demo workspace/i }).click();
  await page.waitForURL("**/studio");
}

export async function askMorph(page: Page, prompt: string) {
  const input = page.getByLabel("Instruction for Morph");
  await input.fill(prompt);
  await page.getByLabel("Send instruction").click();
}
