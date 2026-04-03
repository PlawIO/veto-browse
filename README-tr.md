<h1 align="center">
    <img src="https://github.com/user-attachments/assets/ec60b0c4-87ba-48f4-981a-c55ed0e8497b" height="100" width="375" alt="banner" /><br>
</h1>

<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/PlawIO/nanobrowser)
[![Twitter](https://img.shields.io/badge/Twitter-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/yazcal)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/NN3ABHggMK)
[![Docs](https://img.shields.io/badge/Docs-0F172A?style=for-the-badge&logo=gitbook&logoColor=white)](https://docs.veto.so)

</div>

## 🌐 veto-browse

veto-browse, tarayıcınızda çalışan açık kaynaklı bir yapay zeka tarayıcı otomasyon aracıdır. Esnek LLM seçenekleri ve çoklu ajan sistemiyle birlikte OpenAI Operator’a ücretsiz bir alternatiftir.

⬇️ [veto-browse’ı Chrome Web Mağazası’ndan ücretsiz edinin](https://github.com/PlawIO/nanobrowser/releases)

👏 Topluluğa katılın: [Discord](https://discord.gg/NN3ABHggMK) | [X](https://x.com/yazcal)

❤️ veto-browse’ı sevdiniz mi? Bize bir yıldız ⭐ verin ve yayılmasına yardımcı olun!

<div align="center">
<img src="https://github.com/user-attachments/assets/112c4385-7b03-4b81-a352-4f348093351b" width="600" alt="veto-browse Demo GIF" />
<p><em>veto-browse’ın çoklu ajan sistemi, HuggingFace'i gerçek zamanlı analiz ederken; Planner engellerle karşılaştığında akıllıca kendi kendini düzeltir ve Navigator’a yaklaşımını dinamik olarak ayarlamasını söyler—tüm bunlar yerel olarak tarayıcınızda gerçekleşir.</em></p>
</div>

## 🔥Neden veto-browse?

OpenAI Operator'ın aylık 200 dolarlık ücretinden kurtulmak mı istiyorsunuz? **veto-browse**, bir Chrome uzantısı olarak size premium tarayıcı otomasyonu yetenekleri sunar ve tam kontrolü elinizde tutmanızı sağlar:

- **%100 Ücretsiz** - Abonelik ücreti veya gizli maliyetler yok. Sadece yükleyin ve kendi API anahtarlarınızı kullanın, ne kadar kullanırsanız o kadar ödersiniz.
- **Gizlilik Odaklı** - Her şey yerel tarayıcınızda çalışır. Kimlik bilgileriniz yalnızca sizde kalır, bulut hizmetleriyle paylaşılmaz.
- **Esnek LLM Seçenekleri** - Tercih ettiğiniz LLM sağlayıcılarına bağlanın, farklı ajanlar için farklı modeller seçme özgürlüğünüz olsun.
- **Tamamen Açık Kaynak** - Tarayıcınızın nasıl otomatikleştirildiğini şeffaf bir şekilde görün. Gizli süreçler yok.

> **Not:** Şu anda OpenAI, Anthropic, Gemini, Ollama, Groq, Cerebras ve OpenAI uyumlu özel sağlayıcıları destekliyoruz. Daha fazlası yolda.

## 📊 Temel Özellikler

- **Çoklu Ajan Sistemi**: Uzmanlaşmış yapay zeka ajanları, karmaşık web görevlerini birlikte gerçekleştirir
- **Etkileşimli Yan Panel**: Gerçek zamanlı durum güncellemeleriyle sezgisel sohbet arayüzü
- **Görev Otomasyonu**: Web siteleri arasında tekrar eden görevleri sorunsuz şekilde otomatikleştirir
- **Takip Soruları**: Tamamlanan görevler hakkında bağlamsal takip soruları sorabilirsiniz
- **Konuşma Geçmişi**: Yapay zeka ajanlarınızla olan geçmiş etkileşimlere kolay erişim
- **Çoklu LLM Desteği**: Tercih ettiğiniz LLM sağlayıcılarına bağlanın, farklı ajanlara farklı modeller atayın

## 🌐 Tarayıcı Desteği

**Resmi olarak desteklenenler:**
- **Chrome** – Tüm özelliklerle tam destek
- **Edge** – Tüm özelliklerle tam destek

**Desteklenmeyenler:**
- Firefox, Safari ve diğer Chromium türevleri (Opera, Arc vb.)

> **Not**: veto-browse diğer Chromium tabanlı tarayıcılarda çalışabilir, ancak en iyi deneyim ve garantili uyumluluk için Chrome veya Edge öneriyoruz.

## 🚀 Hızlı Başlangıç

1. **Chrome Web Mağazası’ndan Kurulum** (Kararlı Sürüm):
   * [veto-browse Chrome Web Mağazası sayfasına](https://github.com/PlawIO/nanobrowser/releases) gidin
   * "Chrome’a Ekle" butonuna tıklayın
   * Kurulumu onaylayın

> **Önemli Not**: En yeni özellikler için aşağıdaki ["En Son Sürümü Manuel Kur"](#-en-son-sürümü-manuel-kur) kısmından kurulum yapmanızı öneririz. Chrome Web Mağazası versiyonu inceleme süreci nedeniyle gecikebilir.

2. **Ajan Modellerini Yapılandırın**:
   * Araç çubuğundaki veto-browse simgesine tıklayın
   * Sağ üstteki `Ayarlar` simgesine tıklayın
   * LLM API anahtarlarınızı ekleyin
   * Farklı ajanlar (Navigator, Planner) için hangi modelin kullanılacağını seçin

## 🔧 En Son Sürümü Manuel Kur

En yeni özellikleri içeren en güncel sürümü kurmak için:

1. **İndirin**
    * Resmi Github [sürüm sayfasından](https://github.com/PlawIO/nanobrowser/releases) en güncel `veto-browse.zip` dosyasını indirin

2. **Kurulum**:
    * `veto-browse.zip` dosyasını çıkarın
    * Chrome'da `chrome://extensions/` adresine gidin
    * Sağ üstten `Geliştirici modu`nu etkinleştirin
    * Sol üstte `Paketlenmemişi yükle`ye tıklayın
    * Çıkardığınız `veto-browse` klasörünü seçin

3. **Ajan Modellerini Yapılandırın**
    * veto-browse simgesine tıklayarak yan paneli açın
    * Sağ üstteki `Ayarlar` simgesine tıklayın
    * API anahtarlarınızı ekleyin
    * Ajanlara model atayın (Navigator, Planner)

4. **Güncelleme**:
    * Yeni `veto-browse.zip` dosyasını indirin
    * Mevcut veto-browse dosyalarını yenileriyle değiştirin
    * `chrome://extensions/` sayfasına gidip veto-browse kartındaki yenile simgesine tıklayın

## 🛠️ Kaynaktan Derleme

veto-browse’ı kendiniz derlemek isterseniz şu adımları izleyin:

1. **Gereksinimler**:
   * [Node.js](https://nodejs.org/) (v22.12.0 veya üstü)
   * [pnpm](https://pnpm.io/installation) (v9.15.1 veya üstü)

2. **Depoyu Klonlayın**:
   ```bash
   git clone https://github.com/PlawIO/nanobrowser.git veto-browse
   cd veto-browse
   ```

3. **Bağımlılıkları Yükleyin**:

   ```bash
   pnpm install
   ```

4. **Eklentiyi Derleyin**:

   ```bash
   pnpm build
   ```

5. **Eklentiyi Yükleyin**:

   * Derlenen eklenti `dist` klasöründe bulunur
   * Manuel Kurulum bölümündeki adımları takip ederek yükleyin

6. **Geliştirme Modu** (isteğe bağlı):

   ```bash
   pnpm dev
   ```

## 🤖 Model Seçimi

veto-browse, her ajan için farklı LLM modelleri ayarlamanıza olanak tanır. Böylece performans ve maliyet arasında denge kurabilirsiniz. İşte önerilen yapılandırmalar:

### Daha Yüksek Performans

* **Planner**: Claude Sonnet 4

  * Daha iyi mantıksal düşünme ve planlama
* **Navigator**: Claude Haiku 3.5

  * Web gezintisi görevlerinde verimli
  * Performans ve maliyet dengesi

### Uygun Maliyetli Yapılandırma

* **Planner**: Claude Haiku veya GPT-4o

  * Düşük maliyetle makul performans
  * Karmaşık görevlerde daha fazla yineleme gerekebilir
* **Navigator**: Gemini 2.5 Flash veya GPT-4o-mini

  * Hafif ve ekonomik
  * Temel gezinme görevleri için yeterli

### Yerel Modeller

* **Kurulum Seçenekleri**:

  * Ollama veya diğer OpenAI uyumlu sağlayıcılar ile modelleri yerel olarak çalıştırın
  * Sıfır API maliyeti ve tam gizlilik

* **Önerilen Modeller**:

  * **Qwen3-30B-A3B-Instruct-2507**
  * **Falcon3 10B**
  * **Qwen 2.5 Coder 14B**
  * **Mistral Small 24B**
  * [Topluluktan en son test sonuçları](https://gist.github.com/maximus2600/75d60bf3df62986e2254d5166e2524cb)
  * Diğer yerel modellerle deneyimlerinizi [Discord](https://discord.gg/NN3ABHggMK)'da paylaşabilirsiniz

* **Prompt Mühendisliği**:

  * Yerel modeller daha net ve özgül komutlar ister
  * Yüksek seviyeli, belirsiz komutlardan kaçının
  * Karmaşık görevleri adım adım açık şekilde verin
  * Net bağlam ve kısıtlamalar belirtin

> **Not**: Ucuz yapılandırmalar daha az kararlı çıktı verebilir ve karmaşık görevlerde daha fazla yineleme gerekebilir.

> **İpucu**: Kendi model yapılandırmalarınızı denemekten çekinmeyin! Harika bir kombinasyon buldunuz mu? [Discord](https://discord.gg/NN3ABHggMK)'da toplulukla paylaşın.

## 💡 Uygulamalı Örnekler

Sadece bir cümleyle gerçekleştirebileceğiniz güçlü görevlerden bazıları:

1. **Haber Özeti**:

   > "TechCrunch'a git ve son 24 saatteki en popüler 10 başlığı çıkar"

2. **GitHub Araştırması**:

   > "En çok yıldız almış popüler Python depolarını GitHub'da bul"

3. **Alışveriş Araştırması**:

   > "Amazon’da suya dayanıklı, 10 saat batarya ömrüne sahip, 50 doların altında taşınabilir bir Bluetooth hoparlör bul"

## 🛠️ Yol Haritası

veto-browse için heyecan verici yeni özellikler geliştiriyoruz, katılmak ister misiniz?

Detaylı yol haritamıza ve gelecek özelliklere [GitHub Discussions](https://github.com/PlawIO/nanobrowser/discussions/85) üzerinden göz atabilirsiniz.

## 🤝 Katkıda Bulunun

**veto-browse’ı daha iyi hale getirmemize yardım edin!** Her türden katkıya açığız:

* **Prompt & Kullanım Senaryoları Paylaşın**

  * [Discord sunucumuza](https://discord.gg/NN3ABHggMK) katılın
  * veto-browse’ı nasıl kullandığınızı anlatın ve topluluk kütüphanemizi büyütün
* **Geri Bildirim Verin**

  * veto-browse’ı deneyin ve performansı hakkında önerilerinizi paylaşın
* **Kod Katkısı Yapın**

  * Kod katkısı için yönergeleri [CONTRIBUTING.md](CONTRIBUTING.md) dosyasında bulabilirsiniz
  * Hatalar, özellikler veya dökümantasyon iyileştirmeleri için pull request gönderin

Açık kaynak ve topluluk iş birliğine inanıyoruz. Tarayıcı otomasyonunun geleceğini birlikte inşa edelim!

## 🔒 Güvenlik

Bir güvenlik açığı keşfederseniz, lütfen bunu açık şekilde **issue, pull request veya discussion** yoluyla paylaşmayın.

Bunun yerine, [GitHub Güvenlik Danışma Sayfası](https://github.com/PlawIO/nanobrowser/security/advisories/new) üzerinden özel olarak bildirin. Böylece açığı kamuya açıklanmadan önce düzeltme şansı buluruz.

veto-browse’ı ve kullanıcılarını güvende tutmaya yardım ettiğiniz için teşekkür ederiz!

## 💬 Topluluk

Giderek büyüyen geliştirici ve kullanıcı topluluğumuza katılın:

* [Discord](https://discord.gg/NN3ABHggMK) – Ekip ve toplulukla sohbet edin
* [Twitter](https://x.com/yazcal) – Güncellemeler ve duyurular
* [GitHub Discussions](https://github.com/PlawIO/nanobrowser/discussions) – Fikirlerinizi paylaşın ve sorular sorun

## 👏 Teşekkürler

veto-browse, şu harika açık kaynak projeler üzerine inşa edilmiştir:

* [Browser Use](https://github.com/browser-use/browser-use)
* [Puppeteer](https://github.com/EmergenceAI/Agent-E)
* [Chrome Extension Boilerplate](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)
* [LangChain](https://github.com/langchain-ai/langchainjs)

Tüm yaratıcılarına ve katkıda bulunanlara büyük teşekkürler!

## 📄 Lisans

Bu proje Apache License 2.0 ile lisanslanmıştır – detaylar için [LICENSE](LICENSE) dosyasına bakın.

Sevgiyle yapıldı ❤️ veto-browse Ekibi tarafından.

veto-browse’ı sevdiniz mi? Bize bir yıldız 🌟 verin ve topluluğumuza katılın: [Discord](https://discord.gg/NN3ABHggMK) | [X](https://x.com/yazcal)

---

📘 **Türkçe çeviri katkısı**: Burak Can Öğüt
