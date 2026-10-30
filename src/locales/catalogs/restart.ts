const rows: Record<string, [string, string]> = {
  "control.section.restart": [
    "Restart Protection",
    "Yeniden Başlatma Koruması",
  ],
  "restart.overview": [
    "Restart Protection: **{state}**",
    "Yeniden Başlatma Koruması: **{state}**",
  ],
  "restart.summary": [
    "State: **{state}**\nAffected roles: {affected}\nVerified locked roles: {locked}\nRestored roles: {restored}\nCoverage notices: {risks}\nSnapshot ready: {snapshot}",
    "Durum: **{state}**\nEtkilenen roller: {affected}\nKilitlendiği doğrulanan roller: {locked}\nGeri yüklenen roller: {restored}\nKapsam uyarıları: {risks}\nYedek hazır: {snapshot}",
  ],
  "restart.limits": [
    "For planned maintenance only. Prepare a durable snapshot, review coverage and explicitly confirm activation before restarting. The bot never stops itself. The guild owner cannot be restricted; unmanaged roles and channel overrides may leave gaps. Unexpected shutdown before activation is not protected. Restoration requires Guard readiness and matching saved permissions.",
    "Yalnızca planlı bakım içindir. Kalıcı izin yedeğini hazırlayın, kapsamı inceleyin ve yeniden başlatmadan önce etkinleştirmeyi açıkça onaylayın. Bot kendisini kapatmaz. Sunucu sahibi kısıtlanamaz; yönetilemeyen roller ve kanal izinleri açık bırakabilir. Etkinleştirme öncesindeki ani kapanma korunmaz. Geri yükleme için Guard'ın hazır olması ve izinlerin kayıtla eşleşmesi gerekir.",
  ],
  "restart.prepare": ["Prepare Lockdown", "Kilidi Hazırla"],
  "restart.activate": ["Activate Lockdown", "Kilidi Etkinleştir"],
  "restart.restore": ["Restore Permissions", "İzinleri Geri Yükle"],
  "restart.details": [
    "Snapshot, roles and recovery report",
    "Yedek, roller ve kurtarma raporu",
  ],
  "restart.detailHeading.snapshot": ["Permission Snapshot", "İzin Yedeği"],
  "restart.detailHeading.roles": ["Affected Roles", "Etkilenen Roller"],
  "restart.detailHeading.report": ["Recovery Report", "Kurtarma Raporu"],
  "restart.role": [
    "**{name}** (`{id}`)\nStatus: {status}\nOriginal: `{original}`\nLocked target: `{locked}`\nRemoved flags: `{removed}`\nObserved: `{actual}`",
    "**{name}** (`{id}`)\nDurum: {status}\nÖzgün: `{original}`\nKilit hedefi: `{locked}`\nKaldırılan bayraklar: `{removed}`\nGözlenen: `{actual}`",
  ],
  "restart.transition": ["{state} · <t:{time}:F>", "{state} · <t:{time}:F>"],
  "restart.riskCount": [
    "Coverage notices: {count}",
    "Kapsam uyarıları: {count}",
  ],
  "restart.confirmActivate": [
    "Apply this saved permission lockdown? Dangerous flags are removed only from manageable roles after fresh checks. Do not restart unless the resulting state is LOCKED and all coverage gaps are reviewed. The process will remain running.",
    "Bu kayıtlı izin kilidi uygulansın mı? Güncel kontrollerden sonra yalnızca yönetilebilir rollerden tehlikeli bayraklar kaldırılır. Sonuç KİLİTLİ olmadan ve kapsam açıklarını incelemeden yeniden başlatmayın. Süreç çalışmaya devam eder.",
  ],
  "restart.confirmRestore": [
    "Restore only permissions recorded as removed by this session? Guard readiness, current permissions and role hierarchy are rechecked. Conflicting or uncertain changes require review and are not overwritten.",
    "Yalnızca bu oturumda kaldırıldığı kayıtlı izinler geri yüklensin mi? Guard hazırlığı, güncel izinler ve rol hiyerarşisi yeniden kontrol edilir. Çakışan veya belirsiz değişiklikler incelenir; üzerine yazılmaz.",
  ],
  "restart.privateSummary": [
    "Permission snapshots and recovery details are private. Use the owner's private report controls.",
    "İzin yedekleri ve kurtarma ayrıntıları özeldir. Sahibe ait özel rapor kontrollerini kullanın.",
  ],
  "restart.unavailable": [
    "Restart protection is unavailable; no permissions were changed.",
    "Yeniden başlatma koruması kullanılamıyor; izin değiştirilmedi.",
  ],
  "restart.noSession": [
    "Prepare a lockdown snapshot first.",
    "Önce bir yeniden başlatma izin yedeği hazırlayın.",
  ],
  "restart.invalidJournal": [
    "The saved permission journal is invalid. Keep the records and use manual recovery; no arbitrary permission grants will be attempted.",
    "Kayıtlı izin günlüğü geçersiz. Kayıtları koruyun ve manuel kurtarma kullanın; keyfi izin verilmez.",
  ],
  "restart.staleSession": [
    "This lockdown session changed. Refresh and review the current snapshot.",
    "Bu kilit oturumu değişti. Yenileyip güncel yedeği inceleyin.",
  ],
  "restart.busy": [
    "Another permission recovery operation is running. Wait and refresh.",
    "Başka bir izin kurtarma işlemi sürüyor. Bekleyip yenileyin.",
  ],
  "restart.activeSession": [
    "An unfinished lockdown session already exists. Review or recover it before preparing another.",
    "Tamamlanmamış bir kilit oturumu var. Yeni bir oturum hazırlamadan önce inceleyin veya kurtarın.",
  ],
  "restart.unsafePlan": [
    "This plan cannot safely preserve Guard restoration capability. Review the coverage report; do not restart.",
    "Bu plan Guard'ın geri yükleme yetkisini güvenle koruyamıyor. Kapsam raporunu inceleyin; yeniden başlatmayın.",
  ],
  "restart.needsReview": ["Needs manual review", "Manuel inceleme gerekiyor"],
  "restart.risk.owner-unrestricted": [
    "The guild owner always retains control.",
    "Sunucu sahibi her zaman kontrolü elinde tutar.",
  ],
  "restart.risk.unmanageable": [
    "Dangerous role cannot be managed: {target}",
    "Tehlikeli rol yönetilemiyor: {target}",
  ],
  "restart.risk.bot-shared": [
    "Role may be needed for Guard restoration: {target}",
    "Rol Guard'ın geri yüklemesi için gerekli olabilir: {target}",
  ],
  "restart.risk.overwrite": [
    "Dangerous channel permission override remains: {target}",
    "Tehlikeli kanal izin geçersiz kılması kalıyor: {target}",
  ],
  "restart.risk.missing-manage-roles": [
    "Manage Roles permission is unavailable.",
    "Rolleri Yönet izni kullanılamıyor.",
  ],
  "restart.risk.preflight-failed": [
    "Preflight checks failed; do not restart.",
    "Ön kontroller başarısız; yeniden başlatmayın.",
  ],
  "restart.risk.cannot-restore": [
    "Guard cannot grant back this role's removed permissions: {target}",
    "Guard bu rolün kaldırılacak yetkilerini geri veremiyor: {target}",
  ],
};
const states: Record<string, [string, string]> = {
  IDLE: ["Idle", "Boşta"],
  PREPARING: ["Preparing", "Hazırlanıyor"],
  SNAPSHOTTING: ["Snapshot ready", "Yedek hazır"],
  LOCKING: ["Locking", "Kilitleniyor"],
  LOCKED: ["Locked", "Kilitli"],
  RESTARTING: ["Restarting", "Yeniden başlatılıyor"],
  VERIFYING: ["Verifying", "Doğrulanıyor"],
  RESTORING: ["Restoring", "Geri yükleniyor"],
  COMPLETED: ["Completed", "Tamamlandı"],
  PARTIAL_FAILURE: ["Partial failure", "Kısmi başarısızlık"],
  MANUAL_RECOVERY_REQUIRED: [
    "Manual recovery required",
    "Manuel kurtarma gerekiyor",
  ],
};
for (const [key, pair] of Object.entries(states))
  rows[`restart.state.${key}`] = pair;
const statuses: Record<string, [string, string]> = {
  planned: ["Planned", "Planlandı"],
  pending: ["Pending verification", "Doğrulama bekliyor"],
  locked: ["Locked", "Kilitli"],
  restored: ["Restored", "Geri yüklendi"],
  unchanged: ["Unchanged", "Değişmedi"],
  conflict: ["Conflict", "Çakışma"],
  missing: ["Missing", "Eksik"],
  failed: ["Failed", "Başarısız"],
  uncertain: ["Uncertain", "Belirsiz"],
  skipped: ["Skipped", "Atlandı"],
};
for (const [key, pair] of Object.entries(statuses))
  rows[`restart.roleStatus.${key}`] = pair;
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, pair]) => [key, pair[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, pair]) => [key, pair[1]]),
);
