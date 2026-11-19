// A local stand-in for the Gateway's AI route, used only by these checks. It
// answers chat completions the way a model would: a short reply and one
// complete HTML file in a fenced block. A request mentioning "blank" gets an
// empty answer, so the checks can see a failed generation.
const SCRIPT = `
const PAGE = (note) => \`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reading list</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f1e8;color:#26221c}main{max-width:560px;margin:0 auto;padding:28px 20px}
h1{margin:0 0 4px;font-size:28px}p{margin:0 0 16px;color:#6b6257}form{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
input{flex:1 1 140px;padding:10px;border:1px solid #d8cfbf;border-radius:8px;font:inherit}button{padding:10px 16px;border:0;border-radius:8px;background:#3d6b52;color:#fff;font:inherit}
ul{list-style:none;padding:0;margin:0}li{background:#fff;margin:0 0 8px;padding:12px 14px;border-radius:10px;box-shadow:0 1px 2px #0001}li span{color:#8a8072}</style></head>
<body><main><h1 data-testid="app-title">Reading list</h1><p data-testid="app-note">\${note}</p>
<form id="f"><input id="t" placeholder="Book title" aria-label="Book title"><input id="a" placeholder="Author" aria-label="Author"><button>Add book</button></form>
<ul id="l" data-testid="app-books"></ul></main>
<script>
async function load(){const rows=await appData.list('books');const l=document.getElementById('l');l.innerHTML='';
for(const r of rows){const li=document.createElement('li');li.textContent=r.data.title+' ';const s=document.createElement('span');s.textContent=r.data.author||'';li.append(s);l.append(li);}}
document.getElementById('f').onsubmit=async(e)=>{e.preventDefault();const t=document.getElementById('t'),a=document.getElementById('a');
if(!t.value)return;await appData.add('books',{title:t.value,author:a.value});t.value='';a.value='';load();};load();
<\\/script></body></html>\`;
export default { async fetch(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !url.pathname.endsWith('/chat/completions')) return new Response('not found', { status: 404 });
  const body = await request.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return Response.json({ error: { message: 'messages is required' } }, { status: 400 });
  const text = String(last.content);
  const ask = text.trim().split('\\n').pop().trim();
  const informed = messages.some((m) => m.role === 'system' && String(m.content).includes('appData'));
  const content = /blank/i.test(ask) || !informed ? '' : 'Done: ' + ask + '\\n\\n\\u0060\\u0060\\u0060html\\n' + PAGE(ask.replace(/[<>&]/g, '')) + '\\n\\u0060\\u0060\\u0060';
  return Response.json({ id: 'local', object: 'chat.completion', model: body.model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] });
} };`;

export const fakeModel = {
  bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-model" } },
  workers: [{ config: { name: "fake-model", compatibilityDate: "2025-01-01",
    manifest: { mainModule: "fake.mjs", modules: { "fake.mjs": { type: "esm", contents: SCRIPT } } } } }],
};

/** Creates a project from the list page and returns its id. */
export async function createProject(page, expect, name, description) {
  await page.goto("/");
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-name").fill(name);
  await page.getByTestId("project-description").fill(description);
  await Promise.all([page.waitForURL(/\/projects\/[^/]+$/), page.getByTestId("create-project").click()]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return new URL(page.url()).pathname.split("/").pop();
}

/** Sends one chat message and waits for the answer (a new version or an error). */
export async function send(page, expect, text) {
  const count = await page.getByTestId("chat-message").count();
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("chat-message").nth(count)).toContainText(text);
  await expect(page.getByTestId("chat-send")).toBeEnabled({ timeout: 20000 });
}

/** Publishes the current version and returns the public link. */
export async function publish(page, expect) {
  await page.getByTestId("publish-button").click();
  const link = page.getByTestId("public-link");
  await expect(link).toBeVisible();
  return link.getAttribute("href");
}
