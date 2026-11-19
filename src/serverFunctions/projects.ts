import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { modelStatus } from "@/server/ai";
import { sendMessage, sendMessageInput } from "@/server/chat";
import * as projects from "@/server/projects";
import { publishProject, unpublishProject } from "@/server/publishing";
import { clearRecords, storeOverview } from "@/server/records";
import { rememberUser } from "@/server/users";

// Every function runs behind ensureUserMiddleware: `context.user` is the
// member the Gateway signed in, and every query takes their id. Projects are
// their creator's alone, admins included.

function notFound(): never {
  throw new Error("That project doesn't exist or isn't yours.");
}

export const getProjects = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
  await rememberUser(user);
  return projects.listProjects(user.id);
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.createProjectInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await rememberUser(user);
    return projects.createProject(user.id, data);
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.renameProjectInput.parse(data))
  .handler(
    async ({ data, context: { user } }) =>
      (await projects.renameProject(user.id, data)) ?? notFound(),
  );

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(
    async ({ data, context: { user } }) =>
      (await projects.deleteProject(user.id, data.id)) ?? notFound(),
  );

/** The project page, or null when it isn't this member's. */
export const getProject = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const detail = await projects.projectDetail(user.id, data.id);
    if (!detail) return null;
    const origin = new URL(getRequest().url).origin;
    return {
      ...detail,
      publicUrl: detail.slug ? `${origin}/a/${detail.slug}` : null,
      store: await storeOverview(detail.id),
    };
  });

export const getModelStatus = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(() => modelStatus());

export const getVersionHtml = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.versionInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const project = await projects.ownedProject(user.id, data.id);
    if (!project) notFound();
    return { html: await projects.versionHtml(project.id, data.number) };
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => sendMessageInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const result = await sendMessage(user.id, data);
    if (result.status === "missing") notFound();
    return result;
  });

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.versionInput.parse(data))
  .handler(
    async ({ data, context: { user } }) =>
      (await projects.restoreVersion(user.id, data)) ?? notFound(),
  );

export const publish = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(
    async ({ data, context: { user } }) =>
      (await publishProject(user.id, data.id)) ?? notFound(),
  );

export const unpublish = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(
    async ({ data, context: { user } }) =>
      (await unpublishProject(user.id, data.id)) ?? notFound(),
  );

export const clearStore = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const project = await projects.ownedProject(user.id, data.id);
    if (!project) notFound();
    await clearRecords(project.id);
    return { ok: true };
  });
