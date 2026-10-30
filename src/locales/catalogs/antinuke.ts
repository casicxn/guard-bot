const rows: Record<string, [string, string]> = {
  "nuke.participationOnly": [
    "This action can be ordinary participation or self-service. It is observed without automatic punishment and is excluded from global Zero-Tolerance activation.",
    "Bu işlem normal katılım veya kişinin kendi işlemi olabilir. Otomatik ceza olmadan gözlenir ve genel Sıfır Tolerans etkinleştirmesine dahil edilmez.",
  ],
  "nuke.enable": ["🛡️ Enable Protection", "🛡️ Korumayı Aktifleştir"],
  "nuke.switchMonitor": ["🔓 Switch to Monitor Mode", "🔓 İzleme Moduna Geç"],
  "nuke.confirmTitle": ["Full Protection Mode", "Tam Koruma Modu"],
  "nuke.confirmEnable": ["Enable Protection", "Korumayı Aktifleştir"],
  "nuke.confirmDescription": [
    "Enabling this mode causes protected administrative actions by non-whitelisted executors to trigger containment on the first violation and automatic rollback where safely possible. Actions may be detected after Discord has already performed them. All implemented eligible administrative protections are activated together. Dangerous manageable roles are removed first; unrelated harmless roles are preserved. Hierarchy, unavailable permissions or missing trustworthy snapshots may prevent containment or recovery.",
    "Bu modu etkinleştirdiğinizde whitelist dışında kalan kişilerin korunan yönetim işlemleri ilk ihlalde engelleme müdahalesine ve mümkünse otomatik geri almaya neden olacaktır. İşlemler Discord tarafından gerçekleştikten sonra algılanabilir. Uygun yönetim korumaları birlikte etkinleşir. Önce yönetilebilir tehlikeli roller kaldırılır; ilgisiz zararsız roller korunur. Hiyerarşi, eksik izinler veya güvenilir yedek bulunmaması müdahaleyi ya da kurtarmayı engelleyebilir.",
  ],
  "nuke.health": [
    "Active first-action protections: {active}/{total}\nUnavailable protections: {unavailable}\nTrustworthy pre-incident snapshot ready: {snapshot}",
    "İlk ihlal koruması etkin: {active}/{total}\nKullanılamayan koruma: {unavailable}\nGüvenilir olay öncesi yedek hazır: {snapshot}",
  ],
  "nuke.unavailable": [
    "Unavailable / degraded modules:",
    "Kullanılamayan / eksik korumalar:",
  ],
  "nuke.permissionsReady": [
    "Base permission checks passed. Executor hierarchy and live state are checked per incident.",
    "Temel izin kontrolleri geçti. Sorumlunun hiyerarşisi ve canlı durum her olayda ayrıca kontrol edilir.",
  ],
  "nuke.capabilityLimits": [
    "Automatic recovery is limited to each module’s implemented strategy. Deleted IDs, messages and forced member rejoining cannot be restored. Ordinary chat, reactions and voice participation are not administrative violations.",
    "Otomatik kurtarma her modülün uygulanmış stratejisiyle sınırlıdır. Silinmiş kimlikler, mesajlar ve üyelerin zorla geri katılması kurtarılamaz. Normal sohbet, tepkiler ve ses katılımı yönetim ihlali sayılmaz.",
  ],
  "nuke.overviewRecent": [
    "Last incident: {incident}\nLast contained executor: {executor}\nRecovery health: {recovery}",
    "Son güvenlik olayı: {incident}\nSon müdahale edilen sorumlu: {executor}\nKurtarma durumu: {recovery}",
  ],
  "nuke.recoveryIssue": [
    "Latest recovery needs review",
    "Son kurtarma incelenmeli",
  ],
  "nuke.recoveryPending": [
    "Recovery is pending; completion is unconfirmed",
    "Kurtarma bekliyor; tamamlandığı doğrulanmadı",
  ],
  "nuke.recoveryRecorded": [
    "Latest recovery result recorded",
    "Son kurtarma sonucu kaydedildi",
  ],
  "nuke.recoveryNone": [
    "No automatic recovery attempts yet",
    "Henüz otomatik kurtarma denemesi yok",
  ],
  "nuke.profileManaged": [
    "Zero-Tolerance Protect controls all eligible administrative modules centrally: first action, containment, then safe rollback. Switch to Monitor to edit individual preferences.",
    "Sıfır Tolerans Koruma uygun yönetim modüllerini merkezi olarak yönetir: ilk işlem, yetki kaldırma, ardından güvenli geri alma. Bireysel tercihleri düzenlemek için İzleme moduna geçin.",
  ],
  "nuke.rollback.created": [
    "Deletes only the verified unauthorized created target when fresh-state checks allow.",
    "Canlı durum kontrolleri uygunsa yalnızca doğrulanan izinsiz oluşturulmuş hedefi siler.",
  ],
  "nuke.rollback.deleted": [
    "Reconstructs the deleted supported object from a validated pre-incident known-good snapshot. New IDs and partial recovery are expected; missing dependencies stop the affected operation.",
    "Silinmiş desteklenen nesneyi doğrulanmış güvenilir olay öncesi yedekten yeniden kurar. Yeni kimlik ve kısmi kurtarma beklenir; eksik bağımlılıklar ilgili işlemi durdurur.",
  ],
  "nuke.rollback.fields": [
    "Reverses only supported audited fields when the current state still matches the unauthorized change. Unrelated newer changes are preserved.",
    "Canlı durum izinsiz değişiklikle hâlâ eşleşiyorsa yalnızca desteklenen denetim alanlarını geri alır. İlgisiz yeni değişiklikler korunur.",
  ],
  "nuke.rollback.ban": [
    "Removes an unauthorized ban only with reliable current-ban and audit evidence. Unbanning does not bring the member back.",
    "İzinsiz yasağı yalnızca güvenilir güncel yasak ve denetim kanıtıyla kaldırır. Yasağı kaldırmak üyeyi sunucuya geri getirmez.",
  ],
  "nuke.rollback.unban": [
    "Restores a removed ban only when a trustworthy previous authorized ban state exists.",
    "Kaldırılan yasağı yalnızca güvenilir önceki yetkili yasak durumu varsa geri uygular.",
  ],
  "nuke.rollback.kick": [
    "Contains the verified executor and records the affected member. Discord cannot force a kicked member to rejoin; a safe invite may be provided by an authorized operator.",
    "Doğrulanan sorumluya müdahale eder ve etkilenen üyeyi kaydeder. Discord atılan üyeyi zorla geri katamaz; yetkili operatör güvenli davet sunabilir.",
  ],
  "nuke.rollback.member": [
    "Reverses only verified role additions/removals when live membership and hierarchy allow.",
    "Yalnızca doğrulanan rol ekleme/çıkarma işlemlerini, canlı üyelik ve hiyerarşi uygunsa geri alır.",
  ],
  "nuke.rollback.unsupported": [
    "Containment is available; automatic reversal for this action is not implemented. The incident records this limitation.",
    "Yetki kaldırma uygulanabilir; bu işlem için otomatik geri alma uygulanmamıştır. Bu sınır olay kaydında belirtilir.",
  ],
};
const permissions: Record<string, [string, string]> = {
  ViewAuditLog: ["View Audit Log", "Denetim Kaydını Görüntüle"],
  ManageRoles: ["Manage Roles", "Rolleri Yönet"],
  ManageChannels: ["Manage Channels", "Kanalları Yönet"],
  ManageGuild: ["Manage Server", "Sunucuyu Yönet"],
  BanMembers: ["Ban Members", "Üyeleri Yasakla"],
  KickMembers: ["Kick Members", "Üyeleri At"],
  ManageWebhooks: ["Manage Webhooks", "Webhookları Yönet"],
  ManageGuildExpressions: ["Manage Expressions", "İfadeleri Yönet"],
  ManageEvents: ["Manage Events", "Etkinlikleri Yönet"],
  ManageThreads: ["Manage Threads", "Konuları Yönet"],
  GuildModeration: ["GuildModeration intent", "GuildModeration intenti"],
};
for (const [key, value] of Object.entries(permissions))
  rows[`nuke.permission.${key}`] = value;
rows["nuke.permission.Guilds"] = ["Guilds intent", "Guilds intenti"];
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[1]]),
);
