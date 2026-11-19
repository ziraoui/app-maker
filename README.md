# App Maker

Describe a small web app in plain words and an AI model writes it as a single page you can try right away. Keep chatting to change it, then publish it at a link anyone can open, with a built-in place for it to store data.

Inspired by https://whacka.app

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create, rename and delete your own app projects, each with a name and a one-sentence description.
- Chat to build: each message produces a new complete version of the app.
- Try the current version in a sandboxed preview at desktop or phone width, or open it full size.
- Browse every version, preview an older one and restore it.
- Publish to a short public link, unpublish, and see visits and the records the published app has stored.

Left out: accounts and sign-in, which your Gateway handles; native and installable apps; custom domains; credits and plans; payments, email and AI inside generated apps; building from outside chat apps; templates and galleries.

## Setup

1. `pnpm install`
2. `pnpm dev` to run it locally; `pnpm test` for the unit tests. The checks in `checks/` run against a packaged release.
3. `pnpm run deploy` to deploy behind your Gateway. The database is created and migrated by the deploy.
4. Optional, for the AI builder: add an OpenRouter key to the Gateway with `everyapp provider add openrouter` ([get a key](https://openrouter.ai/keys)). Without it the app opens, and the chat says it isn't set up.

There are no secrets or settings of the app's own.

## Limitations

- Building uses `anthropic/claude-sonnet-4.5` on OpenRouter; each message is billed to your OpenRouter account.
- Data saved in the preview stays in the preview frame and is gone when it reloads; only published apps store data.
- Anyone with a published link can read and change that app's stored data. Each app holds at most 1,000 records of 64 KB each.
- Published apps have no sign-in of their own.
