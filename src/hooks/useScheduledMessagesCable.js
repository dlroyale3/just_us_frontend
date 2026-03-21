import { useEffect } from "react";
import { createConsumer } from "@rails/actioncable";
import { getAccessToken } from "../utils/authStorage";

function buildCableUrl(accessToken) {
  const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:3000/cable";
  const parsedUrl = new URL(wsBaseUrl);

  if (!parsedUrl.pathname || parsedUrl.pathname === "/") {
    parsedUrl.pathname = "/cable";
  }

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
          connected() {
            console.info("[PERF] WebSocket Connected");
          },
          disconnected() {
            console.error("[PERF] WebSocket Disconnected/Error", new Error("ActionCable disconnected"));
          },
          rejected() {
            console.error("[PERF] WebSocket Disconnected/Error", new Error("ActionCable subscription rejected"));
          },
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
