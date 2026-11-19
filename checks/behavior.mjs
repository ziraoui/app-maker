import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeModel, createProject, send, publish } from "./fake-model.mjs";

const json = (body) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let runtime = await startRuntime(fakeModel);
try {
  await runtime.assertPrivateAccess(["/"]);
  const host = runtime.hostname;
  const page = await (await runtime.context("owner")).newPage();

  // F001: an empty list, then a project.
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByTestId("projects-empty")).toBeVisible();
  const id = await createProject(page, expect, "Book club shelf", "A shared reading list for our book club.");
  // The opening description is ready to send as the first message.
  await expect(page.getByTestId("chat-input")).toHaveValue("A shared reading list for our book club.");
  await expect(page.getByTestId("preview-empty")).toBeVisible();

  // F002 + F003: a message makes version 1, shown in the sandboxed preview.
  await send(page, expect, "A reading list where we add books with their author.");
  await expect(page.getByTestId("chat-message").nth(1)).toContainText("Done");
  await expect(page.getByTestId("current-version")).toHaveText("v1");
  const frame = page.getByTestId("preview-frame");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups");
  await expect(frame.contentFrame().getByTestId("app-title")).toHaveText("Reading list");
  await expect(frame.contentFrame().getByTestId("app-note")).toHaveText("A reading list where we add books with their author.");
  // The preview's own data works inside the frame.
  await frame.contentFrame().getByLabel("Book title").fill("Middlemarch");
  await frame.contentFrame().getByRole("button", { name: "Add book" }).click();
  await expect(frame.contentFrame().getByTestId("app-books")).toContainText("Middlemarch");

  // Phone and desktop widths.
  await page.getByTestId("preview-phone").click();
  await expect.poll(async () => (await frame.boundingBox()).width).toBeLessThan(420);
  await page.getByTestId("preview-desktop").click();
  await expect.poll(async () => (await frame.boundingBox()).width).toBeGreaterThan(420);

  // Full size, sandboxed, member-only.
  const full = await page.getByTestId("preview-open").getAttribute("href");
  expect(full).toBe(`/projects/${id}/versions/1/view`);
  const view = await runtime.fetch(full, { role: "owner" });
  expect(view.status).toBe(200);
  expect(view.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
  expect(await view.text()).toContain("Reading list");

  // A failed generation keeps the current version and says so.
  await send(page, expect, "Leave it blank");
  await expect(page.getByTestId("chat-error")).toBeVisible();
  await expect(page.getByTestId("current-version")).toHaveText("v1");

  await send(page, expect, "Put finished books at the bottom of the list.");
  await expect(page.getByTestId("current-version")).toHaveText("v2");
  await expect(frame.contentFrame().getByTestId("app-note")).toHaveText("Put finished books at the bottom of the list.");

  // F004: versions, preview an old one, restore it as a new version.
  await expect(page.getByTestId("version-row")).toHaveCount(2);
  await page.locator('[data-testid="version-row"][data-number="1"]').getByTestId("version-preview").click();
  await expect(frame.contentFrame().getByTestId("app-note")).toHaveText("A reading list where we add books with their author.");
  await expect(page.getByTestId("previewing-old")).toBeVisible();
  await page.locator('[data-testid="version-row"][data-number="1"]').getByTestId("version-restore").click();
  await expect(page.getByTestId("current-version")).toHaveText("v3");
  await expect(page.getByTestId("version-row")).toHaveCount(3);
  await expect(page.locator('[data-testid="version-row"][data-number="3"]')).toContainText("v1");
  await expect(frame.contentFrame().getByTestId("app-note")).toHaveText("A reading list where we add books with their author.");

  // F005: nothing is public before publishing.
  await expect(page.getByTestId("publish-status")).toHaveText("Draft");
  const link = await publish(page, expect);
  const slug = new URL(link).pathname.split("/")[2];
  expect(new URL(link).host).toBe(host);
  expect(new URL(link).pathname).toBe(`/a/${slug}`);
  await expect(page.getByTestId("publish-status")).toHaveText("Published");
  let live = await runtime.fetch(`/a/${slug}`);
  expect(live.status).toBe(200);
  expect(live.headers.get("content-security-policy")).toContain("sandbox");
  let body = await live.text();
  expect(body).toContain("A reading list where we add books with their author.");

  // Later edits wait for the next publish.
  await send(page, expect, "Add a star rating to each book.");
  await expect(page.getByTestId("current-version")).toHaveText("v4");
  await expect(page.getByTestId("publish-changes")).toBeVisible();
  expect(await (await runtime.fetch(`/a/${slug}`)).text()).not.toContain("star rating");
  await page.getByTestId("publish-changes").click();
  await expect(page.getByTestId("publish-changes")).toHaveCount(0);
  expect(await (await runtime.fetch(`/a/${slug}`)).text()).toContain("star rating");

  // The data API, as an anonymous visitor's page would call it.
  const base = `/a/${slug}/data/books`;
  const added = await runtime.fetch(base, { method: "POST", ...json({ title: "Piranesi", author: "Susanna Clarke" }) });
  expect(added.status).toBe(201);
  const record = await added.json();
  expect(record.data.title).toBe("Piranesi");
  const put = await runtime.fetch(`${base}/${record.id}`, { method: "PUT", ...json({ title: "Piranesi", author: "S. Clarke" }) });
  expect(put.status).toBe(200);
  expect((await put.json()).data.author).toBe("S. Clarke");
  const extra = await (await runtime.fetch(base, { method: "POST", ...json({ title: "Temp" }) })).json();
  expect((await runtime.fetch(`${base}/${extra.id}`, { method: "DELETE" })).status).toBe(204);
  const listed = await (await runtime.fetch(base)).json();
  expect(listed.records.map((r) => r.data.title)).toEqual(["Piranesi"]);
  expect((await runtime.fetch(`/a/${slug}/data/bad%20name`)).status).toBe(400);
  expect((await runtime.fetch(base, { method: "POST", ...json({ blob: "x".repeat(70000) }) })).status).toBe(413);
  expect((await runtime.fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: "not json" })).status).toBe(400);

  // A visitor uses the live app, and its data lands in the store.
  const visitor = await (await runtime.context(null)).newPage();
  await visitor.goto(`/a/${slug}`);
  await expect(visitor.getByTestId("app-books")).toContainText("Piranesi");
  await visitor.getByLabel("Book title").fill("The Remains of the Day");
  await visitor.getByLabel("Author").fill("Kazuo Ishiguro");
  await visitor.getByRole("button", { name: "Add book" }).click();
  await expect(visitor.getByTestId("app-books")).toContainText("The Remains of the Day");

  // The owner sees the records and the visit count, and can clear them.
  await page.reload();
  await expect(page.getByTestId("visit-count")).toContainText(/[3-9] visits/);
  await expect(page.getByTestId("data-collection")).toContainText("books");
  await expect(page.getByTestId("data-record")).toHaveCount(2);
  await expect(page.getByTestId("data-records")).toContainText("Kazuo Ishiguro");
  await page.getByTestId("clear-data").click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByTestId("data-empty")).toBeVisible();
  expect((await (await runtime.fetch(base)).json()).records).toEqual([]);

  // Unpublish takes the link down; publishing again brings it back.
  await page.getByTestId("unpublish-button").click();
  await expect(page.getByTestId("publish-status")).toHaveText("Draft");
  expect((await runtime.fetch(`/a/${slug}`)).status).toBe(404);
  expect((await runtime.fetch(base)).status).toBe(404);
  expect(await publish(page, expect)).toBe(link);

  // F001: the list, rename, delete (which takes the link down).
  const other = await createProject(page, expect, "Scratch", "A throwaway page.");
  await send(page, expect, "A page that says hello.");
  const otherLink = await publish(page, expect);
  expect((await runtime.fetch(`${new URL(otherLink).pathname}/data/notes`, { method: "POST", ...json({ text: "hi" }) })).status).toBe(201);
  await page.goto("/");
  await expect(page.getByTestId("project-row")).toHaveCount(2);
  const row = page.locator(`[data-testid="project-row"][data-id="${id}"]`);
  await expect(row.getByTestId("project-status")).toHaveText("Published");
  await row.getByTestId("project-actions").click();
  await page.getByTestId("rename-project").click();
  await page.getByTestId("rename-input").fill("Book club reading list");
  await page.getByTestId("rename-save").click();
  await expect(row).toContainText("Book club reading list");
  const otherRow = page.locator(`[data-testid="project-row"][data-id="${other}"]`);
  await otherRow.getByTestId("project-actions").click();
  await page.getByTestId("delete-project").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByTestId("project-row")).toHaveCount(1);
  expect((await runtime.fetch(new URL(otherLink).pathname)).status).toBe(404);
  const db = await runtime.database();
  for (const table of ["messages", "versions", "records", "projects"]) {
    const column = table === "projects" ? "id" : "project_id";
    const { results } = await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`).bind(other).all();
    expect(results[0].n, table).toBe(0);
  }

  // Phone-sized smoke.
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await expect(phone.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(phone.getByTestId("new-project")).toBeVisible();

  // The journey's result, for the app's picture.
  await page.goto(`/projects/${id}`);
  await expect(page.getByTestId("current-version")).toHaveText("v4");
  const shown = page.getByTestId("preview-frame").contentFrame();
  await expect(shown.getByTestId("app-title")).toHaveText("Reading list");
  for (const [title, author] of [["Middlemarch", "George Eliot"], ["Piranesi", "Susanna Clarke"], ["The Remains of the Day", "Kazuo Ishiguro"]]) {
    await shown.getByLabel("Book title").fill(title);
    await shown.getByLabel("Author").fill(author);
    await shown.getByRole("button", { name: "Add book" }).click();
    await expect(shown.getByTestId("app-books")).toContainText(title);
  }
  await runtime.screenshot(page);
} finally {
  await runtime.close();
}

// F002 with no model set up: the chat says so and is disabled.
runtime = await startRuntime();
try {
  const page = await (await runtime.context("owner")).newPage();
  await createProject(page, expect, "Recipe box", "Keep our family recipes in one place.");
  await expect(page.getByTestId("ai-off")).toBeVisible();
  await expect(page.getByTestId("chat-input")).toBeDisabled();
  await expect(page.getByTestId("chat-send")).toBeDisabled();
} finally {
  await runtime.close();
}
