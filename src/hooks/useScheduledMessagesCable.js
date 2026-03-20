import { useEffect } from "react";
import { createConsumer } from "@rails/actioncable";
import { getAccessToken } from "../utils/authStorage";

function buildCableUrl(accessToken) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const parsedUrl = new URL(apiBaseUrl);

  parsedUrl.protocol = parsedUrl.protocol === "https:" ? "wss:" : "ws:";
  parsedUrl.pathname = "/cable";
  parsedUrl.search = "";
  parsedUrl.searchParams.set("token", accessToken);

  return parsedUrl.toString();
}

function extractScheduledMessage(payload) {
  const candidate = payload?.message ?? payload?.scheduled_message ?? payload?.data;

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  if (candidate.id === undefined || candidate.id === null) {
    return null;
  }

  if (typeof candidate.content !== "string") {
    return null;
  }

  if (typeof candidate.unlock_date !== "string") {
    return null;
  }

  return candidate;
}

export function useScheduledMessagesCable({ onMessageCreated, onMessageUpdated }) {
  useEffect(() => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      return undefined;
    }

    let consumer;
    let subscription;

    try {
      consumer = createConsumer(buildCableUrl(accessToken));
      subscription = consumer.subscriptions.create(
        {
          channel: "CoupleChannel"
        },
        {
          received(payload) {
            const eventName = typeof payload?.event === "string" ? payload.event : "";
            const message = extractScheduledMessage(payload);

            if (!message) {
              return;
            }

            if (eventName === "message_created") {
              onMessageCreated?.(message, payload);
              return;
            }

            if (eventName === "message_updated") {
              onMessageUpdated?.(message, payload);
            }
          }
        }
      );
    } catch {
      return undefined;
    }

    return () => {
      if (subscription && consumer) {
        consumer.subscriptions.remove(subscription);
      }

      consumer?.disconnect();
    };
  }, [onMessageCreated, onMessageUpdated]);
}
