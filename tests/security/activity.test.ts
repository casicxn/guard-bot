import { describe, it, expect, vi } from "vitest";
import {
  classifyActivity,
  ACTIVITY_COLORS,
  isSafeActivity,
  isHostileIncident,
  matchingWhitelistExemption,
  hasActualIntervention,
} from "../../src/security/activity.js";
import type {
  ActorContext,
  Incident,
  WhitelistEntry,
} from "../../src/contracts.js";
import { SqliteStore } from "../../src/database/index.js";
import { SecurityEngine } from "../../src/security/index.js";
const base = (): Incident => ({
  id: "audit",
  guildId: "guild",
  createdAt: Date.now(),
  confidence: "confirmed",
  policy: "strip",
  status: "recorded",
  result: "Monitor only",
  event: {
    id: "audit",
    guildId: "guild",
    action: "channel.create",
    auditAction: 10,
    targetId: "target",
    executorId: "executor",
    source: "audit",
    timestamp: Date.now(),
  },
});
describe("verified activity classification", () => {
  it.each([true, false])(
    "distinguishes failed verification from a failed actual enforcement attempt (verification failure: %s)",
    async (verificationFails) => {
      const store = new SqliteStore(":memory:");
      try {
        const config = store.getConfig("guild");
        config.mode = "protect";
        config.modules["channel.create"] = {
          enabled: true,
          mode: "protect",
          threshold: 1,
          windowMs: 60000,
          action: "kick",
        };
        store.setConfig("guild", config);
        const context = vi.fn(async () => {
          if (verificationFails)
            throw new Error("Member could not be verified");
          return {
            ownerId: "owner",
            selfId: "self",
            roleIds: [],
            isBot: false,
          };
        });
        const enforce = vi.fn(async () => {
          throw new Error("Missing permission");
        });
        const engine = new SecurityEngine(store, {
          context,
          enforce,
          log: async () => {},
        });
        const result = await engine.process(base().event);
        expect(result?.enforcementAttempted).toBe(!verificationFails);
        expect(classifyActivity(result!)).toBe(
          verificationFails ? "unresolved" : "failed",
        );
        expect(enforce).toHaveBeenCalledTimes(verificationFails ? 0 : 1);
        await engine.drain();
      } finally {
        store.close();
      }
    },
  );
  it.each([
    "botOwner",
    "guildOwner",
    "self",
    "whitelistUser",
    "whitelistRole",
    "trustedBot",
    "policy",
  ] as const)("marks confirmed %s exemption safe", (exemption) => {
    const incident = {
      ...base(),
      status: "exempt",
      result: "Verified",
      exemption,
    };
    expect(classifyActivity(incident)).toBe("safe");
    expect(isSafeActivity(incident)).toBe(true);
    expect(isHostileIncident(incident)).toBe(false);
    expect(ACTIVITY_COLORS.safe).toBe(0x57f287);
  });
  it("never trusts an exemption field when executor attribution is missing", () => {
    const incident = { ...base(), exemption: "whitelistUser" as const };
    incident.event.executorId = null;
    expect(classifyActivity(incident)).toBe("unresolved");
    incident.event.executorId = "executor";
    incident.confidence = "unresolved";
    expect(classifyActivity(incident)).toBe("unresolved");
  });
  it("keeps verified historical trusted records safe without rewriting them", () => {
    const incident = {
      ...base(),
      status: "exempt",
      result: "Action-specific whitelist",
    };
    expect(classifyActivity(incident)).toBe("safe");
    expect(incident).not.toHaveProperty("exemption");
  });
  it("does not guess trust from generic exemption status or changed protection mode", () => {
    expect(
      classifyActivity({
        ...base(),
        status: "exempt",
        result: "Protection mode or executor authorization changed",
      }),
    ).not.toBe("safe");
  });
  it("marks monitor observations yellow and failed attempts dark red", () => {
    expect(classifyActivity(base())).toBe("monitored");
    expect(ACTIVITY_COLORS.monitored).toBe(0xfee75c);
    expect(
      classifyActivity({
        ...base(),
        status: "failed",
        result: "Missing permissions",
      }),
    ).toBe("failed");
    expect(ACTIVITY_COLORS.failed).toBe(0x992d22);
  });
  it("does not call zero removed roles or a warning actual mitigation", () => {
    expect(
      classifyActivity({
        ...base(),
        status: "handled",
        result: "No removable dangerous roles.",
      }),
    ).toBe("monitored");
    expect(
      classifyActivity({
        ...base(),
        policy: "warn",
        status: "handled",
        result: "Security warning recorded for incident channel.",
      }),
    ).toBe("monitored");
    expect(
      classifyActivity({
        ...base(),
        rollback: {
          status: "succeeded",
          strategy: "delete-created",
          result: "Already absent",
          effectsApplied: false,
        },
      }),
    ).toBe("monitored");
  });
  it("never treats unverified effect metadata as a confirmed intervention", () => {
    const incident = {
      ...base(),
      confidence: "unresolved" as const,
      containment: {
        status: "contained" as const,
        removedRoleIds: ["role"],
        remainingRoleIds: [],
        remainingPermissions: "0",
        reason: "Claimed",
      },
    };
    expect(hasActualIntervention(incident)).toBe(false);
    expect(classifyActivity(incident)).toBe("unresolved");
  });
  it("keeps an unknown legacy handled outcome unresolved rather than inventing a result", () => {
    expect(
      classifyActivity({
        ...base(),
        policy: "kick",
        status: "handled",
        result: "Unknown adapter output",
      }),
    ).toBe("unresolved");
  });
  it("requires actual effects for rollback mitigation", () => {
    expect(
      classifyActivity({
        ...base(),
        rollback: {
          status: "succeeded",
          strategy: "delete-created",
          result: "Deleted",
          effectsApplied: true,
        },
      }),
    ).toBe("mitigated");
    expect(ACTIVITY_COLORS.mitigated).toBe(0xed4245);
    expect(
      classifyActivity({
        ...base(),
        rollback: {
          status: "uncertain",
          strategy: "delete-created",
          result: "timeout",
          effectsApplied: false,
        },
      }),
    ).toBe("unresolved");
  });
  it("reports a real partial containment as intervention while preserving remaining risk", () => {
    expect(
      classifyActivity({
        ...base(),
        containment: {
          status: "partial",
          removedRoleIds: ["dangerous"],
          remainingRoleIds: ["higher"],
          remainingPermissions: "8",
          reason: "Higher role remains",
        },
        rollback: {
          status: "failed",
          strategy: "none",
          result: "No permission",
        },
      }),
    ).toBe("mitigated");
  });
  it("recognizes only successful legacy enforcement outputs", () => {
    for (const [policy, result] of [
      ["kick", "Executor kicked."],
      ["ban", "Executor banned; messages retained."],
      ["strip", "Removed 2 dangerous roles."],
      ["reverse", "Audited fields reversed after exact live-state validation."],
    ] as const)
      expect(
        classifyActivity({ ...base(), policy, status: "handled", result }),
      ).toBe("mitigated");
    expect(
      classifyActivity({
        ...base(),
        policy: "kick",
        status: "handled",
        result: "Unknown output",
      }),
    ).not.toBe("mitigated");
  });
  it("keeps whitelist scopes, account type and expiry matching unchanged", () => {
    const event = base().event,
      actor: ActorContext = {
        ownerId: "owner",
        selfId: "self",
        roleIds: ["trusted-role"],
        isBot: false,
      };
    const grant = (
      kind: WhitelistEntry["kind"],
      subjectId: string,
      actions = ["channel.create"],
    ): WhitelistEntry => ({ id: kind, kind, subjectId, actions });
    expect(
      matchingWhitelistExemption(
        [grant("role", "trusted-role")],
        event,
        actor,
        Date.now(),
      ),
    ).toBe("whitelistRole");
    expect(
      matchingWhitelistExemption(
        [grant("bot", "executor")],
        event,
        actor,
        Date.now(),
      ),
    ).toBeUndefined();
    expect(
      matchingWhitelistExemption(
        [grant("user", "executor", ["role.delete"])],
        event,
        actor,
        Date.now(),
      ),
    ).toBeUndefined();
    expect(
      matchingWhitelistExemption(
        [{ ...grant("user", "executor"), expiresAt: 1 }],
        event,
        actor,
        Date.now(),
      ),
    ).toBeUndefined();
  });
});
describe("engine verified exemptions remain non-punitive", () => {
  it("keeps delayed pre-activation whitelist actions safe while retaining the no-retroactive-effects gate", async () => {
    const store = new SqliteStore(":memory:");
    try {
      const config = store.getConfig("guild");
      config.mode = "protect";
      config.zeroTolerance = true;
      config.protectionActivatedAt = Date.now() + 1000;
      store.setConfig("guild", config);
      store.put("guild", "whitelist", "trusted", {
        id: "trusted",
        kind: "user",
        subjectId: "executor",
        actions: ["channel.create"],
      });
      const contain = vi.fn(),
        rollback = vi.fn(),
        engine = new SecurityEngine(store, {
          context: async () => ({
            ownerId: "owner",
            selfId: "self",
            roleIds: [],
            isBot: false,
          }),
          enforce: vi.fn(),
          contain,
          rollback,
          log: async () => {},
        });
      const incident = await engine.process(base().event);
      expect(classifyActivity(incident!)).toBe("safe");
      expect(contain).not.toHaveBeenCalled();
      expect(rollback).not.toHaveBeenCalled();
    } finally {
      store.close();
    }
  });
  it.each([
    ["user", false, [], "whitelistUser"],
    ["role", false, ["trusted-role"], "whitelistRole"],
    ["bot", true, [], "trustedBot"],
  ] as const)(
    "records %s trust only after verification and never contains or rolls back",
    async (kind, isBot, roleIds, reason) => {
      const store = new SqliteStore(":memory:");
      try {
        const config = store.getConfig("guild");
        config.mode = "protect";
        config.zeroTolerance = true;
        store.setConfig("guild", config);
        store.put("guild", "whitelist", "trust", {
          id: "trust",
          kind,
          subjectId: kind === "role" ? "trusted-role" : "executor",
          actions: ["channel.create"],
        });
        const contain = vi.fn(),
          rollback = vi.fn(),
          log = vi.fn(async () => {}),
          engine = new SecurityEngine(store, {
            context: async () => ({
              ownerId: "owner",
              selfId: "self",
              roleIds: [...roleIds],
              isBot,
            }),
            enforce: vi.fn(),
            contain,
            rollback,
            log,
          });
        const incident = await engine.process(base().event);
        await engine.drain();
        expect(incident?.exemption).toBe(reason);
        expect(classifyActivity(incident!)).toBe("safe");
        expect(contain).not.toHaveBeenCalled();
        expect(rollback).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledOnce();
        expect(await engine.process(base().event)).toBeUndefined();
        expect(log).toHaveBeenCalledOnce();
      } finally {
        store.close();
      }
    },
  );
  it("records global owner exemption and never changes protections", async () => {
    const store = new SqliteStore(":memory:");
    try {
      const contain = vi.fn(),
        engine = new SecurityEngine(store, {
          context: async () => ({
            ownerId: "guild-owner",
            selfId: "self",
            botOwnerId: "executor",
            roleIds: [],
            isBot: false,
          }),
          enforce: vi.fn(),
          contain,
          log: async () => {},
        });
      const incident = await engine.process(base().event);
      expect(incident?.exemption).toBe("botOwner");
      expect(classifyActivity(incident!)).toBe("safe");
      expect(store.getConfig("guild").mode).toBe("monitor");
      expect(contain).not.toHaveBeenCalled();
    } finally {
      store.close();
    }
  });
});
