# Ultimate Guard — Türkçe kullanım

Ultimate Guard güvenlik yönetimini Discord içinde sunar. Mevcut sürümün canlı Discord ve Docker doğrulaması beklemektedir; otomatik kontrol sonuçları GitHub Actions üzerindeki Quality iş akışında bulunur.

## Kurulum ve güncelleme

Node.js 24 LTS ve pnpm 11.25.0 kullanın. İlk kurulumda `pnpm install --frozen-lockfile` çalıştırın ve `.env.example` dosyasını `.env` olarak kopyalayıp bot bilgilerini ve `BOT_OWNER_ID` alanına kendi Discord kullanıcı ID bilginizi yazın. Eksik/geçersiz `BOT_OWNER_ID` başlatmayı ve komut kaydını durdurur. Güncellemede mevcut `.env` dosyanızı ve verilerinizi koruyun.

```powershell
pnpm register
pnpm build
pnpm start
```

Komut ağacı değiştiği için **`pnpm register` yeniden çalıştırılmalıdır**. `DISCORD_GUILD_ID` varsa geliştirme sunucusuna, yoksa globale kayıt yapılır. Başlatmak komut kaydını otomatik yenilemez. Gerçek tokenı paylaşmayın.

Botu `bot` ve `applications.commands` kapsamlarıyla sunucuya ekleyin. Audit izleme için Denetim Kaydını Görüntüle; seçilen yanıtlar için Rolleri Yönet, Kanalları Yönet, Üyeleri At/Yasakla ve Sunucuyu Yönet yetkileri gerekebilir. Bot rolü yöneteceği rollerin üstünde olmalıdır. Günlük kanalında Kanalı Görüntüle, Mesaj Gönder ve Bağlantı Yerleştir izinlerini kontrol edin.

## Dil ve panel

Varsayılan yanıt dili **Türkçe**. `/guard panel` → **Genel Ayarlar** → **Dil** üzerinden 🇹🇷 Türkçe veya 🇬🇧 English seçin. Seçim anında uygulanır, yalnızca ilgili sunucuyu etkiler ve yeniden başlatmadan sonra korunur.

Discord'un gösterdiği slash komut adları kişinin **Discord istemci diline**, bot yanıtları ise **sunucuda seçilen dile** bağlıdır. Aşağıdaki örnekler değişmeyen İngilizce komut adlarını gösterir. Türkçe istemcide `/guard whitelist add subject:<ID>` karşılığı `/guard beyaz-liste ekle hedef:<ID>`, `/guard limits` karşılığı `/guard limitler` olarak görünür.

Botu bütün sunucularda yalnızca `.env` içindeki **BOT_OWNER_ID** kullanıcısı yönetir. Sunucu sahipliği, Administrator, rol veya whitelist yönetim yetkisi vermez. Bu kimlik panelden/veritabanından değiştirilemez; `.env` değişikliği için yeniden başlatma gerekir. Ana panel kalıcı bir kanal mesajıdır; bot yeniden başladığında aynı mesaj ana görünüme döner ve düğmeleri çalışır. Yalnızca özel formlar/onaylar kullanıcıya ve sunucuya bağlıdır; on dakika veya yeniden başlatma sonrasında tekrar açılır.

Panel bölümleri: Güvenlik Özeti, Koruma Ayarları, Whitelist Yönetimi, Güvenlik Limitleri, Yedekleme ve Kurtarma, Olay Geçmişi, Bot Görünümü, Ses Ayarları, Genel Ayarlar, Sistem Sağlığı ve Yardım. Geri düğmesi ve bölüm menüsüyle gezinilir. Bilgi mavi, başarı yeşil, uyarı sarı, hata kırmızı gösterilir. Embed altbilgisinde Casi imzası bulunur.

## Kolay whitelist

Panelde kullanıcı/rol seçicileriyle ekleme, sayfalı kayıt listesinden seçim ve onayla kaldırma yapılır. Yeni kayıtlarda ekleyen kişi ve tarih gösterilir; eski kayıtlarda bilinmeyen bilgi uydurulmaz.

```text
/guard whitelist add subject:<ID>
/guard whitelist remove subject:<ID>
/guard whitelist list
```

Yalnızca kullanıcı, bot veya rolün **ID'si** gerekir. Bot önce sunucunun rollerini, ardından mevcut üyeyi kontrol eder; türü kendisi belirler. Bilinmeyen, sunucu dışındaki veya API hatası yüzünden doğrulanamayan kimliğe yetki verilmez. Panelde kullanıcı/rol seçimi de yapılabilir.

**Yeni whitelist kaydı tüm korumalarda süresiz muafiyet verir.** Yalnızca tamamen güvendiğiniz kişileri, botları ve rolleri ekleyin. Rol whitelist'e alındığında o rolü taşıyan üyeler kapsamındaki işlemlerden muaf olur. Botlar kendiliğinden güvenilir değildir. Ayrılmış bir üyenin kaydı ID ile kaldırılabilir.

Zaten sınırsız kayıt varsa kopya oluşturulmaz. Eski sınırlı veya süreli kayıt yeniden eklenirse ayrı bir yükseltme onayı istenir; onay verilmeden kapsam ve süre korunur. Diğer eski kayıtlar ve gelişmiş işlem bazlı muafiyet motoru korunur; listede mevcut kapsam ve süre görünür.

## Limitleri ve yanıtları düzenleme

`/guard limits` çalıştırın. Listeden **Kanal Silme Koruması**, **Rol Silme Koruması**, **Toplu Yasaklama Koruması** gibi anlaşılır bir ad seçin. Açıklamada korumanın işlevi, açık/kapalı durumu, modu, işlem sayısı, zaman aralığı ve uygulanacak yanıt gösterilir. **İşlem limitini düzenle** düğmesiyle formu açın.

Örnek: 5 işlem ve 60 saniye, bir kişinin bu sürede yaptığı beşinci eşleşen işlemde; sorumlu güvenilir biçimde doğrulanmışsa ve yetkiler uygunsa seçili güvenlik yanıtının tetiklenebileceği anlamına gelir. Sayı 1–10000, süre 1–86400 saniye arasında tam sayı olmalıdır. Yeni hesap gözleminde sabit hesap yaşı kuralı açıklanır; desteklenmeyen limit formu gösterilmez.

`/guard modules` aynı koruma seçicisini açar. Korumayı açıp kapatabilir; izleme/koruma modu ile kaydetme, uyarma, tehlikeli rolleri kaldırma, atma, yasaklama, doğrulamayı yükseltme veya desteklenen değişikliği geri alma yanıtını seçebilirsiniz. Teknik modül kimlikleri yazmanız gerekmez.

Yeni kurulum **İzleme** modunda başlar; otomatik ceza uygulanmaz. Yeni sıfır tolerans profili için `/guard panel` → Güvenlik Özeti → **🛡️ Korumayı Aktifleştir** seçin ve onaylayın. Uygun yönetim korumaları birlikte etkinleşir; eski kapalı modül ve eşik tercihleri ilk ihlal müdahalesini engellemez. **🔓 İzleme Moduna Geç** otomatik müdahaleyi durdurur. Bireysel eşik/yanıt ayarları eski seçici yapılandırmada kullanılır. Genel modu `/guard mode` üzerinden seçin. Whitelist, sunucu sahibi/bot muafiyeti, kimlik doğrulama ve rol hiyerarşisi kontrolleri sürer.

İsteğe bağlı raid özellikleri yalnızca gözlem yapar. Üye/hesap gözlemi için portalda Server Members intentini ve `ENABLE_MEMBERS_INTENT=true` ayarını; mesaj/mention sayımı için `ENABLE_MESSAGE_MONITORING=true` ayarını kullanın. Çekirdek koruma Message Content intentine ihtiyaç duymaz.

## Yedekleme ve kurtarma

Panelin Yedekleme ve Kurtarma bölümünden yedek oluşturup bir yedeği seçerek önizleme açabilirsiniz. Slash seçenekleri:

```text
/guard backup create
/guard backup list
/guard backup restore id:<yedek-referansı>
/guard backup jobs
```

Geri yükleme **önizleme ve tek kullanımlık onay** gerektirir. Mevcut desteklenen ayarlar ve izinler güncellenir; eksik roller/kanallar yeni kimlikle oluşturulur. Fazladan kaynaklar silinmez. İzinleri değiştirmek kanal görünürlüğünü etkileyebilir; önizlemeyi okuyun.

Silinmiş kimlikler, mesajlar, üyeler, üye rol atamaları, rol sıraları, simgeler, yönetilen roller, forum/sahne kanalları ve konu içerikleri aynen geri getirilemez. Entegrasyon ve medya varlıkları da bu yedeklerden kurulmaz. İşlem kısmen başarılı olabilir; `/guard backup jobs id:<işlem-referansı> page:1` ile kaynak sonuçlarını inceleyin. Sonucu belirsiz oluşturma işlemleri kopya kaynakları önlemek için otomatik tekrarlanmaz.

Genel Ayarlar içinden yedek sayısı, geçmiş saklama süresi ve otomatik yedek aralığı ayarlanır. Aralık 0 ise zamanlama kapalıdır. Bot kapalıyken yedek alınmaz. Veritabanı dosyasını yedeklerken botu temiz biçimde durdurun veya SQLite'ın çevrimiçi yedekleme yöntemini kullanın.

## Yardım ve sorun giderme

`/guard help` veya paneldeki Yardım, modları, whitelist kapsamını, limitleri, yedeklemeyi ve gereken yetkileri açıklar. Korumaların ayrıntılı işlevleri koruma seçicisinde gösterilir.

Komut görünmüyorsa `pnpm register`, uygulama kimliği ve kurulum kapsamlarını kontrol edin. Yetki uyarılarında `/guard health` açın. Olayın sorumlusu doğrulanamamışsa bot ceza vermez; normal üye ayrılması atılma kanıtı değildir. Hata mesajları seçili dilde çözüm önerir; teknik ayrıntılar yerel günlüklerde kalır.

Desteklenen geri yükleme sınırları ve Docker bilgileri için [operasyon rehberine](OPERATIONS.md), tüm komutlar için [komut referansına](COMMANDS.md) bakın.

## Bot görünümü ve ses bağlantısı

Bot Görünümü artık salt okunurdur; panelden durum/etkinlik/Hakkımda düzenlenmez. `src/configuration/bot-profile.ts` dosyasında `status`, `activityType`, `activityText`, `aboutMe` ve `syncAboutMeOnStartup` alanlarını düzenleyin; `pnpm build` ardından yeniden `pnpm start` çalıştırın. Özel etkinlik doğru `state` alanını kullanır. Hakkımda, resmi uygulama açıklaması API’siyle en fazla 400 karakter olarak eşitlenir; eşitse istek gönderilmez. Eşitlemeyi kapatmak için `syncAboutMeOnStartup: false` kullanın. Alternatif: Discord Developer Portal → General Information → Description. Eski SQLite görünüm kaydı korunur ama kaynak ayarını geçersiz kılamaz.

**Ses Ayarları** sunucuya özeldir. Normal ses kanalını yerel seçiciden seçin veya ID formunu kullanın. Botun Kanalı Görüntüle ve Bağlan izinleri olmalıdır; GuildVoiceStates intenti uygulamada açıktır. Varsayılan otomatik bağlanma kapalı, kendi mikrofonunu ve kulaklığını kapatma açıktır. Kanal seçtikten sonra Bağlan veya Otomatik Bağlanmayı Aç seçin. Bağlan/Kes/Yeniden Bağlan ve mikrofon/kulaklık kontrolleri aynı bölümde bulunur.

Manuel bağlantıyı kesmek yeniden başlatma sonrasında da otomatik bağlanmayı duraklatır. Bağlan, Yeniden Bağlan veya Otomatik Bağlanmayı Aç bunu kaldırır. Geçici hatalarda en fazla beş kez artan beklemeyle yeniden denenir; kanal silinmesi veya izin kaybında deneme durur ve ayarı düzeltmeniz gerekir. Gerçekte bağlanılan kanal ve durum panelde gösterilir. Bot kapalıyken/host çevrimdışıyken kanalda kalamaz; ses çalma veya kayıt yapılmaz.

**Genel Ayarlar → Güvenlik Modu** üzerinden genel İzleme/Koruma ve onaylı acil doğrulama değişiklikleri yönetilir. Kritik yanıtlar, whitelist kaldırma/yükseltme, yedek silme/geri yükleme ve ayar sıfırlama onay ister. Guard sıfırlama olayları, whitelist kayıtlarını, yedekleri, dili, görünüm ve ses ayarlarını korur; etkin acil doğrulamayı ayrıca kendi kontrolünden kapatın.

Güncellemeden sonra mevcut `.env` dosyasına `BOT_OWNER_ID=kendi_Discord_kullanıcı_ID_değeriniz` ekleyin, `pnpm register`, `pnpm build`, `pnpm start` çalıştırın. Kapatıp yeniden başlatmak için konsolda Ctrl+C kullanın; tekrar `pnpm start` çalıştırın. Bu sürümün gerçek Discord görünümü ve ses bağlantısı kontrollü sunucuda henüz doğrulanmamıştır.

## Tek düğmeli Anti-Nuke

`/guard panel` → **Güvenlik Özeti** → **🛡️ Korumayı Aktifleştir**. Sağlık kontrolü ve Tam Koruma Modu açıklamasını inceleyip onaylayın. Her modülü tek tek açmanız gerekmez. Uygun yönetim korumaları ilk doğrulanmış izinsiz işlemde önce sorumlunun yönetilebilir tehlikeli rollerini kaldırır, ardından güvenle uygulanabilen geri almayı ayrı kuyrukta dener. Bot sahibi, gerçek sunucu sahibi, botun kendisi ve ilgili işlem için whitelist kapsamındaki kullanıcı/rol/botlar muaftır.

**🔓 İzleme Moduna Geç** yeni otomatik etkileri durdurur; izleme sürer. İlk etkinleştirmeden önceki gecikmiş olaylar cezalandırılmaz. Koruma ayarı yeniden başlatmada korunur. Bireysel tercihler saklanır; Protect sırasında profil merkezi yönetilir. Normal sohbet, ses, tepkiler; sıradan davet/thread işlemleri ve raid gözlemleri ceza sebebi değildir.

Kanal/rol oluşturma-silme ve desteklenen alanlar, overwrite işlemleri, güvenilir geçmişle ban/unban, üye rol farkı, desteklenen sunucu alanları ve yeni webhook/AutoMod kuralları için gerçek geri alma adaptörleri vardır. Kanal/rol silme kurtarması onaylanmış olay öncesi yedek ister. Rol üyeliği yalnızca tam ve güvenilir geçmiş varsa sınırlı olarak geri atanır; müdahale edilmiş saldırganlara otomatik yetki verilmez. Atılan kullanıcı zorla geri katılamaz; mesajlar ve eski kimlikler kurtarılamaz. Diğer işlemler ve eksik kanıt durumları açıkça başarısız/kısmi/desteklenmiyor olarak kaydedilir.

Eksik izinler, rol hiyerarşisi, güvenilir yedek bulunmaması ve belirsiz API sonuçları panelde/günlüklerde gösterilir. İşlem Discord tarafından gerçekleştikten sonra algılanabilir; bu sistem sıfır hasar garantisi değildir. Yeni `.env` alanı yoktur; mevcut sahip, görünüm ve ses ayarları korunur. Önce `pnpm build`, ardından `pnpm start` çalıştırın. Ayrıntılı yetenek/sınır tablosu `docs/ANTI_NUKE.md` içindedir. Gerçek Discord testi kontrollü sunucuda yapılmalıdır.

## Kalıcı kanal paneli

BOT_OWNER_ID hesabıyla istediğiniz metin/duyuru kanalında `/guard panel` çalıştırın. Bot kanala herkesin görebildiği tek bir kalıcı mesaj gönderir; komut size bu mesajın bağlantısını özel olarak verir. Tekrar çalıştırmak aynı mesajı yeniler, yeni kopya üretmez. Bölümler, Geri/Ana Menü ve koruma kontrolleri bu mesaj üzerinden çalışır. Bot yeniden başladığında kayıtlı mesaj ana özete döner; düğmelerin on dakikalık süresi yoktur.

Panel **görünür**, kontrol yetkisi yalnızca **BOT_OWNER_ID** hesabındadır. Sunucu sahibi/Administrator/whitelist bu yetkiyi vermez. Whitelist kişileri, olay ayrıntıları, yedekler ve tanılama gibi hassas bilgiler **Özel Yönetimi Aç** üzerinden özel gösterilir. Özel form/onaylar on dakika veya yeniden başlatma sonrasında yeniden açılmalıdır; ana panel çalışmaya devam eder.

**Panel Ayarları** ile yerel kanal seçicisinden hedef seçip özel onay vererek taşıyın. Eski kontroller kaldırılır; kayıt yalnızca yeni mesajı yetkili sayar. **Paneli Sabitle** yalnızca bu mesajı sabitler; uygun Mesajları Sabitle/Mesajları Yönet yetkisini kontrol eder. Başka mesajların sabitleri değiştirilmez.

Kanalda bot için Kanalı Görüntüle, Mesaj Geçmişini Oku, Mesaj Gönder ve Bağlantı Yerleştir izinleri gerekir. Mesaj/kanal silinirse bot otomatik kopyalar göndermez; geçerli hedef kanalda `/guard panel` çalıştırın. Önceki gönderim sonucu belirsizse kopya oluşturmamak için yerel panel_creation günlüğü ve kanal elle doğrulanmalıdır. Veri değişiklikleri birleştirilerek aynı mesajı yeniler; gereksiz saniyelik düzenleme döngüsü yoktur. Bot kapalıyken mesaj görünür kalır, kontroller için botun çalışması gerekir.

Güncelleme için mevcut `.env` ve verileri koruyun; yeni ortam alanı yoktur. Node 24 ile `pnpm build`, ardından `pnpm start` kullanın. Gerçek Discord görünümü ve sabitleme canlı sunucuda henüz doğrulanmadı. Ayrıntılar: `docs/PERMANENT_PANEL.md`.

## Ses kanalı listesi açılmıyorsa

Ses ekranındaki **Ses Kanalı Kimliği Gir** düğmesi doğrudan bir form açar. Discord → Kullanıcı Ayarları → Gelişmiş → Geliştirici Modu seçeneğini açın; ses kanalına sağ tıklayıp **Kanal Kimliğini Kopyala** seçin ve forma yapıştırın. Kanal listesinin açılması Discord istemcisi tarafından yönetilir; bot ancak seçim yapıldıktan sonra etkileşim alır. Form alternatif bir seçim yoludur; ses bağlantısı zaman aşımını düzeltmez. Kaydettikten sonra **Bağlan** seçin veya Otomatik Katılma ayarını kullanın; gerçek bağlantı durumunu panelden kontrol edin. Güncellemeden sonra botu yeniden derleyip başlatın ve panelde Yenile düğmesine basın.
