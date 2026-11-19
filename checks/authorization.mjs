import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeModel, createProject, send, publish } from "./fake-model.mjs";

const json = (body) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const runtime = await startRuntime(fakeModel);
try {
  // Private pages: anonymous and outsider refused, members admitted.
  await runtime.assertPrivateAccess(["/"]);

  // The owner (an org admin) builds and publishes a project.
  const ownerPage = await (await runtime.context("owner")).newPage();
  const ownerId = await createProject(ownerPage, expect, "Team lunch picker", "Pick where the team eats on Fridays.");
  await send(ownerPage, expect, "A list of lunch spots with a random pick button.");
  await expect(ownerPage.getByTestId("current-version")).toHaveText("v1");
  const ownerLink = await publish(ownerPage, expect);
  const ownerSlug = new URL(ownerLink).pathname.split("/")[2];

  // A member builds their own.
  const memberPage = await (await runtime.context("member")).newPage();
  const memberId = await createProject(memberPage, expect, "Gym log", "Track my lifts each week.");
  await send(memberPage, expect, "A table of lifts with weight and reps.");
  const memberLink = await publish(memberPage, expect);
  const memberSlug = new URL(memberLink).pathname.split("/")[2];

  // Projects belong to their creator only: neither sees the other's, admin included.
  await memberPage.goto("/");
  await expect(memberPage.getByTestId("project-row")).toHaveCount(1);
  await expect(memberPage.getByText("Team lunch picker")).toHaveCount(0);
  await memberPage.goto(`/projects/${ownerId}`);
  await expect(memberPage.getByTestId("project-not-found")).toBeVisible();
  await expect(memberPage.getByText("Team lunch picker")).toHaveCount(0);
  await ownerPage.goto(`/projects/${memberId}`);
  await expect(ownerPage.getByTestId("project-not-found")).toBeVisible();
  await ownerPage.goto("/");
  await expect(ownerPage.getByTestId("project-row")).toHaveCount(1);

  // Full-size versions are the owner's only.
  expect((await runtime.fetch(`/projects/${ownerId}/versions/1/view`, { role: "owner" })).status).toBe(200);
  expect((await runtime.fetch(`/projects/${ownerId}/versions/1/view`, { role: "member" })).status).toBe(404);
  for (const role of [undefined, "outsider"]) {
    const refused = await runtime.fetch(`/projects/${ownerId}/versions/1/view`, role ? { role } : {});
    expect(refused.status).not.toBe(200);
    expect(await refused.text()).not.toContain("lunch");
    const project = await runtime.fetch(`/projects/${ownerId}`, role ? { role } : {});
    expect(project.status).not.toBe(200);
  }

  // Public routes: the published page and its data, nothing more.
  const live = await runtime.fetch(`/a/${ownerSlug}`);
  expect(live.status).toBe(200);
  const html = await live.text();
  expect(html).not.toContain("Team lunch picker");
  expect(html).not.toContain(ownerId);
  expect(live.headers.get("content-security-policy")).toContain("sandbox");
  expect((await runtime.fetch(`/a/nope1234`)).status).toBe(404);
  expect((await runtime.fetch(`/a/nope1234/data/x`)).status).toBe(404);

  // Each app's store is its own.
  const a = await runtime.fetch(`/a/${ownerSlug}/data/spots`, { method: "POST", ...json({ name: "Noodle bar" }) });
  expect(a.status).toBe(201);
  const rec = await a.json();
  expect((await (await runtime.fetch(`/a/${memberSlug}/data/spots`)).json()).records).toEqual([]);
  expect((await runtime.fetch(`/a/${memberSlug}/data/spots/${rec.id}`, { method: "DELETE" })).status).toBe(404);
  expect((await runtime.fetch(`/a/${memberSlug}/data/spots/${rec.id}`, { method: "PUT", ...json({ name: "x" }) })).status).toBe(404);
  expect((await (await runtime.fetch(`/a/${ownerSlug}/data/spots`)).json()).records).toHaveLength(1);

  // The member can't see or clear the owner's stored records through a page.
  await memberPage.goto(`/projects/${ownerId}`);
  await expect(memberPage.getByText("Noodle bar")).toHaveCount(0);

  // Published only: drafts have no public link.
  const draftId = await createProject(memberPage, expect, "Draft only", "Not ready yet.");
  expect(draftId).toBeTruthy();
  await expect(memberPage.getByTestId("public-link")).toHaveCount(0);

  // No sign-in of its own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/register", "/logout"]) {
    for (const role of [undefined, "member"]) {
      const res = await runtime.fetch(path, role ? { role } : {});
      const text = await res.text();
      expect(text).not.toMatch(/type=["']?password/i);
      if (role) expect(res.status).toBe(404);
    }
  }
  const home = await runtime.fetch("/", { role: "member" });
  expect(await home.text()).not.toMatch(/type=["']?password/i);
} finally {
  await runtime.close();
}
