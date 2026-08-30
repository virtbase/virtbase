/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { CreateEmailResponse } from "resend";
import { EmailDeliveryError, sendBatchEmail, sendEmail } from "../index";

/**
 * The provider is stubbed at `fetch`, not at a module boundary.
 *
 * Deliberately: the bug guarded against here lives in the Resend SDK's
 * contract rather than in our call to it. Its `fetchRequest` never throws - a
 * revoked key, an unverified sending domain and a dead socket all come back
 * as `{ data: null, error }` and resolve - so a stub that only saw our
 * arguments could not reproduce it. Going through the real SDK does, and no
 * request leaves the process.
 */
interface ProviderCall {
  url: string;
  /** The JSON body: an object for a single send, an array for a batch. */
  body: unknown;
}

const calls: ProviderCall[] = [];
let respond: () => Response;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const OWNED_ENV = [
  "RESEND_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "NODE_ENV",
] as const;

const savedEnv = new Map<string, string | undefined>();
const realFetch = globalThis.fetch;

/** Avoids the `delete` operator, which the lint configuration forbids. */
const unset = (key: string): void => {
  Reflect.deleteProperty(process.env, key);
};

const sentBody = (index = 0): Record<string, unknown> =>
  (calls[index]?.body ?? {}) as Record<string, unknown>;

const sentBatch = (index = 0): Record<string, unknown>[] =>
  (calls[index]?.body ?? []) as Record<string, unknown>[];

beforeEach(() => {
  calls.length = 0;
  respond = () => json(200, { id: "email_1" });

  for (const key of OWNED_ENV) savedEnv.set(key, process.env[key]);
  for (const key of OWNED_ENV) unset(key);

  process.env.RESEND_API_KEY = "re_not_a_real_credential";

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "null")) as unknown,
    });
    return respond();
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of savedEnv) {
    if (undefined === value) unset(key);
    else process.env[key] = value;
  }
  savedEnv.clear();
});

const message = {
  to: "customer@example.com",
  subject: "Your servers are locked",
  text: "Please answer the abuse notice.",
};

describe("sendEmail", () => {
  test("a refusal from the provider is a failure, not a delivery", async () => {
    // The regression. Resend answers an unverified sending domain with a 403
    // and a JSON body; the SDK turns that into `{ data: null, error }` and
    // resolves. Swallowing it recorded the message as delivered, which is
    // what the abuse desk reads as "the customer was told" before it starts
    // their response clock.
    respond = () =>
      json(403, {
        name: "validation_error",
        message: "The virtbase.com domain is not verified.",
      });

    await expect(sendEmail(message)).rejects.toThrow(EmailDeliveryError);
    await expect(sendEmail(message)).rejects.toThrow(/domain is not verified/);
  });

  test("so is a network failure", async () => {
    // The SDK catches this one itself and reports `application_error`, so it
    // arrives looking exactly like a refusal rather than a throw.
    respond = () => {
      throw new Error("ECONNREFUSED");
    };

    await expect(sendEmail(message)).rejects.toThrow(EmailDeliveryError);
  });

  test("an accepted send resolves with the provider's response", async () => {
    const result = (await sendEmail(message)) as CreateEmailResponse;

    expect(calls).toHaveLength(1);
    expect(result.data).toEqual({ id: "email_1" });
    expect(result.error).toBeNull();
  });

  test("no configured provider is a failure", async () => {
    unset("RESEND_API_KEY");

    await expect(sendEmail(message)).rejects.toThrow(EmailDeliveryError);
    expect(calls).toHaveLength(0);
  });

  test("half-configured SMTP is no provider at all", async () => {
    // Host and port without credentials used to count as configured, and the
    // transport then logged and returned - a second silent discard behind the
    // first.
    unset("RESEND_API_KEY");
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";

    await expect(sendEmail(message)).rejects.toThrow(EmailDeliveryError);
  });

  test("a missing provider is tolerated in development", async () => {
    // A fresh checkout has no mail credentials and still has to sign in and
    // run a workflow end to end. The cost is real and local to this guard: in
    // development a notification is still recorded as delivered.
    unset("RESEND_API_KEY");
    // `NODE_ENV` is typed read-only, so it is set through `Reflect`.
    Reflect.set(process.env, "NODE_ENV", "development");

    await expect(sendEmail(message)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  test("attachments and cc reach the provider", async () => {
    // INT-02. The payload was rebuilt field by field from a fixed list, so
    // anything outside it was dropped - which is how every invoice email went
    // out announcing an invoice it did not carry.
    const content = Buffer.from("%PDF-1.4 invoice").toString("base64");

    await sendEmail({
      ...message,
      cc: ["accounting@example.com"],
      attachments: [
        {
          filename: "RE-2026-0001.pdf",
          contentType: "application/pdf",
          content,
        },
      ],
    });

    expect(sentBody().cc).toEqual(["accounting@example.com"]);
    expect(sentBody().attachments).toEqual([
      {
        filename: "RE-2026-0001.pdf",
        content_type: "application/pdf",
        content,
      },
    ]);
  });

  test("Virtbase's own option fields stay out of the provider payload", async () => {
    // The other half of passing options through: `variant`, `unsubscribeUrl`
    // and `trustpilotAfs` are ours, are consumed here, and must not be
    // forwarded as unknown fields.
    await sendEmail({
      ...message,
      variant: "marketing",
      unsubscribeUrl: "https://example.com/unsubscribe",
      trustpilotAfs: true,
    });

    expect(sentBody()).not.toHaveProperty("variant");
    expect(sentBody()).not.toHaveProperty("unsubscribeUrl");
    expect(sentBody()).not.toHaveProperty("trustpilotAfs");
    expect(sentBody().headers).toHaveProperty("List-Unsubscribe");
  });
});

describe("sendBatchEmail", () => {
  test("a refusal from the provider is a failure, not a delivery", async () => {
    respond = () =>
      json(401, {
        name: "restricted_api_key",
        message: "This API key is restricted to only send emails.",
      });

    await expect(sendBatchEmail([message])).rejects.toThrow(EmailDeliveryError);
  });

  test("no configured provider is a failure", async () => {
    unset("RESEND_API_KEY");

    await expect(sendBatchEmail([message])).rejects.toThrow(EmailDeliveryError);
  });

  test("an empty batch is not a failure", async () => {
    // Nothing was asked for, so nothing was lost.
    await expect(sendBatchEmail([])).resolves.toEqual({
      data: null,
      error: null,
    });
    expect(calls).toHaveLength(0);
  });

  test("cc survives a batch send too", async () => {
    respond = () => json(200, { data: [{ id: "email_1" }] });

    await sendBatchEmail([{ ...message, cc: "accounting@example.com" }]);

    expect(sentBatch()[0]?.cc).toBe("accounting@example.com");
  });
});
