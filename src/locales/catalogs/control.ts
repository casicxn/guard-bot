const rows: Record<string, [string, string]> = {
  "control.title": [
    "ULTIMATE GUARD — SECURITY CENTER",
    "ULTIMATE GUARD — GÜVENLİK MERKEZİ",
  ],
  "control.section.overview": ["Security Center", "Güvenlik Merkezi"],
  "control.section.modules": ["Protections", "Korumalar"],
  "control.section.limits": ["Security Limits", "Güvenlik Limitleri"],
  "control.section.whitelist": ["Whitelist", "Whitelist"],
  "control.section.backups": ["Backup & Restore", "Yedekleme ve Kurtarma"],
  "control.section.incidents": ["Security Incidents", "Güvenlik Olayları"],
  "control.section.presence": [
    "Bot Profile (Read-only)",
    "Bot Profili (Salt Okunur)",
  ],
  "control.section.voice": ["Voice Connection", "Ses Bağlantısı"],
  "control.section.settings": ["General Settings", "Genel Ayarlar"],
  "control.section.health": ["System Health", "Sistem Sağlığı"],
  "control.section.help": ["Help", "Yardım"],
  "control.main": ["Main Menu", "Ana Menü"],
  "control.refresh": ["Refresh", "Yenile"],
  "control.navigation": ["Choose a section", "Bölüm seçin"],
  "control.ownerOnly": [
    "Instance-owner controls · page {page}",
    "Bot sahibine özel · sayfa {page}",
  ],
  "control.overview": [
    "Server: **{server}**\nSecurity mode: **{mode}**\nAutomatic response: **{response}**\nEnabled protections: **{enabled}/{total}**\nIncidents in 24 hours: **{incidents}**\nHealth: **{health}**\nLanguage: **{language}**\nBot status: **{presence}**\nVoice: **{voice}**\n\n{warning}",
    "Sunucu: **{server}**\nGüvenlik modu: **{mode}**\nOtomatik yanıt: **{response}**\nAçık korumalar: **{enabled}/{total}**\n24 saatteki olaylar: **{incidents}**\nSağlık: **{health}**\nDil: **{language}**\nBot durumu: **{presence}**\nSes: **{voice}**\n\n{warning}",
  ],
  "control.group": ["Choose a protection category", "Koruma kategorisi seçin"],
  "control.group.all": ["All protections", "Tüm korumalar"],
  "control.group.channels": ["Channel Protection", "Kanal Koruması"],
  "control.group.roles": ["Role Protection", "Rol Koruması"],
  "control.group.members": ["Member Protection", "Üye Koruması"],
  "control.group.guild": ["Server Protection", "Sunucu Koruması"],
  "control.group.webhooks": ["Webhook Protection", "Webhook Koruması"],
  "control.group.integrations": [
    "Integration Protection",
    "Entegrasyon Koruması",
  ],
  "control.group.raids": ["Raid Monitoring", "Raid İzleme"],
  "control.group.other": [
    "Other supported protections",
    "Diğer desteklenen korumalar",
  ],
  "control.moduleMode": ["Change Mode", "Modu Değiştir"],
  "control.moduleResponse": ["Configure Response", "Yanıtı Yapılandır"],
  "control.moduleRecovery": ["Recovery Settings", "Kurtarma Ayarları"],
  "control.moduleChoose": ["Choose a protection", "Koruma seçin"],
  "control.recoveryHeading": ["Recovery capability", "Kurtarma desteği"],
  "control.recoveryLimited": [
    "Only supported audited role or server fields can be reversed after a fresh-state check. Other fields may be refused. Choose Reverse supported changes as the response to use this capability.",
    "Yalnızca desteklenen audit alanları güncel durum kontrolünden sonra geri alınabilir. Diğer alanlar reddedilebilir. Bu özellik için yanıt olarak Desteklenen değişiklikleri geri al seçin.",
  ],
  "control.recoveryStructure": [
    "Supported role/channel structure can be restored from a backup after preview and confirmation. Deleted IDs, messages and memberships are not recovered. Automatic structural restoration is not implemented.",
    "Desteklenen rol/kanal yapısı yedekten önizleme ve onayla geri yüklenebilir. Silinmiş kimlikler, mesajlar ve üyelikler kurtarılmaz. Otomatik yapısal geri yükleme uygulanmaz.",
  ],
  "control.recoveryNone": [
    "This protection records activity and may apply its configured response. This resource has no supported automatic recovery.",
    "Bu koruma hareketleri kaydeder ve seçili yanıtı uygulayabilir. Bu kaynak için desteklenen otomatik kurtarma yoktur.",
  ],
  "control.recoveryConfigured": [
    "Current response: {action}",
    "Güncel yanıt: {action}",
  ],
  "control.openBackups": ["Open Backups", "Yedekleri Aç"],
  "control.confirmTitle": [
    "Confirm sensitive change",
    "Hassas Değişikliği Onaylayın",
  ],
  "control.confirmConfig": [
    "The following settings will change:\n\n{summary}\n\nThis can enable active moderation. Review permissions and trusted subjects before confirming.",
    "Şu ayarlar değişecek:\n\n{summary}\n\nBu işlem aktif müdahaleyi açabilir. Onaylamadan önce yetkileri ve güvenilir kişileri kontrol edin.",
  ],
  "control.stale": [
    "Settings changed while this confirmation was open. Refresh the panel and review the new values. Nothing was applied.",
    "Bu onay açıkken ayarlar değişti. Paneli yenileyip yeni değerleri inceleyin. Değişiklik uygulanmadı.",
  ],
  "control.cancelled": [
    "Cancelled. No requested changes were applied.",
    "İptal edildi. İstenen değişiklikler uygulanmadı.",
  ],
  "control.whitelistIntro": [
    "New entries exempt a user or role from all guard protections. This never grants management access: only BOT_OWNER_ID controls this instance. Existing limited entries are not expanded without a separate confirmation.",
    "Yeni kayıt, kullanıcı veya rolü tüm Guard korumalarından muaf tutar. Yönetim yetkisi vermez: bu botu yalnızca BOT_OWNER_ID yönetir. Mevcut sınırlı kayıtlar ayrı onay olmadan genişletilmez.",
  ],
  "control.whitelistAdded": [
    "Added: {date} · Added by: {actor}",
    "Ekleme: {date} · Ekleyen: {actor}",
  ],
  "control.legacyUnknown": [
    "Not recorded for this older entry",
    "Bu eski kayıtta tutulmamış",
  ],
  "control.removeChoose": [
    "Choose an existing trusted entry to remove",
    "Kaldırılacak mevcut güvenilir kaydı seçin",
  ],
  "control.removeConfirm": [
    "Remove whitelist access for {subject}? This revokes its saved exemptions.",
    "{subject} için whitelist erişimi kaldırılsın mı? Kaydedilmiş muafiyetleri iptal edilir.",
  ],
  "control.upgradeConfirm": [
    "This subject already has limited or expiring access. Confirm to replace only this subject’s access with permanent all-module trust.\n\n{subject}",
    "Bu hedefin sınırlı veya süreli erişimi var. Yalnızca bu hedefin erişimini tüm korumalara süresiz güven olarak değiştirmek için onaylayın.\n\n{subject}",
  ],
  "control.backupDetails": [
    "Backup: {id}\nCreated: {date}\nRoles: {roles}\nChannels: {channels}\n\nChoose what to restore, then read the preview before confirmation.",
    "Yedek: {id}\nOluşturma: {date}\nRoller: {roles}\nKanallar: {channels}\n\nGeri yüklenecekleri seçin; onaydan önce önizlemeyi okuyun.",
  ],
  "control.backupScope": [
    "Choose what to restore",
    "Geri yüklenecekleri seçin",
  ],
  "control.backupPreview": ["Preview Restore", "Geri Yüklemeyi Önizle"],
  "control.backupDelete": ["Delete Backup", "Yedeği Sil"],
  "control.backupDeleteConfirm": [
    "Delete backup {id}? Existing server resources and recovery journals will not be deleted.",
    "{id} yedeği silinsin mi? Mevcut sunucu kaynakları ve kurtarma işlem kayıtları silinmez.",
  ],
  "control.backupDeleted": [
    "The selected backup was deleted.",
    "Seçili yedek silindi.",
  ],
  "control.backupJobs": ["Recovery Results", "Kurtarma Sonuçları"],
  "control.jobSelect": ["Choose a recovery operation", "Kurtarma işlemi seçin"],
  "control.jobsEmpty": [
    "No recovery operations are recorded.",
    "Kaydedilmiş kurtarma işlemi yok.",
  ],
  "control.incidentFilter": [
    "Filter recorded incidents",
    "Kayıtlı olayları filtrele",
  ],
  "control.filter.all": ["All incidents", "Tüm olaylar"],
  "control.filter.critical": ["Critical incidents", "Kritik olaylar"],
  "control.filter.unresolved": [
    "Unknown / Not Confirmed",
    "Bilinmiyor / Doğrulanmadı",
  ],
  "control.filter.failed": ["Failed responses", "Başarısız yanıtlar"],
  "control.presenceIntro": [
    "Bot presence is global and read-only in Discord. Edit src/configuration/bot-profile.ts and restart to change the profile; the configured values apply when the bot becomes ready.",
    "Bot görünümü tüm sunucular için ortaktır ve Discord içinde salt okunurdur. Profili değiştirmek için src/configuration/bot-profile.ts dosyasını düzenleyip yeniden başlatın; değerler bot hazır olduğunda uygulanır.",
  ],
  "control.presenceBody": [
    "Runtime status: **{status}**\nActivity: **{type}**\nText: {text}\nApplied in this runtime: {applied}\n\n{intro}\n\nDiscord bots support custom status text through the activity state. The official API does not permit bot custom-status emoji fields.",
    "Çalışma durumu: **{status}**\nEtkinlik: **{type}**\nMetin: {text}\nBu oturumda uygulandı: {applied}\n\n{intro}\n\nDiscord botları özel durum metnini etkinlik state alanıyla destekler. Resmî API botların özel durum emoji alanını ayarlamasına izin vermez.",
  ],
  "control.presenceStatus": ["Choose online status", "Çevrimiçi durumu seçin"],
  "control.presenceActivity": ["Choose activity type", "Etkinlik türünü seçin"],
  "control.presenceText": ["Edit Activity Text", "Etkinlik Metnini Düzenle"],
  "control.presenceTextTitle": ["Activity text", "Etkinlik metni"],
  "control.presenceTextField": [
    "Text shown on Discord (1–128 characters)",
    "Discord metni (1–128 karakter)",
  ],
  "control.presenceRemove": ["Remove Activity", "Etkinliği Kaldır"],
  "control.presenceReset": ["Reset Presence", "Görünümü Sıfırla"],
  "control.presenceResetConfirm": [
    "Reset the global bot presence to its default? This affects all servers.",
    "Botun ortak görünümü varsayılana döndürülsün mü? Tüm sunucuları etkiler.",
  ],
  "control.presence.status.online": ["Online", "Çevrimiçi"],
  "control.presence.status.idle": ["Idle", "Boşta"],
  "control.presence.status.dnd": ["Do Not Disturb", "Rahatsız Etmeyin"],
  "control.presence.status.invisible": ["Invisible", "Görünmez"],
  "control.presence.status.offline": ["Offline", "Çevrimdışı"],
  "control.presence.activity.playing": ["Playing", "Oynuyor"],
  "control.presence.activity.watching": ["Watching", "İzliyor"],
  "control.presence.activity.listening": ["Listening", "Dinliyor"],
  "control.presence.activity.competing": ["Competing", "Yarışıyor"],
  "control.presence.activity.custom": ["Custom Status", "Özel Durum"],
  "control.presence.activity.none": ["No Activity", "Etkinlik Yok"],
  "control.voiceBody": [
    "Selected channel: {selected}\nConnection: **{state}**\nConnected channel: {connected}\nAuto Join: {auto}\nSelf Mute: {mute}\nSelf Deaf: {deaf}\nRetry attempts: {retry}\nManual-disconnect pause: {paused}\n{reason}\n\nThe bot neither plays nor records audio. Manual Disconnect persists until Connect/Reconnect or explicit Auto Join enable. Connections require this process to remain running.",
    "Seçili kanal: {selected}\nBağlantı: **{state}**\nBağlı kanal: {connected}\nOtomatik Katılma: {auto}\nKendi Mikrofonu Kapalı: {mute}\nKendi Sesi Kapalı: {deaf}\nTekrar denemesi: {retry}\nManuel ayrılma duraklaması: {paused}\n{reason}\n\nBot ses oynatmaz ve kaydetmez. Manuel Ayrılma, Bağlan/Yeniden Bağlan veya açıkça Otomatik Katılmayı açana kadar korunur. Bağlantı için süreç çalışıyor olmalıdır.",
  ],
  "control.voiceChoose": [
    "Choose a voice channel in this server",
    "Bu sunucudan ses kanalı seçin",
  ],
  "control.voiceChooseHelp": [
    "The channel list opens in Discord. If it does not open, use Enter Voice Channel ID. Enable Developer Mode in Discord, right-click the voice channel and choose Copy Channel ID. Saving the channel does not prove a successful connection; check Connection above.",
    "Kanal listesini Discord açar. Liste açılmıyorsa Ses Kanalı Kimliği Gir düğmesini kullanın. Discord'da Geliştirici Modu'nu açın, ses kanalına sağ tıklayıp Kanal Kimliğini Kopyala'yı seçin. Kanalın kaydedilmesi bağlantının kurulduğu anlamına gelmez; yukarıdaki Bağlantı durumunu kontrol edin.",
  ],
  "control.voiceAction": [
    "Voice connection controls",
    "Ses bağlantısı işlemleri",
  ],
  "control.voice.auto-on": ["Enable Auto Join", "Otomatik Katılmayı Aç"],
  "control.voice.auto-off": ["Disable Auto Join", "Otomatik Katılmayı Kapat"],
  "control.voice.connect": ["Connect Now", "Şimdi Bağlan"],
  "control.voice.disconnect": ["Disconnect", "Ayrıl"],
  "control.voice.reconnect": ["Reconnect", "Yeniden Bağlan"],
  "control.voice.mute": ["Toggle Self Mute", "Mikrofonu Aç/Kapat"],
  "control.voice.deaf": ["Toggle Self Deaf", "Sesi Aç/Kapat"],
  "control.voice.id": ["Enter Voice Channel ID", "Ses Kanalı Kimliği Gir"],
  "control.voiceIdTitle": ["Voice channel", "Ses kanalı"],
  "control.voiceIdField": [
    "Voice channel ID in this server",
    "Bu sunucudaki ses kanalının kimliği",
  ],
  "control.voice.needsReview": [
    "Review the connection settings and permissions.",
    "Bağlantı ayarlarını ve yetkileri kontrol edin.",
  ],
  "control.voice.state.disconnected": ["Disconnected", "Bağlı değil"],
  "control.voice.state.connecting": ["Connecting", "Bağlanıyor"],
  "control.voice.state.ready": ["Connected", "Bağlı"],
  "control.voice.state.retrying": ["Retrying", "Yeniden deneniyor"],
  "control.voice.state.blocked": ["Needs attention", "Dikkat gerekiyor"],
  "control.settingsBody": [
    "Language: {language}\nGlobal security mode: {mode}\nDiscord security notices: {notifications}\nLog channel: {channel}\n\nThe configured bot owner alone can administer this instance. Guild ownership, Administrator and whitelist do not grant access.",
    "Dil: {language}\nGenel güvenlik modu: {mode}\nDiscord güvenlik bildirimleri: {notifications}\nKayıt kanalı: {channel}\n\nBu botu yalnızca yapılandırılmış bot sahibi yönetebilir. Sunucu sahipliği, Administrator ve whitelist erişim vermez.",
  ],
  "control.logChannel": [
    "Select a security notice channel",
    "Güvenlik bildirim kanalı seçin",
  ],
  "control.securityMode": ["Security Mode", "Güvenlik Modu"],
  "control.notifications": ["Toggle Notifications", "Bildirimleri Aç/Kapat"],
  "control.reset": ["Reset Guard Settings", "Guard Ayarlarını Sıfırla"],
  "control.resetConfirm": [
    "Reset this server’s guard settings to Monitor defaults? Existing whitelist entries, backups, incidents, saved language, presence, voice and active emergency verification remain intact. Restore the verification level separately through Security Mode.",
    "Bu sunucunun Guard ayarları İzleme varsayılanlarına döndürülsün mü? Mevcut whitelist kayıtları, yedekler, olaylar, dil, görünüm, ses ve etkin acil doğrulama korunur. Doğrulama seviyesini Güvenlik Modu bölümünden ayrıca geri alın.",
  ],
  "control.developer": ["Developer Information", "Geliştirici Bilgisi"],
  "control.developerBody": [
    "Ultimate Guard is developed by Casi. The developer signature grants no privileges; management is restricted to the configured BOT_OWNER_ID. Discord server owners retain their real platform permissions, including removing the bot.",
    "Ultimate Guard, Casi tarafından geliştirilmiştir. Geliştirici imzası yetki vermez; yönetim yalnızca yapılandırılmış BOT_OWNER_ID ile sınırlıdır. Discord sunucu sahipleri botu kaldırma dahil gerçek platform yetkilerini korur.",
  ],
  "control.healthExtra": [
    "Connection ready: {ready}\nUptime: {uptime}\nDatabase: {database}\nPresence: {presence}\nVoice: {voice}\nVoice States intent: {voiceIntent}\n\nSecurity event handling runs independently of the owner being online. Permission or gateway failures can limit coverage.",
    "Bağlantı hazır: {ready}\nÇalışma süresi: {uptime}\nVeritabanı: {database}\nGörünüm: {presence}\nSes: {voice}\nSes Durumları intenti: {voiceIntent}\n\nGüvenlik olayları sahibin çevrimiçi olmasından bağımsız işlenir. Yetki veya gateway hataları kapsamı sınırlayabilir.",
  ],
  "control.databaseReady": ["Readable", "Okunabiliyor"],
  "control.uptime": ["{seconds} seconds", "{seconds} saniye"],
  "control.help": [
    "Only the configured BOT_OWNER_ID may manage this bot in any server. Whitelist never grants management access.\n\nMonitor records activity without automatic punishment. Open Security Overview and confirm Enable Protection for the first-action administrative profile: containment followed by safe supported rollback. The global profile overrides saved module flags and thresholds. Switch to Monitor stops automatic effects. Discord permissions and trustworthy attribution remain mandatory.\n\nChoose Protections to read each module’s purpose, response and real recovery capabilities. Security Limits uses named selections and numerical forms. Optional raid modules only observe.\n\nWhitelist adds users/roles with all-module access; expanding an older limited entry and removing entries require confirmation.\n\nBackups preserve supported structure. Select a snapshot, choose a scope, review the preview and confirm. Deleted IDs/messages/membership history cannot be recreated.\n\nBot profile, status, activity and About Me are configured globally in src/configuration/bot-profile.ts, applied on restart and shown read-only here. Voice settings remain editable per server. Manual voice disconnect pauses auto-reconnect, including after restart. The bot must be running to stay connected.\n\nGeneral Settings provides language, log channel, security mode, notifications and guarded reset. Native command names follow your Discord client locale; responses follow the server language.\n\nUse System Health to inspect permissions and intents. Voice needs View Channel, Connect and GuildVoiceStates. The bot’s highest role must exceed roles it manages.",
    "Bu botu tüm sunucularda yalnızca yapılandırılmış BOT_OWNER_ID yönetir. Whitelist yönetim erişimi vermez.\n\nİzleme hareketleri otomatik ceza olmadan kaydeder. Güvenlik Özeti bölümündeki Korumayı Aktifleştir düğmesini onaylayın: ilk doğrulanmış yönetim ihlalinde yetki kaldırma ve güvenli desteklenen geri alma uygulanır. Genel profil kaydedilmiş modül kapatma/eşik tercihlerini aşar. İzleme moduna geçmek otomatik etkileri durdurur; Discord izinleri ve güvenilir kimlik doğrulama zorunludur.\n\nHer modülün işlevini, yanıtını ve gerçek kurtarma desteğini Korumalar bölümünden okuyun. Güvenlik Limitleri, isimle seçim ve sayısal form kullanır. Raid modülleri yalnızca gözlemler.\n\nWhitelist kullanıcı/rollere tüm korumalarda erişim verir; eski sınırlı kaydı genişletme ve kayıt kaldırma onay gerektirir.\n\nYedekler desteklenen yapıyı korur. Bir yedek ve kapsam seçin; önizlemeyi okuyup onaylayın. Silinmiş kimlikler/mesajlar/üyelik geçmişi aynen kurulamaz.\n\nBot profili, durum, etkinlik ve Hakkımda bilgisi src/configuration/bot-profile.ts dosyasından ortak olarak yapılandırılır; yeniden başlatmada uygulanır ve burada salt okunur gösterilir. Ses ayarları sunucuya özel olarak düzenlenebilir. Manuel ayrılma yeniden başlatma dahil otomatik bağlanmayı duraklatır. Ses kanalında kalmak için bot çalışmalıdır.\n\nGenel Ayarlar dil, günlük kanalı, güvenlik modu, bildirimler ve onaylı sıfırlama sunar. Komut adları Discord istemci diline, yanıtlar sunucu diline bağlıdır.\n\nYetkileri ve intentleri Sistem Sağlığı bölümünden kontrol edin. Ses için Kanalı Görüntüle, Bağlan ve GuildVoiceStates gerekir. Botun rolü yönettiği rollerin üstünde olmalıdır.",
  ],
};
rows["control.lockdownBody"] = [
  "Emergency verification: {state}. Enabling raises server verification to Very High; disabling restores the saved level. Existing members are not frozen.",
  "Acil doğrulama: {state}. Açmak sunucu doğrulamasını Çok Yüksek seviyesine çıkarır; kapatmak kaydedilen seviyeyi geri getirir. Mevcut üyeler dondurulmaz.",
];
rows["control.lockdownEnable"] = [
  "Enable Emergency Verification",
  "Acil Doğrulamayı Aç",
];
rows["control.lockdownDisable"] = [
  "Restore Verification Level",
  "Doğrulama Seviyesini Geri Al",
];
rows["control.lockdownConfirm"] = [
  "Apply the emergency verification change? This changes the server verification level and requires Manage Server permission.",
  "Acil doğrulama değişikliği uygulansın mı? Bu işlem sunucu doğrulama seviyesini değiştirir ve Sunucuyu Yönet yetkisi gerektirir.",
];
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[1]]),
);
