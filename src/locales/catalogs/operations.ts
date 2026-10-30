const messages: Record<string, [string, string]> = {
  "ops.incident.title": ["Security incident", "Güvenlik olayı"],
  "ops.incident.id": ["Incident", "Olay"],
  "ops.incident.guild": ["Server", "Sunucu"],
  "ops.incident.action": ["Protection", "Koruma"],
  "ops.incident.severity": ["Severity", "Önem düzeyi"],
  "ops.incident.confidence": ["Attribution", "İşlem sorumlusu doğrulaması"],
  "ops.incident.executor": ["Executor", "İşlemi yapan"],
  "ops.incident.target": ["Target", "Hedef"],
  "ops.incident.time": ["Time", "Zaman"],
  "ops.incident.policy": ["Security response", "Güvenlik yanıtı"],
  "ops.incident.status": ["Status", "Durum"],
  "ops.incident.result": ["Result", "Sonuç"],
  "ops.confidence.confirmed": [
    "Confirmed audit record",
    "Audit kaydıyla doğrulandı",
  ],
  "ops.confidence.unresolved": [
    "Unresolved; no punishment",
    "Doğrulanamadı; ceza uygulanmadı",
  ],
  "ops.severity.info": ["Information", "Bilgi"],
  "ops.severity.warning": ["Warning", "Uyarı"],
  "ops.severity.critical": ["Critical", "Kritik"],
  "ops.result.monitor": [
    "Recorded in Monitor mode; no automatic intervention.",
    "İzleme modunda kaydedildi; otomatik müdahale uygulanmadı.",
  ],
  "ops.result.unresolved": [
    "The executor could not be reliably verified. No security response was applied.",
    "İşlemi yapan kişi güvenilir biçimde doğrulanamadı. Güvenlik müdahalesi uygulanmadı.",
  ],
  "ops.result.invalidPolicy": [
    "Protection settings could not be validated; no intervention was applied. Review the protection settings.",
    "Koruma ayarları doğrulanamadı; müdahale uygulanmadı. Koruma ayarlarını gözden geçirin.",
  ],
  "ops.result.exempt": [
    "The server owner or the bot performed this action; it is exempt.",
    "Bu işlem sunucu sahibine veya botun kendisine ait; müdahaleden muaftır.",
  ],
  "ops.result.whitelisted": [
    "Allowed by the subject’s whitelist permissions.",
    "Kişinin veya rolün whitelist yetkileri bu işleme izin veriyor.",
  ],
  "ops.result.below": [
    "{count} of {limit} matching actions recorded in the time window.",
    "Zaman aralığında {limit} işlem sınırının {count} işlemi kaydedildi.",
  ],
  "ops.result.pending": [
    "The response is pending. Check the saved incident before retrying.",
    "Güvenlik yanıtı bekliyor. Tekrar denemeden önce olay kaydını kontrol edin.",
  ],
  "ops.result.log": [
    "Recorded without intervention.",
    "Müdahale uygulanmadan kaydedildi.",
  ],
  "ops.result.warn": [
    "A security warning was recorded; delivery to the configured log channel is attempted.",
    "Güvenlik uyarısı kaydedildi; ayarlı günlük kanalına gönderilmesi denenir.",
  ],
  "ops.result.kick": [
    "The confirmed executor was kicked.",
    "Doğrulanan işlem sorumlusu sunucudan atıldı.",
  ],
  "ops.result.ban": [
    "The confirmed executor was banned; messages were kept.",
    "Doğrulanan işlem sorumlusu yasaklandı; mesajları korundu.",
  ],
  "ops.result.strip": [
    "Removed {count} manageable roles with dangerous permissions. Ordinary roles were kept.",
    "Tehlikeli yetkiler içeren, yönetilebilir {count} rol kaldırıldı. Normal roller korundu.",
  ],
  "ops.result.noDanger": [
    "No manageable dangerous role was found.",
    "Kaldırılabilecek, tehlikeli yetkili bir rol bulunamadı.",
  ],
  "ops.result.locked": [
    "Very High verification enabled. Existing members are not frozen.",
    "En yüksek doğrulama düzeyi açıldı. Mevcut üyeler dondurulmaz.",
  ],
  "ops.result.unlocked": [
    "The previous verification level was restored.",
    "Önceki doğrulama düzeyi geri yüklendi.",
  ],
  "ops.result.reversed": [
    "Supported audited fields were restored after checking current values.",
    "Desteklenen alanlar güncel değerleri denetlenerek önceki hâline getirildi.",
  ],
  "ops.result.repeatedReverse": [
    "This reversal was already attempted. Inspect the incident before retrying.",
    "Bu geri alma işlemi daha önce denendi. Yeniden denemeden önce olay kaydını inceleyin.",
  ],
  "ops.result.permissions": [
    "The bot lacks a required permission. Review its role and channel permissions.",
    "Botun gerekli bir yetkisi eksik. Bot rolünü ve kanal izinlerini kontrol edin.",
  ],
  "ops.result.hierarchy": [
    "The bot cannot manage this role or member. Move its role higher or review the target.",
    "Bot bu rolü veya üyeyi yönetemiyor. Botun rol sırasını ve hedefi kontrol edin.",
  ],
  "ops.result.protected": [
    "The target is protected or its identity is unavailable; no intervention was applied.",
    "Hedef koruma altında veya kimliği doğrulanamıyor; müdahale uygulanmadı.",
  ],
  "ops.result.changed": [
    "The resource changed after the original action. Automatic reversal was refused to preserve newer changes.",
    "Kaynak ilk işlemden sonra değişmiş. Yeni değişiklikleri korumak için otomatik geri alma yapılmadı.",
  ],
  "ops.result.unsupported": [
    "This resource or field cannot be restored automatically. Use supported backup recovery where available.",
    "Bu kaynak veya alan otomatik geri alınamıyor. Destekleniyorsa yedekten geri yüklemeyi kullanın.",
  ],
  "ops.result.dependency": [
    "The operation could not be completed safely. Check permissions, connection and local logs; no broader punishment is applied.",
    "İşlem güvenli biçimde tamamlanamadı. Yetkileri, bağlantıyı ve yerel günlükleri kontrol edin; daha kapsamlı bir ceza uygulanmaz.",
  ],
  "ops.result.restored": ["Restored", "Geri yüklendi"],
  "ops.result.managed": [
    "Managed role; skipped",
    "Discord tarafından yönetilen rol; atlandı",
  ],
  "ops.result.uncertain": [
    "The previous creation may have succeeded. Automatic retries are blocked to prevent duplicates; operator reconciliation is required.",
    "Önceki oluşturma işlemi tamamlanmış olabilir. Kopya kaynakları önlemek için otomatik tekrar engellendi; operatörün kontrol etmesi gerekir.",
  ],
  "ops.result.parentMissing": [
    "The parent category is missing; this channel was not restored.",
    "Üst kategori eksik; bu kanal geri yüklenmedi.",
  ],
  "ops.result.overwriteMissing": [
    "A referenced role is missing; channel permissions were not weakened.",
    "İzinlerde kullanılan bir rol eksik; kanal izinleri gevşetilmedi.",
  ],
  "ops.result.channelType": [
    "The current channel has a different type; it was left unchanged.",
    "Mevcut kanalın türü farklı; değiştirilmedi.",
  ],
  "ops.result.empty": [
    "No supported resources to restore.",
    "Geri yüklenecek desteklenen kaynak yok.",
  ],
  "ops.resource.role": ["Role {id}: {result}", "Rol {id}: {result}"],
  "ops.resource.channel": ["Channel {id}: {result}", "Kanal {id}: {result}"],
  "ops.resource.guild": [
    "Server settings: {result}",
    "Sunucu ayarları: {result}",
  ],
  "ops.job.reference": [
    "Recovery reference: {id}",
    "Geri yükleme referansı: {id}",
  ],
  "ops.jobs.title": ["Recovery history", "Geri yükleme geçmişi"],
  "ops.jobs.detail": ["Recovery {id}", "Geri yükleme {id}"],
  "ops.jobs.snapshot": ["Backup", "Yedek"],
  "ops.jobs.scope": ["Restore selection", "Geri yüklenecekler"],
  "ops.jobs.state": ["Status", "Durum"],
  "ops.jobs.error": ["Problem", "Sorun"],
  "ops.jobs.none": [
    "No recovery operations on this page.",
    "Bu sayfada geri yükleme işlemi yok.",
  ],
  "ops.jobs.page": [
    "Page {page}. Open /guard backup jobs with the recovery reference for details.",
    "Sayfa {page}. Ayrıntılar için /guard backup jobs komutunda geri yükleme referansını seçin.",
  ],
  "ops.jobs.detailPage": [
    "Page {page}/{pages}. Use the page option to continue.",
    "Sayfa {page}/{pages}. Devam etmek için sayfa seçeneğini kullanın.",
  ],
  "ops.jobs.notFound": [
    "This recovery could not be found in this server. Choose a reference from the recovery history.",
    "Bu geri yükleme sunucunuzda bulunamadı. Geri yükleme geçmişindeki bir referansı seçin.",
  ],
  "ops.jobs.invalidPage": [
    "Enter a valid page number starting from 1.",
    "1 veya daha büyük, geçerli bir sayfa numarası girin.",
  ],
  "ops.jobs.pageCount": [
    "This recovery has {pages} pages. Choose a page in that range.",
    "Bu geri yüklemenin {pages} sayfası var. Bu aralıkta bir sayfa seçin.",
  ],
  "ops.state.running": ["In progress", "Devam ediyor"],
  "ops.state.pending": ["Pending confirmation of result", "Sonucu bekleniyor"],
  "ops.state.finished": [
    "Finished; review individual results",
    "Bitti; kaynak sonuçlarını kontrol edin",
  ],
  "ops.state.failed": ["Could not complete", "Tamamlanamadı"],
  "ops.state.done": ["Completed", "Tamamlandı"],
  "ops.state.uncertain": ["Result uncertain", "Sonuç belirsiz"],
  "ops.scope.all": [
    "Roles, channels and server settings",
    "Roller, kanallar ve sunucu ayarları",
  ],
  "ops.scope.roles": ["Roles", "Roller"],
  "ops.scope.channels": ["Channels", "Kanallar"],
  "ops.scope.guild": ["Server settings", "Sunucu ayarları"],
  "ops.preview.title": ["Restore preview", "Geri yükleme önizlemesi"],
  "ops.preview.summary": [
    "Selection: {scope}\nRoles: {roles} ({missingRoles} missing)\nChannels: {channels} ({missingChannels} missing)\n\nExisting supported settings and permissions will be updated. Missing resources receive NEW IDs; extra resources are not deleted.",
    "Seçim: {scope}\nRoller: {roles} ({missingRoles} eksik)\nKanallar: {channels} ({missingChannels} eksik)\n\nDesteklenen mevcut ayarlar ve izinler güncellenir. Eksik kaynaklar YENİ kimliklerle oluşturulur; fazladan kaynaklar silinmez.",
  ],
  "ops.preview.limits": [
    "Managed roles, role positions, member assignments, messages, icons, threads and forum/stage channels are not restored. Permission or hierarchy limits can cause partial recovery. Unsupported channel types: {skipped}. Confirm only after reviewing this preview.",
    "Yönetilen roller, rol sıraları, üye rol atamaları, mesajlar, simgeler, konular ve forum/sahne kanalları geri yüklenmez. Yetki veya rol sırası sınırlamaları kısmi sonuçlara yol açabilir. Desteklenmeyen kanal türleri: {skipped}. Önizlemeyi inceleyerek onaylayın.",
  ],
  "ops.previewUnavailable": [
    "A reliable restore preview could not be prepared. Try again and check the backup before confirming.",
    "Güvenilir bir geri yükleme önizlemesi hazırlanamadı. Tekrar deneyip onaydan önce yedeği kontrol edin.",
  ],
};
export const en = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [key, value[1]]),
);
