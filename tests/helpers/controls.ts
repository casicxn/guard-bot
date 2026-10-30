import type { ManagementControls } from "../../src/control/contracts.js";
import { UserError } from "../../src/discord/errors.js";

/** Event-only fixtures do not start the optional Discord runtime services. */
export function testControls(): ManagementControls {
  const unavailable = async (): Promise<never> => {
    throw new Error("Runtime unavailable in event fixture");
  };
  return {
    authorization: {
      isBotOwner: (id) => id === "999999999999999999",
      assertOwner: (id) => {
        if (id !== "999999999999999999") throw new UserError("error.owner");
      },
      requireBotOwner: async () => false,
    },
    presence: {
      getConfig: () => ({
        version: 1,
        status: "online",
        activityType: "none",
        text: "",
      }),
      getState: () => ({
        ready: false,
        status: "offline",
        activityType: "none",
        text: "",
        applied: false,
      }),
      update: unavailable,
      reset: unavailable,
      start: async () => {},
      dispose: async () => {},
    },
    voice: {
      getConfig: (guildId) => ({
        version: 1,
        guildId,
        autoJoin: false,
        selfMute: true,
        selfDeaf: true,
        manualDisconnect: false,
      }),
      getState: () => ({ status: "disconnected", retryCount: 0 }),
      configure: unavailable,
      connect: unavailable,
      disconnect: unavailable,
      reconnect: unavailable,
      start: async () => {},
      dispose: async () => {},
    },
  };
}
