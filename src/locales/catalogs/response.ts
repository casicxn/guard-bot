const rows: Record<string, [string, string]> = {
  "action.contain-rollback": [
    "Contain executor, then attempt safe rollback",
    "Sorumlunun yetkilerini kaldır, ardından güvenli geri almayı dene",
  ],
  "response.containment": ["Containment", "Yetki kaldırma"],
  "response.rollback": ["Automatic rollback", "Otomatik geri alma"],
  "response.contained": [
    "No dangerous effective permissions detected after containment",
    "Müdahale sonrası tehlikeli etkin izin saptanmadı",
  ],
  "response.partial": [
    "Partial; risk remains or state could not be fully verified",
    "Kısmi; risk sürüyor veya durum tam doğrulanamadı",
  ],
  "response.failed": [
    "Failed; inspect permissions, hierarchy and local incident details",
    "Başarısız; yetki, hiyerarşi ve yerel olay ayrıntılarını inceleyin",
  ],
  "response.exempt": [
    "Stopped because authorization or protection mode changed",
    "Yetkilendirme veya koruma modu değiştiği için durduruldu",
  ],
  "response.succeeded": [
    "Completed for supported fields; platform limitations still apply",
    "Desteklenen alanlar için tamamlandı; platform sınırları geçerlidir",
  ],
  "response.unsupported": [
    "No safe implemented reversal with available evidence; manual recovery required",
    "Mevcut kanıtla güvenli ve uygulanmış geri alma yok; manuel kurtarma gerekli",
  ],
  "response.skipped": [
    "Skipped; authorization, live state or queue capacity prevented recovery",
    "Atlandı; yetki, canlı durum veya kuyruk kapasitesi kurtarmayı engelledi",
  ],
  "response.uncertain": [
    "Uncertain API outcome; do not repeat automatically, reconcile manually",
    "API sonucu belirsiz; otomatik tekrarlamayın, elle doğrulayın",
  ],
  "response.roles": [
    "Removed roles: {removed}; remaining dangerous roles: {remaining}; remaining permission mask: {permissions}",
    "Kaldırılan rol: {removed}; kalan tehlikeli rol: {remaining}; kalan izin maskesi: {permissions}",
  ],
  "response.pending": [
    "Containment decision persisted; recovery runs separately",
    "Müdahale kararı kaydedildi; geri alma ayrı işlenir",
  ],
};
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[1]]),
);
