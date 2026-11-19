import { createFileRoute } from "@tanstack/react-router";
import { openPublished } from "@/server/publishing";
import { publishedPage, SANDBOX_HEADERS } from "@/lib/appPage";

// Public (everyapp.config.ts): anyone with the link opens the published
// version. It runs sandboxed in an opaque origin, so it can't reach the
// app's own pages, and calls only its own data store.
export const Route = createFileRoute("/a/$slug/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const html = await openPublished(params.slug);
        if (html === null) return new Response("Not found", { status: 404 });
        const dataUrl = new URL(`/a/${params.slug}/data`, request.url).href;
        return new Response(publishedPage(html, dataUrl), {
          headers: SANDBOX_HEADERS,
        });
      },
    },
  },
});
