/** Console language is process-local and independent from guild interface language. */
const messages: Record<string, [string, string]> = {
  "Restart readiness verification failed": [
    "Restart readiness verification failed; lockdown retained.",
    "Yeniden başlatma hazırlığı doğrulanamadı; kilit korunuyor.",
  ],
  "Restart journal unavailable for panel": [
    "Restart journal needs review; other panel controls remain available.",
    "Yeniden başlatma günlüğü incelenmeli; diğer panel kontrolleri kullanılabilir.",
  ],
  "Restart protection state changed": [
    "Restart protection state changed.",
    "Yeniden başlatma korumasının durumu değişti.",
  ],
  "Restart permission operation needs review": [
    "Restart permission operation needs review.",
    "Yeniden başlatma yetki işlemi kontrol gerektiriyor.",
  ],
  "Guard not ready; restart lockdown retained": [
    "Guard not ready; restart lockdown retained.",
    "Guard hazır değil; yeniden başlatma kilidi korunuyor.",
  ],
  "Restart lockdown recovery failed; saved journal retained": [
    "Restart lockdown recovery failed; saved journal retained.",
    "Yeniden başlatma kilidi kurtarılamadı; kayıtlar korunuyor.",
  ],
  "Voice connection timed out after 15 seconds; security remains operational": [
    "Voice connection did not become ready within 15 seconds; security remains operational.",
    "Ses bağlantısı 15 saniyede hazır olmadı; güvenlik çalışmaya devam ediyor.",
  ],
  "Unauthorized channel deleted.": [
    "Unauthorized channel deleted.",
    "Yetkisiz oluşturulan kanal silindi.",
  ],
  "Unauthorized role deleted.": [
    "Unauthorized role deleted.",
    "Yetkisiz oluşturulan rol silindi.",
  ],
  "Unauthorized webhook deleted.": [
    "Unauthorized webhook deleted.",
    "Yetkisiz oluşturulan webhook silindi.",
  ],
  "Unauthorized AutoMod rule deleted.": [
    "Unauthorized AutoMod rule deleted.",
    "Yetkisiz oluşturulan AutoMod kuralı silindi.",
  ],
  "Only exact audited role fields were restored.": [
    "Only exact audited role fields were restored.",
    "Yalnızca denetim kaydıyla doğrulanan rol alanları geri yüklendi.",
  ],
  "Only the exact audited channel fields were restored.": [
    "Only the exact audited channel fields were restored.",
    "Yalnızca denetim kaydıyla doğrulanan kanal alanları geri yüklendi.",
  ],
  "Supported guild fields restored after exact live-state validation.": [
    "Supported guild fields restored after exact live-state validation.",
    "Desteklenen sunucu alanları güncel durum doğrulanarak geri yüklendi.",
  ],
  "Unauthorized ban removed. The member must choose to rejoin; they were not automatically re-added.":
    [
      "Unauthorized ban removed; the member must choose to rejoin.",
      "Yetkisiz yasak kaldırıldı; üyenin sunucuya kendisinin yeniden katılması gerekiyor.",
    ],
  "The reliably recorded previous ban was restored without deleting messages.":
    [
      "The reliably recorded previous ban was restored without deleting messages.",
      "Doğrulanmış önceki yasak mesajlar silinmeden geri yüklendi.",
    ],
  "Only the unauthorized member-role additions/removals were reversed.": [
    "Only the unauthorized member-role additions/removals were reversed.",
    "Yalnızca yetkisiz üye rolü ekleme ve kaldırma işlemleri geri alındı.",
  ],
  "Channel structure recreated with a new ID. Message history and live membership cannot be restored; child-category links may need review.":
    [
      "Channel structure recreated with a new ID; messages and live membership cannot be restored.",
      "Kanal yapısı yeni kimlikle oluşturuldu; mesajlar ve canlı üyelik geri yüklenemez. Alt kategori bağlantılarını inceleyin.",
    ],
  "Only the unauthorized newly-created overwrite was removed.": [
    "Only the unauthorized newly-created overwrite was removed.",
    "Yalnızca yetkisiz oluşturulan kanal izin kaydı kaldırıldı.",
  ],
  "Only the exact audited overwrite was restored; unrelated overwrites were preserved.":
    [
      "Only the exact audited overwrite was restored; unrelated overwrites were preserved.",
      "Yalnızca doğrulanan kanal izin kaydı geri yüklendi; diğer izin kayıtları korundu.",
    ],
  "Optional startup restoration incomplete; security remains operational": [
    "Optional startup restoration incomplete; security remains operational.",
    "İsteğe bağlı başlangıç bileşeni hazır değil; güvenlik çalışmaya devam ediyor.",
  ],
  "Configuration validation failed; check required credentials and log settings":
    [
      "Configuration validation failed; check required credentials and log settings.",
      "Yapılandırma doğrulanamadı; gerekli kimlik bilgilerini ve günlük ayarlarını kontrol edin.",
    ],
  "SQLite connected": ["SQLite connected.", "SQLite bağlantısı kuruldu."],
  "Database restoration failed; startup stopped": [
    "Database restoration failed; startup stopped.",
    "Veritabanı geri yüklenemedi; başlatma durduruldu.",
  ],
  "Startup restoration failed": [
    "Startup restoration failed.",
    "Başlangıç durumu geri yüklenemedi.",
  ],
  "Startup state restoration failed": [
    "Saved startup state could not be restored.",
    "Kayıtlı başlangıç durumu geri yüklenemedi.",
  ],
  "Startup notification delivery failed; security remains operational": [
    "Startup notification failed; security remains operational.",
    "Açılış bildirimi gönderilemedi; güvenlik çalışmaya devam ediyor.",
  ],
  "Gateway disconnected; protection coverage degraded until reconnect": [
    "Gateway disconnected; protection coverage degraded until reconnect.",
    "Gateway bağlantısı kesildi; yeniden bağlanana kadar koruma kapsamı kısıtlı.",
  ],
  "Unauthorized interaction response unavailable": [
    "Unauthorized interaction could not be acknowledged.",
    "Yetkisiz etkileşime yanıt verilemedi.",
  ],
  "Unauthorized management interaction denied": [
    "Unauthorized management interaction denied.",
    "Yetkisiz yönetim etkileşimi reddedildi.",
  ],
  "Guard interaction failed": [
    "Guard interaction failed.",
    "Guard etkileşimi başarısız.",
  ],
  "Containment failed or incomplete": [
    "Containment failed or is incomplete.",
    "Yetki kısıtlama başarısız veya eksik.",
  ],
  "Prior security log send is uncertain; duplicate suppressed": [
    "Previous log delivery is uncertain; duplicate send prevented.",
    "Önceki günlük teslimi belirsiz; yinelenen gönderim engellendi.",
  ],
  "Security log delivery failed; durable activity remains available": [
    "Discord log delivery failed; saved activity remains available.",
    "Discord günlüğü gönderilemedi; kayıtlı etkinlik korunuyor.",
  ],
  "Invalid source bot profile; security remains operational. Edit src/configuration/bot-profile.ts and restart.":
    [
      "Invalid source profile; edit src/configuration/bot-profile.ts and restart. Security continues.",
      "Koddaki profil geçersiz; src/configuration/bot-profile.ts dosyasını düzenleyip yeniden başlatın. Güvenlik devam ediyor.",
    ],
  "Application description synchronization disabled; manage it in Discord Developer Portal → General Information → Description.":
    [
      "Application description synchronization disabled; edit it in Developer Portal → General Information → Description.",
      "Uygulama açıklaması eşitlemesi kapalı; Developer Portal → General Information → Description bölümünden düzenleyin.",
    ],
  "Application description synchronization failed; no successful update is claimed. Manual fallback: Discord Developer Portal → General Information → Description.":
    [
      "Application description update failed; use Developer Portal → General Information → Description.",
      "Uygulama açıklaması güncellenemedi; Developer Portal → General Information → Description bölümünden düzenleyin.",
    ],
  "Startup complete": [
    "Ultimate Guard is operational.",
    "Ultimate Guard aktif.",
  ],
  "Database initialized": [
    "SQLite connected; migrations completed.",
    "SQLite bağlantısı kuruldu; geçişler tamamlandı.",
  ],
  "Saved configuration restored": [
    "Saved settings restored.",
    "Kayıtlı ayarlar yüklendi.",
  ],
  "Shutdown complete": ["Shutdown complete.", "Kapatma tamamlandı."],
  "Shutdown failed": ["Shutdown failed.", "Kapatma başarısız."],
  "Startup failed": [
    "Startup failed; protection readiness is unconfirmed.",
    "Başlatma başarısız; koruma hazırlığı doğrulanamadı.",
  ],
  "Discord client error": [
    "Discord connection error.",
    "Discord bağlantı hatası.",
  ],
  "Discord warning": ["Discord warning.", "Discord uyarısı."],
  "Gateway resumed": [
    "Gateway connection resumed.",
    "Gateway bağlantısı sürdürüldü.",
  ],
  "Gateway disconnected": [
    "Gateway disconnected.",
    "Gateway bağlantısı kesildi.",
  ],
  "Gateway reconnecting": [
    "Gateway reconnecting.",
    "Gateway yeniden bağlanıyor.",
  ],
  "Discord handler failed": [
    "Discord event handler failed.",
    "Discord olay işleyicisi başarısız.",
  ],
  "Audit fallback unavailable": [
    "Audit attribution fallback is unavailable.",
    "Alternatif denetim kaydı doğrulaması kullanılamıyor.",
  ],
  "Maintenance failed": [
    "Guild maintenance failed.",
    "Sunucu bakımı başarısız.",
  ],
  "Maintenance dependency failure": [
    "Maintenance dependency unavailable.",
    "Bakım bağımlılığı kullanılamıyor.",
  ],
  "Optional runtime feature initialization failed; security remains operational":
    [
      "An optional feature failed; security remains operational.",
      "İsteğe bağlı özellik başlatılamadı; güvenlik çalışmaya devam ediyor.",
    ],
  "Voice configuration unavailable": [
    "Saved voice configuration is unavailable.",
    "Kayıtlı ses ayarlarına erişilemiyor.",
  ],
  "Voice connection error": [
    "Voice connection error.",
    "Ses bağlantısı hatası.",
  ],
  "Voice connection attempt failed": [
    "Voice connection attempt failed.",
    "Ses kanalına bağlantı denemesi başarısız.",
  ],
  "Voice retry scheduling failed": [
    "Voice retry could not be scheduled.",
    "Ses bağlantısı yeniden denemesi planlanamadı.",
  ],
  "Voice auto-join unavailable": [
    "Automatic voice connection unavailable.",
    "Otomatik ses bağlantısı kullanılamıyor.",
  ],
  "Voice operation failed; security remains operational": [
    "Voice operation failed; security remains operational.",
    "Ses işlemi başarısız; güvenlik çalışmaya devam ediyor.",
  ],
  "Voice event handler failed; security remains operational": [
    "Voice event handler failed; security remains operational.",
    "Ses olay işleyicisi başarısız; güvenlik çalışmaya devam ediyor.",
  ],
  "Deleted voice channel handling failed": [
    "Deleted voice channel could not be handled.",
    "Silinen ses kanalı işlenemedi.",
  ],
  "Source presence initialization failed; security remains operational": [
    "Source profile could not be applied; security continues.",
    "Koddaki profil uygulanamadı; güvenlik devam ediyor.",
  ],
  "Source profile readiness handler failed; security remains operational": [
    "Source profile readiness failed; security continues.",
    "Kod profili hazırlığı başarısız; güvenlik devam ediyor.",
  ],
  "Application description unchanged; no update required.": [
    "Application description is already current.",
    "Uygulama açıklaması zaten güncel.",
  ],
  "Application description synchronized from source configuration; Discord clients may require refresh.":
    [
      "Application description synchronized from code.",
      "Uygulama açıklaması koddan eşitlendi.",
    ],
  "Permanent panel refresh failed; security continues": [
    "Permanent panel refresh failed; security continues.",
    "Kalıcı panel güncellenemedi; güvenlik devam ediyor.",
  ],
  "Permanent panel unavailable after startup; owner recreation is required": [
    "Saved panel unavailable; owner recovery is required.",
    "Kayıtlı panel kullanılamıyor; bot sahibinin kurtarma işlemi gerekiyor.",
  ],
  "Previous panel could not be retired; its routes are no longer registered": [
    "Previous panel could not be retired; its controls are disabled.",
    "Önceki panel kaldırılamadı; kontrolleri devre dışı.",
  ],
  "Permanent panel interaction failed": [
    "Permanent panel interaction failed.",
    "Kalıcı panel etkileşimi başarısız.",
  ],
  "Recovery failed; inspect persistent job": [
    "Recovery failed; inspect the saved recovery job.",
    "Kurtarma başarısız; kayıtlı kurtarma işini inceleyin.",
  ],
  "Anti-nuke rollback failed": [
    "Automatic rollback failed.",
    "Otomatik geri alma başarısız.",
  ],
  "Startup notification sent": [
    "Startup notification sent.",
    "Açılış bildirimi gönderildi.",
  ],
  "Startup notification failed": [
    "Startup notification could not be delivered.",
    "Açılış bildirimi gönderilemedi.",
  ],
  "Startup notification unavailable": [
    "Startup notification destination unavailable.",
    "Açılış bildirimi hedefi kullanılamıyor.",
  ],
};

export function consoleMessage(message: string, language: "tr" | "en"): string {
  const pair = Object.hasOwn(messages, message) ? messages[message] : undefined;
  return pair?.[language === "tr" ? 1 : 0] ?? message;
}
