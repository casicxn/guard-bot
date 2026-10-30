const rows: Record<string, [string, string]> = {
  "persistent.overview": [
    "Server: **{server}**\nProtection: **{mode}**\nActive administrative protections: **{active}/{total}**\nUnavailable protections: **{unavailable}**\nWhitelisted members/bots: **{members}**\nWhitelisted roles: **{roles}**\nIncidents in 24 hours: **{recent}**\nLast confirmed incident: {last}\nTrusted backup ready: **{backup}**\nVoice: **{voice}**\nSystem health: **{health}**",
    "Sunucu: **{server}**\nKoruma: **{mode}**\nEtkin yönetim korumaları: **{active}/{total}**\nKullanılamayan koruma: **{unavailable}**\nWhitelist kullanıcı/bot: **{members}**\nWhitelist rol: **{roles}**\n24 saatteki olaylar: **{recent}**\nSon doğrulanmış olay: {last}\nGüvenilir yedek hazır: **{backup}**\nSes: **{voice}**\nSistem sağlığı: **{health}**",
  ],
  "persistent.healthSummary": [
    "Public health is shown on the overview. Detailed permissions and diagnostics are available privately to the owner.",
    "Genel sağlık ana özette gösterilir. Ayrıntılı izinler ve tanılama yalnızca sahibine özel olarak açılır.",
  ],
  "persistent.title": [
    "ULTIMATE GUARD\nSecurity Control Center",
    "ULTIMATE GUARD\nGüvenlik Kontrol Merkezi",
  ],
  "persistent.ready": ["Permanent panel ready", "Kalıcı panel hazır"],
  "persistent.link": [
    "[Open the permanent control panel]({url})",
    "[Kalıcı kontrol panelini aç]({url})",
  ],
  "persistent.counts": [
    "Whitelisted members/bots: {members}\nWhitelisted roles: {roles}\nLast confirmed incident: {last}",
    "Whitelist kullanıcı/bot: {members}\nWhitelist rol: {roles}\nSon doğrulanmış olay: {last}",
  ],
  "persistent.tools": ["Panel Settings", "Panel Ayarları"],
  "persistent.toolsBody": [
    "This is the registered permanent channel message. Choose a destination to move it with private confirmation, or pin this message. A move retires the previous controls.",
    "Bu mesaj kayıtlı kalıcı kanal panelidir. Taşımak için hedef kanalı seçip özel onay verin veya mesajı sabitleyin. Taşınırken önceki mesajın kontrolleri devre dışı bırakılır.",
  ],
  "persistent.moveChoose": [
    "Choose the panel destination channel",
    "Panelin taşınacağı kanalı seçin",
  ],
  "persistent.moveTitle": ["Move the permanent panel", "Kalıcı paneli taşı"],
  "persistent.moveConfirm": [
    "Move the panel to {channel}? One new registered message will replace the current controls.",
    "Panel {channel} kanalına taşınsın mı? Yeni kayıtlı mesaj mevcut kontrollerin yerini alacak.",
  ],
  "persistent.pin": ["Pin Panel", "Paneli Sabitle"],
  "persistent.pinned": [
    "The permanent panel is pinned. Other pinned messages were not changed.",
    "Kalıcı panel sabitlendi. Diğer sabitlenmiş mesajlar değiştirilmedi.",
  ],
  "persistent.pinPermissions": [
    "Pinning requires Pin Messages or appropriate Manage Messages permissions. The panel remains usable.",
    "Sabitleme için Mesajları Sabitle veya uygun Mesajları Yönet izni gerekir. Panel kullanılabilir durumda kalır.",
  ],
  "persistent.privateSummary": [
    "Saved records: {count}. The public panel stays here; authorized details and sensitive operations open privately.",
    "Kayıt sayısı: {count}. Açık panel burada kalır; yetkili ayrıntılar ve hassas işlemler özel olarak açılır.",
  ],
  "persistent.privateOpen": ["Open Private Management", "Özel Yönetimi Aç"],
  "persistent.denied": [
    "Only the bot owner can manage this panel.",
    "Bu paneli yalnızca bot sahibi yönetebilir.",
  ],
  "persistent.permissions": [
    "The panel channel requires View Channel, Read Message History, Send Messages and Embed Links.",
    "Panel kanalında Kanalı Görüntüle, Mesaj Geçmişini Oku, Mesaj Gönder ve Bağlantı Yerleştir izinleri gerekir.",
  ],
  "persistent.channelInvalid": [
    "Choose a text or announcement channel in this server.",
    "Bu sunucudaki bir metin veya duyuru kanalını seçin.",
  ],
  "persistent.channelMissing": [
    "The saved channel is missing. Run /guard panel in a valid destination to recreate it.",
    "Kayıtlı kanal bulunamadı. Geçerli hedef kanalda /guard panel çalıştırarak yeniden oluşturun.",
  ],
  "persistent.notRegistered": [
    "This message is not the registered panel. Open the current panel or run /guard panel.",
    "Bu mesaj kayıtlı panel değil. Güncel paneli açın veya /guard panel çalıştırın.",
  ],
  "persistent.wrongAuthor": [
    "The saved message identity could not be verified as belonging to this bot. No replacement was posted.",
    "Kayıtlı mesajın bu bota ait olduğu doğrulanamadı. Yerine yeni mesaj gönderilmedi.",
  ],
  "persistent.obsolete": [
    "This control version is obsolete. Run /guard panel to refresh the registered message.",
    "Bu kontrol sürümü eski. Kayıtlı mesajı yenilemek için /guard panel çalıştırın.",
  ],
  "persistent.invalidRecord": [
    "The saved panel reference is invalid; inspect local configuration before recovery.",
    "Kayıtlı panel referansı geçersiz; kurtarmadan önce yerel yapılandırmayı inceleyin.",
  ],
  "persistent.unavailable": [
    "The panel service is unavailable. Security processing continues independently.",
    "Panel servisi kullanılamıyor. Güvenlik işlemleri bağımsız olarak devam ediyor.",
  ],
  "persistent.uncertainCreate": [
    "A previous panel send has an uncertain outcome. Reconcile the channel and panel_creation journal before retrying; no duplicate was posted.",
    "Önceki panel gönderiminin sonucu belirsiz. Yeniden denemeden önce kanalı ve panel_creation günlüğünü doğrulayın; kopya panel gönderilmedi.",
  ],
};
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[1]]),
);
