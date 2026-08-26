import { accountForToken, recordWebhookResult } from "$lib/server/accounts";
import { restoreSession } from "$lib/server/oauth/client";
import { writeRecording } from "$lib/server/spaces";
import { parseRingWebhook, WebhookParseError } from "$lib/server/webhook";
import { error, text } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, request }) => {
  const match = accountForToken(params.token);
  if (!match) error(404, "Not found");
  const { account, hook } = match;
  const visibility = hook === "public" ? "public" : "private";

  let webhook;
  try {
    webhook = await parseRingWebhook(request);
  } catch (cause) {
    if (cause instanceof WebhookParseError) {
      recordWebhookResult(account.did, `error: ${cause.message}`);
      error(400, cause.message);
    }
    throw cause;
  }

  if (webhook.test) {
    recordWebhookResult(account.did, `test (${visibility})`);
    return text("OK");
  }

  if (visibility === "private" && account.spaces_supported === 0) {
    recordWebhookResult(account.did, "error: this account's PDS does not support spaces");
    error(500, "This account's PDS does not support spaces");
  }

  try {
    const session = await restoreSession(account.did);
    const { duplicate } = await writeRecording(session, webhook, visibility);
    recordWebhookResult(
      account.did,
      duplicate ? `ok (${visibility}, duplicate)` : `ok (${visibility})`,
    );
  } catch (cause) {
    console.error("Webhook delivery failed", cause);
    const message = cause instanceof Error ? cause.message : String(cause);
    recordWebhookResult(account.did, `error: ${message}`);
    // A 5xx makes the Pebble app retry alongside the next recording.
    error(500, "Could not store the recording");
  }

  return text("OK");
};
