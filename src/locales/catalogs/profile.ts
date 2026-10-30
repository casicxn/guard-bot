const rows: Record<string, [string, string]> = {
  "profile.codeOnly": [
    "Bot profile is configured in src/configuration/bot-profile.ts. Edit that file and restart the bot; profile changes are unavailable in Discord.",
    "Bot profili src/configuration/bot-profile.ts dosyasından yapılandırılır. Bu dosyayı düzenleyip botu yeniden başlatın; Discord içinden profil değiştirilemez.",
  ],
  "profile.readOnlyBody": [
    "Status: **{status}**\nActivity: **{type}**\nText: {text}\nApplied in this runtime: {applied}\n\nRead-only. Bot profile and About Me are managed through source configuration. Voice connection remains editable in its own section.",
    "Durum: **{status}**\nEtkinlik: **{type}**\nMetin: {text}\nBu oturumda uygulandı: {applied}\n\nSalt okunur. Bot profili ve Hakkımda bilgisi kaynak yapılandırmasından yönetilir. Ses bağlantısı kendi bölümünden düzenlenebilir.",
  ],
  "profile.configurationSource": [
    "Profile configuration: src/configuration/bot-profile.ts",
    "Profil yapılandırması: src/configuration/bot-profile.ts",
  ],
};
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[1]]),
);
