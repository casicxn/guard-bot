export const en: Record<string, string> = {
  "panel.section.overview": "Security Overview",
  "panel.section.modules": "Protection Settings",
  "panel.section.whitelist": "Whitelist Management",
  "panel.section.backups": "Backup & Restore",
  "panel.section.incidents": "Incident History",
  "panel.section.settings": "General Settings",
  "panel.section.health": "System Health",
  "panel.section.help": "Help",
  "panel.title": "Ultimate Guard · {section}",
  "panel.navigation": "Choose a section",
  "panel.back": "Back to overview",
  "panel.session":
    "Page {page} · Owner-only · Controls expire after 10 minutes",
  "panel.overview":
    "Automatic response: **{response}**\nSecurity mode: **{mode}**\nEnabled protections: **{enabled}/{total}**\nIncidents in the last 24 hours: **{incidents}**\nBot permission health: **{health}**\nLanguage: **{language}**\nLog channel: {channel}\n\n{warning}",
  "panel.configured": "Configured",
  "panel.monitoring": "Monitoring only",
  "panel.healthy": "Healthy",
  "panel.degraded": "Needs attention",
  "panel.notConfigured": "Not configured",
  "panel.overviewSafe":
    "Monitoring records activity without punishment. The confirmed global Protect profile handles the first unauthorized administrative action, subject to reliable attribution, exemptions and Discord permissions.",
  "panel.overviewWarning":
    "Some protections are unavailable. Open System Health to see missing permissions or intents.",
  "panel.modulesIntro":
    "Choose a protection to read what it does and configure its response. No internal identifiers are required.",
  "panel.moduleSelect": "Choose a protection",
  "panel.moduleBody":
    "{description}\n\nEnabled: **{enabled}**\nMode: **{mode}**\nResponse: **{action}**\n\n{threshold}\n\n{warning}",
  "panel.threshold":
    "If a user performs **{count}** matching actions within **{seconds} seconds**, the configured security response is triggered when attribution and permission checks pass.",
  "panel.thresholdJoin":
    "If **{count}** members join within **{seconds} seconds**, a raid observation is recorded.",
  "panel.thresholdMessage":
    "If a member sends **{count}** messages within **{seconds} seconds**, a spam observation is recorded.",
  "panel.thresholdMention":
    "If a member makes **{count}** mentions within **{seconds} seconds**, a mention observation is recorded.",
  "panel.accountRule":
    "Accounts less than 7 days old are observed on joining. This protection has no configurable action threshold.",
  "panel.raidOnly":
    "This optional protection only monitors. It never automatically punishes joining members or message authors.",
  "panel.protectGates":
    "Automatic responses also require global Protect mode. Missing permissions, uncertain attribution, trusted principals and protected owners prevent enforcement.",
  "panel.editLimits": "Edit action limit",
  "panel.enable": "Enable protection",
  "panel.disable": "Disable protection",
  "panel.moduleMode": "Protection mode",
  "panel.moduleAction": "Security response",
  "panel.moduleSaved": "Protection settings saved.",
  "panel.limitTitle": "Action limit",
  "panel.limitCount": "Maximum matching actions (1–10000)",
  "panel.limitSeconds": "Time window in seconds (1–86400)",
  "panel.limitCountError":
    "The action limit must be a whole number from 1 to 10000. Example: 5.",
  "panel.limitSecondsError":
    "The time window must be a whole number from 1 to 86400 seconds. Example: 60.",
  "panel.noThreshold":
    "This protection does not have an editable action threshold.",
  "panel.whitelistIntro":
    "Trusted users, bots and roles can bypass all guard protections. Add only people and roles you fully trust. Existing advanced entries retain their original scope.",
  "panel.whitelistAll": "All protection modules",
  "panel.whitelistSelected": "Selected protections ({count})",
  "panel.whitelistExpires": "Expires: {date}",
  "panel.whitelistPermanent": "No expiry",
  "panel.whitelistExpired": "Expired",
  "panel.whitelistRow":
    "{subject} · {type}\nAccess: {access} · {status}\n{expiry}",
  "panel.whitelistRemove": "Remove a trusted subject",
  "panel.whitelistRemoveTitle": "Remove whitelist access",
  "panel.subject": "User or role ID",
  "panel.subjectExample": "Example: 123456789012345678",
  "panel.backupsIntro":
    "Create a backup before changing your server. Restore first shows a preview and always requires your confirmation. Missing resources receive new IDs; messages and memberships cannot be restored.",
  "panel.backupsEmpty":
    "No backups yet. Use Create backup to save your supported server structure.",
  "panel.backupCreate": "Create backup",
  "panel.backupChoose": "Choose a backup to preview restoration",
  "panel.backupLabel": "Backup · {date}",
  "panel.backupCreated": "Backup created",
  "panel.backupCreatedBody":
    "Your supported server structure has been saved.\nBackup reference: {id}",
  "panel.restorePreview": "Restore preview",
  "panel.restoreConfirm": "Confirm restore",
  "panel.restoreCancel": "Cancel restore",
  "panel.restoreDone": "Restore results",
  "panel.restoreCancelled": "Restoration cancelled. No changes were requested.",
  "panel.restoreLogs": "Read recovery results with /guard backup jobs.",
  "panel.backupMissing":
    "That backup is no longer available. Open Backup & Restore and select another one.",
  "panel.incidentsEmpty": "No incidents on this page.",
  "panel.settingsBody":
    "Language: **{language}**\nKeep incidents for: **{days} days**\nKeep backups: **{count}**\nAutomatic backup interval: **{hours} hours** (0 disables scheduling)\n\nChoose a language below. Responses follow the server language; slash-command names follow your Discord client language.",
  "panel.language": "Language / Dil",
  "panel.retention": "Backup schedule & retention",
  "panel.retentionTitle": "Schedule and retention",
  "panel.retentionDays": "Incident history days (1–3650)",
  "panel.retentionCount": "Backups to keep (1–100)",
  "panel.retentionHours": "Backup interval hours (0–8760)",
  "panel.retentionError":
    "Enter whole numbers: history 1–3650 days, 1–100 backups, interval 0–8760 hours. Use 0 to disable automatic backups.",
  "panel.settingsSaved": "Settings saved.",
  "panel.languageSaved": "Language updated.",
  "panel.healthBody":
    "Gateway latency: **{ping} ms**\nAudit monitoring: **{audit}**\nMissing permissions: {missing}\nUnavailable protections: {unavailable}\nBot’s highest role: {role}\nMember monitoring intent: {members}\nMessage monitoring intent: {messages}\n\nPermissions and role hierarchy are checked again before every security response. Message Content intent is not required for core protection.",
  "panel.healthUnavailable":
    "Permission information could not be checked. Verify the bot connection and try System Health again.",
  "panel.permission.ViewAuditLog": "View Audit Log",
  "panel.permission.ManageRoles": "Manage Roles",
  "panel.permission.ManageChannels": "Manage Channels",
  "panel.permission.BanMembers": "Ban Members",
  "panel.permission.KickMembers": "Kick Members",
  "panel.permission.ManageGuild": "Manage Server",
  "panel.permission.SendMessages": "Send Messages",
  "panel.permission.EmbedLinks": "Embed Links",
  "panel.helpBody":
    "**Monitor mode** records activity and incidents without automatic punishment.\n**Protect mode** allows the configured response only when both global and protection settings allow it, attribution is reliable and the bot has authority.\n**Whitelist** gives a trusted user, bot or role access to every protection. Only the configured bot owner can change it.\n**Action limits** count matching actions in a rolling time window. For example, 5 bans in 60 seconds. Select Protection Settings to read each protection’s purpose and edit limits.\n**Backups** save supported server structure. Open Backup & Restore to create one, preview a restore and explicitly confirm it. Missing resources have new IDs; messages and memberships are not restored.\n**Language** is selected in General Settings → Language.\n**Permissions** depend on the response: View Audit Log for monitoring; Manage Roles/Channels, Kick/Ban Members or Manage Server for matching actions. Keep the bot’s role above roles it must manage. System Health explains what is missing.",
  "panel.success": "Changes saved",
  "panel.error": "Unable to complete this action",
  "panel.modeSaved":
    "Security mode is now **{mode}**. Protection-specific settings and permission checks still apply.",
  "panel.setupSaved":
    "The guard is configured in **{mode}** mode. Open the panel to choose protections and trusted subjects.",
  "panel.lockdownEnabled":
    "Very High verification is enabled. Existing members are not frozen.",
  "panel.lockdownDisabled":
    "The previously saved verification level has been restored.",
  "panel.invalidModule":
    "Choose an available protection from the menu. Reopen /guard limits if the panel has expired.",
  "panel.invalidChoice":
    "That choice is no longer available. Reopen the panel and choose an option from the menu.",
  "panel.guildUnavailable":
    "This server is temporarily unavailable. Try /guard panel again after the bot reconnects.",
};
export const tr: Record<string, string> = {
  "panel.section.overview": "Güvenlik Özeti",
  "panel.section.modules": "Koruma Ayarları",
  "panel.section.whitelist": "Whitelist Yönetimi",
  "panel.section.backups": "Yedekleme ve Geri Yükleme",
  "panel.section.incidents": "Olay Geçmişi",
  "panel.section.settings": "Genel Ayarlar",
  "panel.section.health": "Sistem Sağlığı",
  "panel.section.help": "Yardım",
  "panel.title": "Ultimate Guard · {section}",
  "panel.navigation": "Bir bölüm seçin",
  "panel.back": "Güvenlik özetine dön",
  "panel.session":
    "Sayfa {page} · Yalnızca bot sahibi · Özel kontroller 10 dakika geçerlidir",
  "panel.overview":
    "Otomatik müdahale: **{response}**\nGüvenlik modu: **{mode}**\nEtkin korumalar: **{enabled}/{total}**\nSon 24 saatteki olaylar: **{incidents}**\nBot izin sağlığı: **{health}**\nDil: **{language}**\nKayıt kanalı: {channel}\n\n{warning}",
  "panel.configured": "Yapılandırılmış",
  "panel.monitoring": "Yalnızca izleme",
  "panel.healthy": "Sağlıklı",
  "panel.degraded": "Kontrol gerekiyor",
  "panel.notConfigured": "Ayarlanmamış",
  "panel.overviewSafe":
    "İzleme hareketleri ceza uygulamadan kaydeder. Onaylanmış genel Koruma profili, güvenilir kimlik doğrulama, muafiyetler ve Discord izinleri uygunsa ilk izinsiz yönetim işlemine müdahale eder.",
  "panel.overviewWarning":
    "Bazı korumalar kullanılamıyor. Eksik izinleri veya intent ayarlarını Sistem Sağlığı bölümünden inceleyin.",
  "panel.modulesIntro":
    "Ne yaptığını okumak ve müdahalesini ayarlamak için bir koruma seçin. Teknik koruma kimliklerini bilmeniz gerekmez.",
  "panel.moduleSelect": "Bir koruma seçin",
  "panel.moduleBody":
    "{description}\n\nEtkin: **{enabled}**\nMod: **{mode}**\nMüdahale: **{action}**\n\n{threshold}\n\n{warning}",
  "panel.threshold":
    "Bir kullanıcı **{seconds} saniye** içinde **{count}** eşleşen işlem yaparsa, işlem sorumlusu doğrulandığında ve izin kontrolleri geçtiğinde ayarlanan güvenlik müdahalesi uygulanır.",
  "panel.thresholdJoin":
    "**{seconds} saniye** içinde **{count}** üye katılırsa baskın gözlemi kaydedilir.",
  "panel.thresholdMessage":
    "Bir üye **{seconds} saniye** içinde **{count}** mesaj gönderirse spam gözlemi kaydedilir.",
  "panel.thresholdMention":
    "Bir üye **{seconds} saniye** içinde **{count}** etiketleme yaparsa aşırı etiketleme gözlemi kaydedilir.",
  "panel.accountRule":
    "Hesabı 7 günden yeni olan üyeler katılırken gözlemlenir. Bu koruma için işlem eşiği ayarlanmaz.",
  "panel.raidOnly":
    "Bu isteğe bağlı koruma yalnızca izler. Katılan üyelere veya mesaj yazarlarına otomatik ceza uygulamaz.",
  "panel.protectGates":
    "Otomatik müdahale için genel Koruma modu da açık olmalıdır. Eksik izinler, belirsiz işlem sorumlusu, güvenilir kişiler ve sunucu sahibi müdahaleyi engeller.",
  "panel.editLimits": "İşlem limitini düzenle",
  "panel.enable": "Korumayı etkinleştir",
  "panel.disable": "Korumayı devre dışı bırak",
  "panel.moduleMode": "Koruma modu",
  "panel.moduleAction": "Güvenlik müdahalesi",
  "panel.moduleSaved": "Koruma ayarları kaydedildi.",
  "panel.limitTitle": "İşlem Limiti",
  "panel.limitCount": "En fazla işlem sayısı (1–10000)",
  "panel.limitSeconds": "Zaman aralığı, saniye (1–86400)",
  "panel.limitCountError":
    "İşlem limiti 1 ile 10000 arasında bir tam sayı olmalıdır. Örnek: 5.",
  "panel.limitSecondsError":
    "Zaman aralığı 1 ile 86400 saniye arasında bir tam sayı olmalıdır. Örnek: 60.",
  "panel.noThreshold": "Bu korumada düzenlenebilir işlem eşiği bulunmuyor.",
  "panel.whitelistIntro":
    "Güvenilir kullanıcılar, botlar ve roller tüm korumaları aşabilir. Yalnızca tamamen güvendiğiniz kişi ve rolleri ekleyin. Mevcut gelişmiş kayıtların yetki kapsamı korunur.",
  "panel.whitelistAll": "Tüm korumalar",
  "panel.whitelistSelected": "Seçili korumalar ({count})",
  "panel.whitelistExpires": "Bitiş: {date}",
  "panel.whitelistPermanent": "Süresiz",
  "panel.whitelistExpired": "Süresi dolmuş",
  "panel.whitelistRow":
    "{subject} · {type}\nYetki: {access} · {status}\n{expiry}",
  "panel.whitelistRemove": "Güvenilir bir kaydı kaldır",
  "panel.whitelistRemoveTitle": "Whitelist Erişimini Kaldır",
  "panel.subject": "Kullanıcı veya rol ID’si",
  "panel.subjectExample": "Örnek: 123456789012345678",
  "panel.backupsIntro":
    "Sunucunuzu değiştirmeden önce yedek oluşturun. Geri yükleme önce önizleme gösterir ve mutlaka onayınızı ister. Eksik kaynaklar yeni kimlik alır; mesajlar ve üyelikler geri yüklenmez.",
  "panel.backupsEmpty":
    "Henüz yedek yok. Desteklenen sunucu yapısını kaydetmek için Yedek oluştur düğmesini kullanın.",
  "panel.backupCreate": "Yedek oluştur",
  "panel.backupChoose": "Geri yüklemeyi önizlemek için yedek seçin",
  "panel.backupLabel": "Yedek · {date}",
  "panel.backupCreated": "Yedek Oluşturuldu",
  "panel.backupCreatedBody":
    "Desteklenen sunucu yapısı kaydedildi.\nYedek referansı: {id}",
  "panel.restorePreview": "Geri Yükleme Önizlemesi",
  "panel.restoreConfirm": "Geri yüklemeyi onayla",
  "panel.restoreCancel": "Geri yüklemeyi iptal et",
  "panel.restoreDone": "Geri Yükleme Sonuçları",
  "panel.restoreCancelled":
    "Geri yükleme iptal edildi. Değişiklik isteği gönderilmedi.",
  "panel.restoreLogs":
    "Tam sonuçları /guard backup jobs komutuyla okuyabilirsiniz.",
  "panel.backupMissing":
    "Bu yedek artık kullanılamıyor. Yedekleme ve Geri Yükleme bölümünden başka bir yedek seçin.",
  "panel.incidentsEmpty": "Bu sayfada olay yok.",
  "panel.settingsBody":
    "Dil: **{language}**\nOlay saklama süresi: **{days} gün**\nSaklanacak yedek: **{count}**\nOtomatik yedek aralığı: **{hours} saat** (0 zamanlamayı kapatır)\n\nAşağıdan bir dil seçin. Yanıtlar sunucu diline, slash komut adları Discord istemcinizin diline göre gösterilir.",
  "panel.language": "Language / Dil",
  "panel.retention": "Yedek zamanı ve saklama süresi",
  "panel.retentionTitle": "Zamanlama ve Saklama",
  "panel.retentionDays": "Olay geçmişi, gün (1–3650)",
  "panel.retentionCount": "Saklanacak yedek sayısı (1–100)",
  "panel.retentionHours": "Yedek aralığı, saat (0–8760)",
  "panel.retentionError":
    "Tam sayılar girin: geçmiş 1–3650 gün, 1–100 yedek, aralık 0–8760 saat. Otomatik yedeklemeyi kapatmak için 0 girin.",
  "panel.settingsSaved": "Ayarlar kaydedildi.",
  "panel.languageSaved": "Dil güncellendi.",
  "panel.healthBody":
    "Ağ geçidi gecikmesi: **{ping} ms**\nAudit izleme: **{audit}**\nEksik izinler: {missing}\nKullanılamayan korumalar: {unavailable}\nBotun en yüksek rolü: {role}\nÜye izleme intent’i: {members}\nMesaj izleme intent’i: {messages}\n\nHer güvenlik müdahalesinden önce izinler ve rol sırası yeniden kontrol edilir. Temel koruma için Message Content intent’i gerekmez.",
  "panel.healthUnavailable":
    "İzin bilgileri kontrol edilemedi. Bot bağlantısını doğrulayıp Sistem Sağlığı bölümünü yeniden deneyin.",
  "panel.permission.ViewAuditLog": "Denetim Kaydını Görüntüle",
  "panel.permission.ManageRoles": "Rolleri Yönet",
  "panel.permission.ManageChannels": "Kanalları Yönet",
  "panel.permission.BanMembers": "Üyeleri Yasakla",
  "panel.permission.KickMembers": "Üyeleri At",
  "panel.permission.ManageGuild": "Sunucuyu Yönet",
  "panel.permission.SendMessages": "Mesaj Gönder",
  "panel.permission.EmbedLinks": "Bağlantı Yerleştir",
  "panel.helpBody":
    "**İzleme modu** etkinlikleri ve olayları kaydeder, otomatik ceza uygulamaz.\n**Koruma modu** yalnızca genel ayarlar ve seçili koruma izin verdiğinde, işlem sorumlusu doğrulandığında ve bot yetkili olduğunda ayarlanan müdahaleyi uygular.\n**Whitelist** güvenilir kullanıcıya, bota veya role tüm korumalar için erişim verir. Yalnızca yapılandırılmış bot sahibi değiştirebilir.\n**İşlem limitleri** kayan bir zaman aralığındaki eşleşen işlemleri sayar. Örnek: 60 saniyede 5 yasaklama. Her korumanın açıklaması ve limit ayarı Koruma Ayarları bölümündedir.\n**Yedekler** desteklenen sunucu yapısını kaydeder. Yedekleme ve Geri Yükleme bölümünden oluşturun; geri yüklemeden önce önizleyip açıkça onaylayın. Eksik kaynaklar yeni kimlik alır; mesajlar ve üyelikler geri yüklenmez.\n**Dil** Genel Ayarlar → Dil menüsünden seçilir.\n**İzinler** müdahaleye göre değişir: izleme için Denetim Kaydını Görüntüle; ilgili işlem için Rolleri/Kanalları Yönet, Üyeleri At/Yasakla veya Sunucuyu Yönet. Botun rolünü yönetmesi gereken rollerin üzerine yerleştirin. Sistem Sağlığı eksikleri açıklar.",
  "panel.success": "Değişiklikler Kaydedildi",
  "panel.error": "İşlem Tamamlanamadı",
  "panel.modeSaved":
    "Güvenlik modu **{mode}** olarak ayarlandı. Koruma ayarları ve izin kontrolleri uygulanmaya devam eder.",
  "panel.setupSaved":
    "Guard **{mode}** modunda yapılandırıldı. Korumaları ve güvenilir kişileri seçmek için paneli açın.",
  "panel.lockdownEnabled":
    "Çok Yüksek doğrulama açıldı. Mevcut üyeler dondurulmaz.",
  "panel.lockdownDisabled":
    "Önceden kaydedilen doğrulama düzeyi geri yüklendi.",
  "panel.invalidModule":
    "Menüden kullanılabilir bir koruma seçin. Panelin süresi dolduysa /guard limits komutunu yeniden açın.",
  "panel.invalidChoice":
    "Bu seçim artık kullanılamıyor. Paneli yeniden açıp menüden bir seçenek belirleyin.",
  "panel.guildUnavailable":
    "Bu sunucu geçici olarak kullanılamıyor. Bot yeniden bağlandıktan sonra /guard panel komutunu deneyin.",
};
