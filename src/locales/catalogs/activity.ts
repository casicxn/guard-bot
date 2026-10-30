const rows: Record<string, [string, string]> = {
  "activity.class.safe": ["Safe", "Güvenli"],
  "activity.class.monitored": ["Monitored", "İzleniyor"],
  "activity.class.mitigated": ["Mitigated", "Müdahale Edildi"],
  "activity.class.unresolved": ["Unresolved", "Belirsiz"],
  "activity.class.failed": ["Mitigation Failed", "Müdahale Başarısız"],
  "activity.title.safe": ["🟢 Safe Action", "🟢 Güvenli İşlem"],
  "activity.title.monitored": ["🟡 Monitored Action", "🟡 İzlenen İşlem"],
  "activity.title.mitigated": [
    "🔴 Mitigated Action",
    "🔴 Müdahale Edilen İşlem",
  ],
  "activity.title.unresolved": [
    "🟠 Unresolved Activity",
    "🟠 Belirsiz Etkinlik",
  ],
  "activity.title.failed": ["⛔ Mitigation Failed", "⛔ Müdahale Başarısız"],
  "activity.reason.botOwner": [
    "Configured bot owner",
    "Yapılandırılmış bot sahibi",
  ],
  "activity.reason.guildOwner": [
    "Server owner exemption",
    "Sunucu sahibi muafiyeti",
  ],
  "activity.reason.self": [
    "Trusted operation by this bot",
    "Bu botun güvenilir işlemi",
  ],
  "activity.reason.whitelistUser": [
    "Whitelisted user",
    "Whitelist kapsamındaki kullanıcı",
  ],
  "activity.reason.whitelistRole": [
    "Whitelisted role",
    "Whitelist kapsamındaki rol",
  ],
  "activity.reason.trustedBot": [
    "Explicitly trusted bot",
    "Açıkça güvenilmiş bot",
  ],
  "activity.reason.policy": [
    "Authorized by the security policy",
    "Güvenlik ilkesi kapsamında yetkili",
  ],
  "activity.reason.monitor": [
    "Observed without automatic intervention",
    "Otomatik müdahale olmadan gözlemlendi",
  ],
  "activity.reason.intervention": [
    "A confirmed intervention succeeded",
    "Doğrulanmış bir müdahale başarılı oldu",
  ],
  "activity.reason.failed": [
    "The attempted intervention failed",
    "Denenen müdahale başarısız oldu",
  ],
  "activity.reason.unresolved": [
    "Executor or outcome could not be verified",
    "İşlemi yapan veya sonuç doğrulanamadı",
  ],
  "activity.reason.pending": [
    "An intervention is still being processed",
    "Müdahale henüz işleniyor",
  ],
  "activity.enforcement.none": ["None", "Uygulanmadı"],
  "activity.enforcement.applied": [
    "Intervention confirmed",
    "Müdahale doğrulandı",
  ],
  "activity.enforcement.failed": ["Intervention failed", "Müdahale başarısız"],
  "activity.enforcement.uncertain": [
    "Outcome unconfirmed",
    "Sonuç doğrulanamadı",
  ],
  "activity.enforcement.pending": [
    "Pending confirmation",
    "Doğrulama bekleniyor",
  ],
  "activity.field.action": ["Action", "İşlem"],
  "activity.field.executor": ["Executor", "İşlemi yapan"],
  "activity.field.target": ["Target", "Hedef"],
  "activity.field.status": ["Status", "Durum"],
  "activity.field.reason": ["Reason", "Gerekçe"],
  "activity.field.enforcement": ["Enforcement", "Müdahale"],
  "activity.field.result": ["Result", "Sonuç"],
  "activity.detail.partial": [
    "Some intervention succeeded; remaining risk or recovery needs review.",
    "Müdahalenin bir kısmı başarılı oldu; kalan risk veya kurtarma incelenmeli.",
  ],
  "activity.recentTitle": ["Recent activity", "Son etkinlikler"],
  "activity.recentEntry": [
    "{indicator} {status} · {action} · {time}",
    "{indicator} {status} · {action} · {time}",
  ],
  "activity.recentLine": [
    "{indicator} {status} · {action} · {time}",
    "{indicator} {status} · {action} · {time}",
  ],
};
const actions: Record<string, [string, string]> = {
  "guild.update": ["Server settings changed", "Sunucu ayarları değiştirildi"],
  "channel.create": ["Channel created", "Kanal oluşturuldu"],
  "channel.update": ["Channel edited", "Kanal düzenlendi"],
  "channel.delete": ["Channel deleted", "Kanal silindi"],
  "channel.overwrite": [
    "Channel permissions changed",
    "Kanal izinleri değiştirildi",
  ],
  "member.kick": ["Member kicked", "Üye sunucudan atıldı"],
  "member.ban": ["Member banned", "Üye yasaklandı"],
  "member.unban": ["Member unbanned", "Üyenin yasağı kaldırıldı"],
  "member.role": ["Member roles changed", "Üyenin rolleri değiştirildi"],
  "member.permissions": [
    "Member administrative access changed",
    "Üyenin yönetim erişimi değiştirildi",
  ],
  "member.bot": ["Bot added to server", "Sunucuya bot eklendi"],
  "role.create": ["Role created", "Rol oluşturuldu"],
  "role.update": ["Role edited", "Rol düzenlendi"],
  "role.delete": ["Role deleted", "Rol silindi"],
  "role.permissions": ["Role permissions changed", "Rol izinleri değiştirildi"],
  "invite.create": ["Invite created", "Davet oluşturuldu"],
  "invite.update": ["Invite edited", "Davet düzenlendi"],
  "invite.delete": ["Invite deleted", "Davet silindi"],
  "webhook.create": ["Webhook created", "Webhook oluşturuldu"],
  "webhook.update": ["Webhook edited", "Webhook düzenlendi"],
  "webhook.delete": ["Webhook deleted", "Webhook silindi"],
  "emoji.create": ["Emoji created", "Emoji oluşturuldu"],
  "emoji.update": ["Emoji edited", "Emoji düzenlendi"],
  "emoji.delete": ["Emoji deleted", "Emoji silindi"],
  "integration.create": ["Integration created", "Entegrasyon oluşturuldu"],
  "integration.update": ["Integration edited", "Entegrasyon düzenlendi"],
  "integration.delete": ["Integration deleted", "Entegrasyon silindi"],
  "sticker.create": ["Sticker created", "Çıkartma oluşturuldu"],
  "sticker.update": ["Sticker edited", "Çıkartma düzenlendi"],
  "sticker.delete": ["Sticker deleted", "Çıkartma silindi"],
  "event.create": [
    "Scheduled event created",
    "Zamanlanmış etkinlik oluşturuldu",
  ],
  "event.update": ["Scheduled event edited", "Zamanlanmış etkinlik düzenlendi"],
  "event.delete": ["Scheduled event deleted", "Zamanlanmış etkinlik silindi"],
  "thread.create": ["Thread created", "Konu oluşturuldu"],
  "thread.update": ["Thread edited", "Konu düzenlendi"],
  "thread.delete": ["Thread deleted", "Konu silindi"],
  "soundboard.create": [
    "Soundboard sound created",
    "Ses paneli sesi oluşturuldu",
  ],
  "soundboard.update": [
    "Soundboard sound edited",
    "Ses paneli sesi düzenlendi",
  ],
  "soundboard.delete": ["Soundboard sound deleted", "Ses paneli sesi silindi"],
  "automod.create": [
    "AutoMod rule created",
    "Otomatik denetim kuralı oluşturuldu",
  ],
  "automod.update": [
    "AutoMod rule edited",
    "Otomatik denetim kuralı düzenlendi",
  ],
  "automod.delete": ["AutoMod rule deleted", "Otomatik denetim kuralı silindi"],
  "raid.join": [
    "Join-rate observation recorded",
    "Katılım hızı gözlemi kaydedildi",
  ],
  "raid.message": [
    "Message-rate observation recorded",
    "Mesaj hızı gözlemi kaydedildi",
  ],
  "raid.mention": [
    "Mention-rate observation recorded",
    "Bahsetme hızı gözlemi kaydedildi",
  ],
  "raid.account": [
    "New-account observation recorded",
    "Yeni hesap gözlemi kaydedildi",
  ],
};
for (const [id, value] of Object.entries(actions))
  rows[`activity.action.${id}`] = value;
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[1]]),
);
