const messages: Record<string, [string, string]> = {
  "runtime.notReady": [
    "The bot is not connected yet. Try again after it becomes ready.",
    "Bot henüz bağlı değil. Hazır olduktan sonra yeniden deneyin.",
  ],
  "runtime.presenceInvalid": [
    "Choose a valid online status and activity. Activity text must be 1–128 characters with no line breaks; choose No Activity to clear it.",
    "Geçerli bir durum ve etkinlik seçin. Etkinlik metni satır sonu içermeyen 1–128 karakter olmalıdır; kaldırmak için Etkinlik Yok seçin.",
  ],
  "runtime.emojiUnsupported": [
    "Discord currently does not allow bots to set a separate custom-status emoji. You may include supported Unicode characters in the activity text.",
    "Discord şu anda botların ayrı bir özel durum emojisi ayarlamasına izin vermiyor. Etkinlik metnine desteklenen Unicode karakterleri ekleyebilirsiniz.",
  ],
  "runtime.voiceInvalid": [
    "Voice settings could not be validated. Enter a voice-channel ID from this server and use the available switches.",
    "Ses ayarları doğrulanamadı. Bu sunucudaki bir ses kanalının ID’sini girin ve mevcut düğmeleri kullanın.",
  ],
  "runtime.voiceIntent": [
    "Voice State monitoring is unavailable. Enable the GuildVoiceStates intent in the bot configuration and restart.",
    "Ses durumu izleme kullanılamıyor. Bot yapılandırmasında GuildVoiceStates intentini açıp yeniden başlatın.",
  ],
  "runtime.voiceNoChannel": [
    "Choose a voice channel before connecting or enabling Auto Join.",
    "Bağlanmadan veya Otomatik Katılmayı açmadan önce bir ses kanalı seçin.",
  ],
  "runtime.voiceChannelMissing": [
    "The selected voice channel no longer exists. Choose another channel. Automatic retries have stopped.",
    "Seçilen ses kanalı artık yok. Başka bir kanal seçin. Otomatik denemeler durduruldu.",
  ],
  "runtime.voiceWrongGuild": [
    "The selected channel does not belong to this server. Choose a voice channel in the current server.",
    "Seçilen kanal bu sunucuya ait değil. Mevcut sunucudan bir ses kanalı seçin.",
  ],
  "runtime.voiceChannelType": [
    "Choose a regular voice channel. Text and Stage channels are not supported for this connection.",
    "Normal bir ses kanalı seçin. Bu bağlantıda yazı ve sahne kanalları desteklenmiyor.",
  ],
  "runtime.voicePermissions": [
    "The bot needs View Channel and Connect permissions in the selected voice channel. Automatic retries have stopped.",
    "Botun seçilen ses kanalında Kanalı Görüntüle ve Bağlan yetkilerine ihtiyacı var. Otomatik denemeler durduruldu.",
  ],
  "runtime.voiceInterrupted": [
    "This connection change was cancelled by a newer request. Refresh the panel before trying again.",
    "Bu bağlantı değişikliği daha yeni bir istek nedeniyle iptal edildi. Tekrar denemeden önce paneli yenileyin.",
  ],
  "runtime.voiceRetriesExhausted": [
    "Automatic reconnection stopped after five bounded retries. Check the connection and use Reconnect when ready.",
    "Otomatik yeniden bağlanma beş sınırlı denemeden sonra durdu. Bağlantıyı kontrol edip hazır olduğunuzda Yeniden Bağlan düğmesini kullanın.",
  ],
  "runtime.voiceTemporary": [
    "A temporary connection problem was detected. A bounded backoff retry is scheduled.",
    "Geçici bir bağlantı sorunu algılandı. Bekleme aralığı artan sınırlı bir yeniden deneme planlandı.",
  ],
  "runtime.voiceManual": [
    "Disconnected manually. Auto Join will stay suspended until Connect, Reconnect or explicitly enabling Auto Join.",
    "Elle bağlantı kesildi. Bağlan, Yeniden Bağlan veya Otomatik Katılmayı açıkça etkinleştirme işlemine kadar otomatik katılma askıda kalır.",
  ],
  "runtime.voiceGuildUnavailable": [
    "This server is unavailable. Restore access and reconnect explicitly.",
    "Bu sunucuya ulaşılamıyor. Erişimi geri getirip açıkça yeniden bağlanın.",
  ],
};
export const en = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [key, value[0]]),
);
export const tr = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [key, value[1]]),
);
