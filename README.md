# Ultimate Guard

[Türkçe](README.md) | [English](README.en.md)

Discord.js v14, TypeScript ve SQLite ile çalışan Discord sunucu koruma botu.

## Özellikler

- Kanal, rol, izin ve sunucu ayarı değişikliklerini denetim kayıtlarından takip eder.
- Yapılandırılan kurallara göre tehlikeli rolleri kaldırabilir, kullanıcıları atabilir veya yasaklayabilir.
- Kullanıcı, bot ve roller için beyaz liste desteği sunar.
- Desteklenen rol, kanal ve sunucu ayarlarını yedekler; onayla geri yükler.
- Planlı yeniden başlatmalarda tehlikeli rol izinlerini geçici olarak kısıtlayabilir ve kayıtlı izinleri geri yükleyebilir.
- `/guard panel` ile sunucu içinde yönetilir.
- Türkçe ve İngilizce arayüzü, olay kayıtları ve ses kanalına bağlanma desteği bulunur.

Yönetim yetkisi `.env` içindeki `BOT_OWNER_ID` hesabına aittir. Sunucu yöneticisi olmak veya beyaz listede bulunmak yönetim erişimi vermez.

## Kurulum

Node.js 24 LTS ve pnpm 11.25.0 gerekir.

```sh
git clone https://github.com/casicxn/guard-bot.git
cd guard-bot
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
```

`.env.example` dosyasını `.env` adıyla kopyalayıp aşağıdaki alanları doldurun:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
BOT_OWNER_ID=
```

Test sunucusuna özel komut kaydı için `DISCORD_GUILD_ID` ekleyebilirsiniz. `.env` dosyasını ve bot tokenini paylaşmayın.

Discord Developer Portal üzerinden botu `bot` ve `applications.commands` kapsamlarıyla sunucunuza ekleyin. Denetim kaydını görüntüleme iznini ve kullanacağınız işlemler için gereken izinleri verin. Botun rolü, yöneteceği rollerin üzerinde olmalıdır.

```sh
pnpm register
pnpm build
pnpm start
```

Komut kaydı ayrı bir işlemdir; botu başlatmak komutları yeniden kaydetmez. Komutları tüm sunuculara kaydetmek için `DISCORD_GUILD_ID` değişkenini kaldırıp `pnpm register` çalıştırın.

## Kullanım

Bot sahibi hesabıyla:

```text
/guard setup log-channel:#guvenlik-kaydi
/guard health
/guard panel
```

Bot ilk kurulumda izleme modundadır. Paneldeki korumayı etkinleştirme düğmesinden kuralları devreye alabilirsiniz. Dil, beyaz liste, yedekleme ve diğer ayarlar da panelden yönetilir.

Botun durum ve profil metinleri `src/configuration/bot-profile.ts` dosyasından değiştirilir. Değişiklikten sonra yeniden derleyip başlatın. Ses kanalı bağlantısı panelden ayarlanır; ses oynatma veya kayıt özelliği yoktur.

## Yedekleme ve sınırlar

Temiz bir sunucu düzeninde `/guard backup create` ile başlangıç yedeği alın. Geri yükleme önizleme ve bot sahibinin onayını gerektirir. Silinen nesneler yeniden oluşturulursa kimlikleri değişir. Mesajlar, üyelik geçmişi ve her Discord kaynak türü geri getirilemez.

Koruma; botun izinlerine, rol sırasına ve Discord denetim kayıtlarına bağlıdır. İşlemi yapan kişi doğrulanamazsa otomatik ceza uygulanmaz. Canlı Discord ve Docker doğrulaması henüz tamamlanmamıştır; kullanmadan önce ayrı bir test sunucusunda deneyin.

## Docker

`.env` dosyasını hazırladıktan ve komutları kaydettikten sonra:

```sh
docker compose up --build -d
docker compose logs --tail=100 -f guard
```

Veriler `guard-data` biriminde saklanır. `docker compose down -v` bu verileri siler. Aynı token ve veritabanıyla tek bot süreci çalıştırın.

## Geliştirme

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke
```

Testler sahte Discord yanıtları ve geçici veritabanları kullanır. `pnpm smoke`, derlenmiş uygulamayı Discord'a bağlanmadan kontrol eder.

## Lisans

[MIT](LICENSE)
