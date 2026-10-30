export const en: Record<string, string> = {
  "whitelist.success": "Successfully Whitelisted",
  "whitelist.successDescription":
    "This {type} is now trusted for all protection modules. Only add principals you fully trust.",
  "whitelist.duplicate": "Already Whitelisted",
  "whitelist.duplicateDescription":
    "This {type} already has permanent access to all protection modules. No additional entry was created.",
  "whitelist.upgraded": "Whitelist Access Updated",
  "whitelist.upgradedDescription":
    "The existing entry now grants permanent access to all protection modules. Its saved identity was preserved.",
  "whitelist.removed": "Whitelist Access Removed",
  "whitelist.removedDescription":
    "Removed {count} saved trust entries for this ID. This does not remove the member or role from the server.",
  "whitelist.notListed": "No Whitelist Entry",
  "whitelist.notListedDescription":
    "This ID has no saved whitelist entry in this server. No changes were needed.",
  "whitelist.title": "Whitelist Management",
  "whitelist.list": "Trusted Users and Roles",
  "whitelist.empty":
    "No users, bots or roles are whitelisted in this server. Use /guard whitelist add and enter a user or role ID.",
  "whitelist.subject": "Subject",
  "whitelist.user": "User",
  "whitelist.role": "Role",
  "whitelist.bot": "Bot",
  "whitelist.type": "Type",
  "whitelist.access": "Access",
  "whitelist.allModules": "All protection modules",
  "whitelist.limitedModules": "Selected protection modules",
  "whitelist.status": "Status",
  "whitelist.active": "Active",
  "whitelist.expired": "Expired",
  "whitelist.expires": "Expires",
  "whitelist.permanent": "No expiry",
  "whitelist.warning":
    "Full whitelist access allows this user or role to bypass every guard policy. Choose carefully.",
  "whitelist.add": "Add trusted user or role",
  "whitelist.remove": "Remove whitelist access",
  "whitelist.chooseUser": "Choose a user or bot",
  "whitelist.chooseRole": "Choose a role",
  "whitelist.addModalTitle": "Add Full Whitelist Access",
  "whitelist.removeModalTitle": "Remove Whitelist Access",
  "whitelist.subjectLabel": "User or role ID",
  "whitelist.subjectPlaceholder": "Example: 123456789012345678",
  "whitelist.invalidId":
    "Invalid ID. Please enter the ID of a user or role in this server, for example 123456789012345678. Mentions and names are not IDs.",
  "whitelist.notFound":
    "No role or server member was found with this ID. Check the ID, confirm the member is in this server, and try again.",
  "whitelist.lookupFailed":
    "Discord could not confirm whether this ID belongs to a role or server member. No whitelist access was granted. Check the bot's access and try again shortly.",
};
export const tr: Record<string, string> = {
  "whitelist.success": "Whitelist Başarılı",
  "whitelist.successDescription":
    "Bu {type}, tüm korumalar için güvenilir olarak kaydedildi. Yalnızca tamamen güvendiğiniz kişileri ve rolleri ekleyin.",
  "whitelist.duplicate": "Zaten Whitelist'te",
  "whitelist.duplicateDescription":
    "Bu {type}, tüm korumalara zaten süresiz erişiyor. Yeni bir kayıt oluşturulmadı.",
  "whitelist.upgraded": "Whitelist Yetkisi Güncellendi",
  "whitelist.upgradedDescription":
    "Mevcut kayıt artık tüm korumalara süresiz erişim sağlıyor. Kayıt kimliği korundu.",
  "whitelist.removed": "Whitelist Yetkisi Kaldırıldı",
  "whitelist.removedDescription":
    "Bu ID için {count} güven kaydı kaldırıldı. Kullanıcı veya rol sunucudan kaldırılmaz.",
  "whitelist.notListed": "Whitelist Kaydı Bulunamadı",
  "whitelist.notListedDescription":
    "Bu ID için sunucuda kayıtlı whitelist yetkisi yok. Değişiklik gerekmedi.",
  "whitelist.title": "Whitelist Yönetimi",
  "whitelist.list": "Güvenilir Kullanıcılar ve Roller",
  "whitelist.empty":
    "Bu sunucunun whitelist'inde kullanıcı, bot veya rol yok. /guard whitelist add komutuna bir kullanıcı veya rol ID'si girin.",
  "whitelist.subject": "Hedef",
  "whitelist.user": "Kullanıcı",
  "whitelist.role": "Rol",
  "whitelist.bot": "Bot",
  "whitelist.type": "Tür",
  "whitelist.access": "Yetki",
  "whitelist.allModules": "Tüm korumalar",
  "whitelist.limitedModules": "Seçili korumalar",
  "whitelist.status": "Durum",
  "whitelist.active": "Aktif",
  "whitelist.expired": "Süresi dolmuş",
  "whitelist.expires": "Bitiş",
  "whitelist.permanent": "Süresiz",
  "whitelist.warning":
    "Tam whitelist yetkisi, bu kullanıcı veya rolün tüm koruma politikalarından muaf tutulmasını sağlar. Dikkatli seçim yapın.",
  "whitelist.add": "Güvenilir kullanıcı veya rol ekle",
  "whitelist.remove": "Whitelist yetkisini kaldır",
  "whitelist.chooseUser": "Kullanıcı veya bot seçin",
  "whitelist.chooseRole": "Rol seçin",
  "whitelist.addModalTitle": "Tam Whitelist Yetkisi Ver",
  "whitelist.removeModalTitle": "Whitelist Yetkisini Kaldır",
  "whitelist.subjectLabel": "Kullanıcı veya rol ID'si",
  "whitelist.subjectPlaceholder": "Örnek: 123456789012345678",
  "whitelist.invalidId":
    "Geçersiz ID girdiniz. Sunucunuzdaki bir kullanıcı veya rolün ID'sini girin; örneğin 123456789012345678. Etiket ve kullanıcı adı ID değildir.",
  "whitelist.notFound":
    "Bu ID ile sunucuda bir rol veya üye bulunamadı. ID'yi kontrol edin, kullanıcının sunucuda olduğundan emin olun ve tekrar deneyin.",
  "whitelist.lookupFailed":
    "Discord, ID'nin bir role veya sunucu üyesine ait olduğunu doğrulayamadı. Whitelist yetkisi verilmedi. Botun erişimini kontrol edip kısa süre sonra tekrar deneyin.",
};

en["whitelist.upgradeRequired"] =
  "This entry has limited or expiring access. Review and explicitly confirm the upgrade before granting permanent access to every protection.";
tr["whitelist.upgradeRequired"] =
  "Bu kaydın erişimi sınırlı veya süreli. Tüm korumalara süresiz erişim vermeden önce kapsam genişletmesini inceleyip açıkça onaylayın.";
