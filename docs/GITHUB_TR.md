# GitHub'a yükleme

Bu proje Node.js 24 LTS ve pnpm 11.25.0 kullanır. İlk kurulum, izinler ve çalışma biçimi için [README](../README.md); kullanım için [Türkçe rehber](USAGE_TR.md). Mevcut MIT lisansı korunur.

## Hazır paketi kullanma

Hazırlanan kaynak ZIP dosyasını boş bir klasöre açın. ZIP, kaynak kodu, testler, kilit dosyası, belgeler ve gizli nokta dosyalarını içerir. ZIP dosyasını GitHub'a tek dosya olarak yüklemek yerine içeriğini bir Git deposu olarak gönderin; böylece README ve Actions çalışır.

GitHub üzerinde boş bir depo oluşturun; README, lisans veya gitignore eklemeyin. Yeni klasörde PowerShell açıp aşağıdaki komutları çalıştırın. Uzak depo adresini kendi adresinizle değiştirin.

```powershell
git init -b main
git add .
git diff --cached --stat
git diff --cached --name-only
git commit -m "Initial Ultimate Guard source"
git remote add origin https://github.com/KULLANICI/DEPO.git
git push -u origin main
```

Commit öncesinde listede yalnızca paylaşmak istediğiniz dosyalar olduğunu kontrol edin. Mevcut D:\bot\guard deposunu kullanıyorsanız yeniden init gerekmez; mevcut remote ve geçmişi kontrol edin, force push kullanmayın.

## Paylaşılmayan yerel dosyalar

- Gerçek `.env` ve varyantları; yalnızca boş/örnek değerler içeren `.env.example` paylaşılır.
- `data/`, SQLite dosyaları, günlükler, yedekler, dışa aktarımlar ve özel anahtarlar.
- `node_modules/`, `dist/`, `work/`, önbellekler ve editör ayarları.

Gitignore daha önce takip edilmiş dosyaları geçmişten silmez. Bir token yanlışlıkla yayımlanmışsa önce Discord Developer Portal'dan yenileyin; yalnızca dosyayı silmek yeterli değildir. Gerçek tokenı GitHub issue, PR veya Actions girdisine yapıştırmayın.

## GitHub ayarları

Quality iş akışı push ve pull request üzerinde typecheck, lint, test, build, çevrimdışı smoke ve Docker image build çalıştırır. Bot tokenı veya GitHub Actions secrets gerekmez; iş akışı botu başlatmaz ve Discord'a giriş yapmaz. İlk uzak çalışmanın sonucunu Actions sekmesinden kontrol edin.

Depo ayarlarında kullanılabiliyorsa private vulnerability reporting ve secret scanning açın. Ana dal için Quality / verify kontrolünü zorunlu kılabilirsiniz. Bağımlılık güncellemeleri mevcut Dependabot yapılandırmasından gelir.

Botu çalıştıracağınız makinede `.env.example` dosyasını `.env` olarak kopyalayıp yerel değerleri girin; GitHub'a eklemeyin. Ses bağlantısı ve gerçek Discord izin işlemleri için canlı doğrulama ayrıca gereklidir.
