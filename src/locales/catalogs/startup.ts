const rows: Record<string, [string, string]> = {
  "runtime.voiceTimeout": [
    "Voice connection did not become ready within 15 seconds. Verify the voice channel, permissions and voice network connectivity.",
    "Ses bağlantısı 15 saniyede hazır olmadı. Ses kanalını, izinleri ve ses ağı bağlantısını kontrol edin.",
  ],
  "startup.title": [
    "🟢 Ultimate Guard — Online",
    "🟢 Ultimate Guard — Çevrimiçi",
  ],
  "startup.warningTitle": [
    "🟠 Ultimate Guard — Attention required",
    "🟠 Ultimate Guard — Dikkat gerekiyor",
  ],
  "startup.description": [
    "Ultimate Guard has started successfully. Saved security configurations have been restored and the system is operational again.",
    "Ultimate Guard başarıyla başlatıldı. Kayıtlı güvenlik yapılandırmaları yüklendi ve sistem tekrar aktif hale getirildi.",
  ],
  "startup.warningDescription": [
    "Ultimate Guard is online. Some services are degraded; review the actual status below. Saved settings have not been reset.",
    "Ultimate Guard çevrimiçi. Bazı hizmetler kısıtlı; aşağıdaki gerçek durumları kontrol edin. Kayıtlı ayarlar sıfırlanmadı.",
  ],
  "startup.mode": ["🛡️ Protection Mode", "🛡️ Koruma Modu"],
  "startup.active": ["✅ Active Protections", "✅ Aktif Korumalar"],
  "startup.whitelist": ["📋 Whitelist", "📋 Whitelist"],
  "startup.database": ["💾 Database", "💾 Veritabanı"],
  "startup.voice": ["🎙️ Voice Connection", "🎙️ Ses Bağlantısı"],
  "startup.panel": ["📊 Control Panel", "📊 Kontrol Paneli"],
  "startup.restart": ["🔒 Restart Lockdown", "🔒 Yeniden Başlatma Koruması"],
  "startup.recovery": ["Permission Recovery", "Yetki Kurtarma"],
  "startup.recoverySummary": [
    "Restored: {restored}/{total} · Conflicts/failures: {conflicts}",
    "Geri yüklenen: {restored}/{total} · Çakışma/hata: {conflicts}",
  ],
  "startup.restart.IDLE": ["Inactive", "Etkin değil"],
  "startup.restart.PREPARING": ["Preparing", "Hazırlanıyor"],
  "startup.restart.SNAPSHOTTING": [
    "Snapshot saved; awaiting confirmation",
    "Anlık görüntü kaydedildi; onay bekleniyor",
  ],
  "startup.restart.LOCKING": [
    "Locking; review required",
    "Kilitleniyor; kontrol gerekiyor",
  ],
  "startup.restart.LOCKED": [
    "Locked; permissions remain restricted",
    "Kilitli; yetkiler kısıtlı kalıyor",
  ],
  "startup.restart.RESTARTING": [
    "Restart pending",
    "Yeniden başlatma bekleniyor",
  ],
  "startup.restart.VERIFYING": [
    "Verifying permissions",
    "Yetkiler doğrulanıyor",
  ],
  "startup.restart.RESTORING": [
    "Restoring permissions",
    "Yetkiler geri yükleniyor",
  ],
  "startup.restart.COMPLETED": ["Completed", "Tamamlandı"],
  "startup.restart.PARTIAL_FAILURE": [
    "Partial failure; review required",
    "Kısmi hata; kontrol gerekiyor",
  ],
  "startup.restart.MANUAL_RECOVERY_REQUIRED": [
    "Manual recovery required",
    "Elle kurtarma gerekiyor",
  ],
  "startup.restart.pending": ["Recovery pending", "Kurtarma bekliyor"],
  "startup.restart.unavailable": [
    "Recovery unavailable; review saved journal",
    "Kurtarma kullanılamıyor; kayıtları kontrol edin",
  ],
  "startup.started": ["🕒 Started At", "🕒 Başlatılma"],
  "startup.connected": ["Connected", "Bağlı"],
  "startup.restored": ["Restored", "Geri yüklendi"],
  "startup.unavailable": ["Unavailable", "Kullanılamıyor"],
  "startup.pending": ["Pending", "Bekliyor"],
  "startup.disabled": ["Disabled", "Kapalı"],
  "startup.paused": ["Manually disconnected", "Elle bağlantısı kesildi"],
  "startup.disconnected": ["Disconnected", "Bağlı değil"],
  "startup.protect": ["Protect", "Koruma"],
  "startup.monitor": ["Monitor", "İzleme"],
  "startup.full": ["Full protection", "Tam koruma"],
};
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[1]]),
);
