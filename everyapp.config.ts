import { defineEveryApp } from "@every-app/sdk";

// defineEveryApp types the manifest. The Gateway keeps it; the Worker gets
// the bindings it lists (env.DB), never the file.
export default defineEveryApp({
  id: "app-maker",
  name: "App Maker",
  description:
    "Describe a small web app in plain words, watch it take shape, and publish it at a link anyone can open.",
  resources: {
    d1: ["DB"],
  },
  // Published apps and their data stores, opened by anyone with the link.
  // Each handler looks the slug up and answers 404 unless it is published.
  public: [
    { path: "/a/:slug", methods: ["GET"] },
    { path: "/a/:slug/data/:collection", methods: ["GET", "POST", "OPTIONS"] },
    {
      path: "/a/:slug/data/:collection/:record",
      methods: ["PUT", "DELETE", "OPTIONS"],
    },
  ],
  // The model that writes the apps, pinned to OpenRouter (src/server/ai.ts).
  // In an optional feature so the app opens without it; the chat says so.
  providers: [
    {
      id: "openrouter",
      why: "Writes and changes the apps people describe in the chat.",
      docs: "https://openrouter.ai/keys",
    },
  ],
  features: {
    builder: {
      name: "AI builder",
      why: "Turns chat messages into new versions of an app.",
      providers: ["openrouter"],
    },
  },
});
