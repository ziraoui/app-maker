import { createFileRoute } from "@tanstack/react-router";
import {
  failure,
  json,
  noContent,
  readRecordBody,
  resolveStore,
} from "@/server/dataApi";
import { addRecord, listRecords } from "@/server/records";

// Public (everyapp.config.ts): a published app's data store. The slug picks
// the app; nothing here reaches another app's records.
export const Route = createFileRoute("/a/$slug/data/$collection/")({
  server: {
    handlers: {
      OPTIONS: () => noContent(),
      GET: async ({ params }) => {
        const live = await resolveStore(params.slug, params.collection);
        if (live instanceof Response) return live;
        return json({ records: await listRecords(live.id, params.collection) });
      },
      POST: async ({ request, params }) => {
        const live = await resolveStore(params.slug, params.collection);
        if (live instanceof Response) return live;
        const body = await readRecordBody(request);
        if (body instanceof Response) return body;
        const record = await addRecord(live.id, params.collection, body);
        if (!record) return failure(507, "This app's store is full (1000 records).");
        return json(record, 201);
      },
    },
  },
});
