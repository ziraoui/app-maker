import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ownedProject, versionHtml } from "@/server/projects";
import { previewPage, SANDBOX_HEADERS } from "@/lib/appPage";

// A version full-size, for its owner only, sandboxed like the preview.
export const Route = createFileRoute("/projects/$projectId/versions/$number/view")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const number = Number(params.number);
        const project = Number.isInteger(number)
          ? await ownedProject(user.id, params.projectId)
          : null;
        const html = project ? await versionHtml(project.id, number) : null;
        if (html === null) return new Response("Not found", { status: 404 });
        return new Response(previewPage(html), { headers: SANDBOX_HEADERS });
      },
    },
  },
});
