import type { Interaction } from "discord.js";
import type { RestartProtection } from "../restart/contracts.js";
export interface OwnerAuthorization {
  isBotOwner(userId: string): boolean;
  assertOwner(userId: string): void;
  requireBotOwner(interaction: Interaction): Promise<boolean>;
}
export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";
export type PresenceActivity =
  "playing" | "watching" | "listening" | "competing" | "custom" | "none";
export interface PresenceConfig {
  version: 1;
  status: PresenceStatus;
  activityType: PresenceActivity;
  text: string;
  emoji?: string;
}
export interface PresenceState {
  ready: boolean;
  status: string;
  activityType: PresenceActivity;
  text: string;
  applied: boolean;
}
export interface PresenceControl {
  getConfig(): PresenceConfig;
  getState(): PresenceState;
  update(
    actorId: string,
    patch: Partial<Omit<PresenceConfig, "version">>,
  ): Promise<PresenceConfig>;
  reset(actorId: string): Promise<PresenceConfig>;
  start(): Promise<void>;
  dispose(): Promise<void>;
}
export interface VoiceConfig {
  version: 1;
  guildId: string;
  channelId?: string;
  autoJoin: boolean;
  selfMute: boolean;
  selfDeaf: boolean;
  manualDisconnect: boolean;
}
export interface VoiceState {
  status: "disconnected" | "connecting" | "ready" | "retrying" | "blocked";
  channelId?: string;
  retryCount: number;
  reason?: string;
}
export interface VoiceControl {
  getConfig(guildId: string): VoiceConfig;
  getState(guildId: string): VoiceState;
  configure(
    actorId: string,
    guildId: string,
    patch: Partial<
      Pick<VoiceConfig, "channelId" | "autoJoin" | "selfMute" | "selfDeaf">
    >,
  ): Promise<VoiceConfig>;
  connect(actorId: string, guildId: string): Promise<void>;
  disconnect(actorId: string, guildId: string): Promise<void>;
  reconnect(actorId: string, guildId: string): Promise<void>;
  start(): Promise<void>;
  dispose(): Promise<void>;
}
export interface ManagementControls {
  restart?: RestartProtection;
  ownerId?: string;
  authorization: OwnerAuthorization;
  presence: PresenceControl;
  voice: VoiceControl;
}
export interface ManagementActor {
  userId: string;
  authorization: OwnerAuthorization;
}
