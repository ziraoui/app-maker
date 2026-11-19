import { createFileRoute } from "@tanstack/react-router";
import {
  failure,
  json,
  noContent,
  readRecordBody,
  resolveStore,
} from "@/server/dataApi";
import { removeRecord, updateRecord } from "@/server/records";

// Public (everyapp.config.ts): one record in a published app's store.
export const Route = createFileRoute("/a/$slug/data/$collection/$record")({
  server: {
    handlers: {
      OPTIONS: () => noContent(),
      PUT: async ({ request, params }) => {
        const live = await resolveStore(params.slug, params.collection);
        if (live instanceof Response) return live;
        const body = await readRecordBody(request);
        if (body instanceof Response) return body;
        const record = await updateRecord(live.id, params.collection, params.record, body);
        return record ? json(record) : failure(404, "Not found");
      },
      DELETE: async ({ params }) => {
        const live = await resolveStore(params.slug, params.collection);
        if (live instanceof Response) return live;
        const removed = await removeRecord(live.id, params.collection, params.record);
        return removed ? noContent() : failure(404, "Not found");
      },
    },
  },
});
