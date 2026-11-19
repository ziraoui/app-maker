import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeModel, createProject, send, publish } from "./fake-model.mjs";

const runtime = await startRuntime(fakeModel);
try {
  let page = await (await runtime.context("owner")).newPage();
  const id = await createProject(page, expect, "Plant watering", "Remind us which office plants need water.");
  await send(page, expect, "A list of plants with the day each was last watered.");
  await expect(page.getByTestId("current-version")).toHaveText("v1");
  const link = await publish(page, expect);
  const slug = new URL(link).pathname.split("/")[2];
  const added = await runtime.fetch(`/a/${slug}/data/plants`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Fiddle-leaf fig" }),
  });
  expect(added.status).toBe(201);

  await runtime.restart();

  page = await (await runtime.context("owner")).newPage();
  await page.goto("/");
  await expect(page.locator(`[data-testid="project-row"][data-id="${id}"]`)).toContainText("Plant watering");
  await page.goto(`/projects/${id}`);
  await expect(page.getByTestId("current-version")).toHaveText("v1");
  await expect(page.getByTestId("chat-message").first()).toContainText("A list of plants");
  await expect(page.getByTestId("version-row")).toHaveCount(1);
  await expect(page.getByTestId("publish-status")).toHaveText("Published");
  await expect(page.getByTestId("data-records")).toContainText("Fiddle-leaf fig");
  const live = await runtime.fetch(`/a/${slug}`);
  expect(live.status).toBe(200);
  expect(await live.text()).toContain("A list of plants");
  const listed = await (await runtime.fetch(`/a/${slug}/data/plants`)).json();
  expect(listed.records.map((r) => r.data.name)).toEqual(["Fiddle-leaf fig"]);
} finally {
  await runtime.close();
}
