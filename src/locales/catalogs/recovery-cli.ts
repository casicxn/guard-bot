const rows: Record<string, [string, string]> = {
  "cli.running": [
    "Guard remains online in recovery mode. Use /guard panel for maintenance, and prepare a new lockdown before stopping this process. Ctrl+C stops recovery mode.",
    "Guard kurtarma modunda çevrimiçi kalıyor. Bakım için /guard panel kullanın; bu süreci kapatmadan önce yeni kilit hazırlayın. Ctrl+C kurtarma modunu durdurur.",
  ],
  "cli.usage": [
    "Usage: pnpm recover --guild GUILD_ID [--session SESSION_ID] [--confirm SESSION_ID]. Stop the main bot first. Without --confirm this command only previews permissions.",
    "Kullanım: pnpm recover --guild SUNUCU_ID [--session OTURUM_ID] [--confirm OTURUM_ID]. Önce ana botu durdurun. --confirm olmadan yalnızca yetki önizlemesi yapılır.",
  ],
  "cli.noSession": [
    "No matching active Restart Lockdown session was found.",
    "Eşleşen etkin yeniden başlatma kilidi oturumu bulunamadı.",
  ],
  "cli.preview": [
    "Restart recovery preview | Session: {session} | State: {state} | Roles: {count}",
    "Yeniden başlatma kurtarma önizlemesi | Oturum: {session} | Durum: {state} | Roller: {count}",
  ],
  "cli.role": [
    "Role {role} | Original: {original} | Locked: {locked} | Current: {current} | Review: {review}",
    "Rol {role} | Asıl: {original} | Kilitli: {locked} | Güncel: {current} | İnceleme: {review}",
  ],
  "cli.missing": ["Missing", "Bulunamadı"],
  "cli.conflict": [
    "Conflict; no automatic grant",
    "Çakışma; otomatik yetki verilmez",
  ],
  "cli.exact": ["Exact recorded state", "Kayıtlı değerle eşleşiyor"],
  "cli.confirm": [
    "Preview only. To explicitly authorize this session, rerun with --confirm {session}. Restoration still requires healthy Protect Mode and respects conflicts.",
    "Yalnızca önizleme. Bu oturumu açıkça onaylamak için --confirm {session} ekleyerek yeniden çalıştırın. Geri yükleme yine sağlıklı Koruma Modu gerektirir; çakışan yetkiler değiştirilmez.",
  ],
  "cli.result": [
    "Recovery finished | Session: {session} | State: {state}",
    "Kurtarma tamamlandı | Oturum: {session} | Durum: {state}",
  ],
  "cli.failure": [
    "Recovery command failed; no unrecorded permission grants were authorized.",
    "Kurtarma komutu başarısız; kayıt dışı bir yetki artışı onaylanmadı.",
  ],
};
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[1]]),
);
