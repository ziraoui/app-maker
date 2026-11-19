import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
  refusalFromError,
} from "@every-app/sdk/server";
import { env } from "cloudflare:workers";

/** The model that writes the apps, through OpenRouter. */
const MODEL = "anthropic/claude-sonnet-4.5";
const ENDPOINT = `${aiBaseUrl("openrouter")}/chat/completions`;

export type ModelAnswer =
  | { kind: "ok"; content: string }
  | { kind: "off"; setup: string | null }
  | { kind: "error"; message: string };

const isOff = (code: string) => code.endsWith("_not_configured");

async function post(body: object): Promise<Response | ModelAnswer> {
  try {
    const fetcher = createGatewayFetch({ env });
    const response = await fetcher(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const refusal = await gatewayRefusal(response);
    if (refusal) {
      return isOff(refusal.code)
        ? { kind: "off", setup: refusal.setup ?? null }
        : { kind: "error", message: refusal.message || refusal.code };
    }
    return response;
  } catch (error) {
    const refusal = refusalFromError(error);
    if (refusal && isOff(refusal.code))
      return { kind: "off", setup: refusal.setup ?? null };
    return {
      kind: "error",
      message: refusal?.message ?? "The model couldn't be reached.",
    };
  }
}

/**
 * Whether the model is set up. An empty request is refused by the Gateway
 * when no key is set, and by the provider (at no cost) when one is.
 */
export async function modelStatus(): Promise<{
  on: boolean;
  setup: string | null;
}> {
  const answer = await post({ model: MODEL, messages: [], max_tokens: 1 });
  if (answer instanceof Response) {
    await answer.body?.cancel();
    return { on: true, setup: null };
  }
  return answer.kind === "off"
    ? { on: false, setup: answer.setup }
    : { on: true, setup: null };
}

export async function complete(
  messages: { role: string; content: string }[],
): Promise<ModelAnswer> {
  const answer = await post({ model: MODEL, messages, max_tokens: 32000 });
  if (!(answer instanceof Response)) return answer;
  if (!answer.ok) {
    await answer.body?.cancel();
    return {
      kind: "error",
      message: `The model answered with an error (${answer.status}).`,
    };
  }
  const json = (await answer.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const content = json?.choices?.[0]?.message?.content;
  return { kind: "ok", content: typeof content === "string" ? content : "" };
}
