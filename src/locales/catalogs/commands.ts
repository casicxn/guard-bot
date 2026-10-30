const rows: Record<string, [string, string]> = {
  "command.guard.name": ["guard", "guard"],
  "command.guard.description": [
    "Manage your server security with guided controls",
    "Sunucu güvenliğini anlaşılır menülerle yönetin",
  ],
  "command.setup.name": ["setup", "kurulum"],
  "command.setup.description": [
    "Choose where security notices are sent",
    "Güvenlik bildirimlerinin gönderileceği kanalı seçin",
  ],
  "command.log-channel.name": ["log-channel", "kayit-kanali"],
  "command.log-channel.description": [
    "Text channel for security notices; optional",
    "Güvenlik bildirimleri için yazı kanalı; isteğe bağlı",
  ],
  "command.panel.name": ["panel", "panel"],
  "command.panel.description": [
    "Open the guided security management panel",
    "Güvenlik yönetim panelini açın",
  ],
  "command.status.name": ["status", "durum"],
  "command.status.description": [
    "See your security mode and current warnings",
    "Güvenlik modunu ve güncel uyarıları görün",
  ],
  "command.health.name": ["health", "saglik"],
  "command.health.description": [
    "Check bot permissions and connection health",
    "Bot yetkilerini ve bağlantı durumunu kontrol edin",
  ],
  "command.help.name": ["help", "yardim"],
  "command.help.description": [
    "Learn how protections, trust and backups work",
    "Korumaların, güvenilir listenin ve yedeklerin kullanımını öğrenin",
  ],
  "command.incidents.name": ["incidents", "olaylar"],
  "command.incidents.description": [
    "Read recent security activity",
    "Son güvenlik hareketlerini okuyun",
  ],
  "command.page.name": ["page", "sayfa"],
  "command.page.description": [
    "Page to display, starting at 1",
    "Gösterilecek sayfa; ilk sayfa 1",
  ],
  "command.mode.name": ["mode", "mod"],
  "command.mode.description": [
    "Choose whether the bot only observes or responds",
    "Botun yalnızca izlemesini veya yanıt vermesini seçin",
  ],
  "command.value.name": ["value", "secim"],
  "command.value.description": [
    "Monitor records activity; Protect permits configured responses",
    "İzleme kaydeder; Koruma seçilmiş güvenlik yanıtlarına izin verir",
  ],
  "command.choice.monitor.name": [
    "Monitor — record only",
    "İzleme — yalnızca kaydet",
  ],
  "command.choice.protect.name": [
    "Protect — apply configured responses",
    "Koruma — seçilmiş yanıtları uygula",
  ],
  "command.modules.name": ["modules", "korumalar"],
  "command.modules.description": [
    "Choose a protection by name and adjust its settings",
    "Bir korumayı adıyla seçip ayarlarını düzenleyin",
  ],
  "command.limits.name": ["limits", "limitler"],
  "command.limits.description": [
    "Choose a protection and edit its action limit",
    "Bir koruma seçip işlem limitini düzenleyin",
  ],
  "command.lockdown.name": ["lockdown", "acil-durum"],
  "command.lockdown.description": [
    "Raise verification or restore its previous setting",
    "Doğrulamayı yükseltin veya önceki ayarına döndürün",
  ],
  "command.enabled.name": ["enabled", "etkin"],
  "command.enabled.description": [
    "True raises verification; false restores the prior level",
    "Evet doğrulamayı yükseltir; hayır önceki seviyeyi geri getirir",
  ],
  "command.whitelist.name": ["whitelist", "beyaz-liste"],
  "command.whitelist.description": [
    "Manage users, bots and roles trusted for all protections",
    "Tüm korumalarda güvenilen kullanıcı, bot ve rolleri yönetin",
  ],
  "command.add.name": ["add", "ekle"],
  "command.add.description": [
    "Trust a user, bot or role for all protection modules",
    "Bir kullanıcı, bot veya role tüm korumalarda güvenin",
  ],
  "command.subject.name": ["subject", "hedef"],
  "command.subject.description": [
    "ID of a user, bot or role in this server",
    "Bu sunucudaki kullanıcı, bot veya rolün kimliği (ID)",
  ],
  "command.remove.name": ["remove", "kaldir"],
  "command.remove.description": [
    "Remove a user, bot or role from the trusted list",
    "Kullanıcı, bot veya rolü güvenilir listeden kaldırın",
  ],
  "command.subject.id-whose-trusted-list-entries-should-be-removed.name": [
    "subject",
    "hedef",
  ],
  "command.subject.id-whose-trusted-list-entries-should-be-removed.description":
    [
      "ID whose trusted-list entries should be removed",
      "Güvenilir liste kayıtları kaldırılacak kimlik (ID)",
    ],
  "command.list.name": ["list", "liste"],
  "command.list.description": [
    "See the trusted list and each entry’s access",
    "Güvenilir listeyi ve her kaydın erişimini görün",
  ],
  "command.backup.name": ["backup", "yedek"],
  "command.backup.description": [
    "Create backups and safely recover supported settings",
    "Yedek oluşturun ve desteklenen ayarları güvenle kurtarın",
  ],
  "command.create.name": ["create", "olustur"],
  "command.create.description": [
    "Save a backup of supported server structure",
    "Desteklenen sunucu yapısının yedeğini kaydedin",
  ],
  "command.list.see-saved-backups.name": ["list", "liste"],
  "command.list.see-saved-backups.description": [
    "See saved backups",
    "Kaydedilmiş yedekleri görün",
  ],
  "command.jobs.name": ["jobs", "sonuclar"],
  "command.jobs.description": [
    "Read full results of previous recovery operations",
    "Önceki kurtarma işlemlerinin tüm sonuçlarını okuyun",
  ],
  "command.id.name": ["id", "islem"],
  "command.id.description": [
    "Recovery reference shown after a restore; optional",
    "Geri yükleme sonrası gösterilen işlem numarası; isteğe bağlı",
  ],
  "command.page.result-page-starting-at-1.name": ["page", "sayfa"],
  "command.page.result-page-starting-at-1.description": [
    "Result page, starting at 1",
    "Sonuç sayfası; ilk sayfa 1",
  ],
  "command.restore.name": ["restore", "geri-yukle"],
  "command.restore.description": [
    "Preview a backup, then confirm before restoring",
    "Yedeği önce inceleyin; geri yüklemek için onaylayın",
  ],
  "command.id.backup-reference-shown-in-the-backup-list.name": ["id", "yedek"],
  "command.id.backup-reference-shown-in-the-backup-list.description": [
    "Backup reference shown in the backup list",
    "Yedek listesinde gösterilen yedek numarası",
  ],
  "command.scope.name": ["scope", "kapsam"],
  "command.scope.description": [
    "Which supported settings to recover; defaults to all",
    "Kurtarılacak ayarlar; varsayılan tüm desteklenen ayarlar",
  ],
  "command.choice.all.name": [
    "All supported settings",
    "Desteklenen tüm ayarlar",
  ],
  "command.choice.roles.name": ["Roles and permissions", "Roller ve yetkiler"],
  "command.choice.channels.name": [
    "Channels and categories",
    "Kanallar ve kategoriler",
  ],
  "command.choice.guild.name": ["Server settings", "Sunucu ayarları"],
};
export const en = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(rows).map(([key, value]) => [key, value[1]]),
);
