# Focus Companion — Attention, Agent ve UI Tasarımı (MVP)

Tarih: 2026-10-31 · Sahip: İrem (attention/, agent/, extension/) · Memory: Safa (memory/)
Teslim: **4 Kasım 2026, 21:00 ET** (Meta Global AI Developer Hackathon, Indie track). Değerlendirme **demo videosu + repo** üzerinden.

## 1. Niyet ve neden

ADHD'li ve dikkati çabuk dağılan kişiler için bir **buddy**: tarayıcıda ne yaptığını izler, hedefinden koptuğunu fark eder ve seninle konuşarak seni geri getirir. Cezalandıran ya da engelleyen bir araç değil; yanında oturan, ne yapmak istediğini bilen bir arkadaş.

Kullanıcının kendi deneyimi (İrem): iş ortasında Spotify, YouTube, e-postaya kayıyor. Kısa kaçamaklar sorun değil; sorun farkında olmadan uzun kalmak ya da sürekli sekme arasında zıplamak. İstenen: ~30 sn – 1 dk ilgisiz bir yerde kalınca companion'ın araya girmesi, hedefi hatırlatması, durum sorması, "en son nerede kalmıştın"ı söylemesi.

"İlgisiz" kararı **sabit bir yasaklı listesinden değil, o anki hedefe göre** verilir (e-posta bazen işin parçasıdır; YouTube'da ders videosu iş olabilir). Sistem kullandıkça kişiye özel öğrenir.

Jüri kriterleri: yaratıcılık, teknik iddia, çalışıyor olması. Bu yüzden: **çekirdek dikkat motoru güvenilir ve gösterilebilir olmalı**; teknik hikâye "deterministik dikkat motoru + yalnızca yargı gereken yerde LLM + kişiye özel öğrenme".

## 2. Hedefler, hedef olmayanlar, anti-hedefler

**Hedefler (MVP)**
- Oturum açılışında avatarın konuşmayı başlatması; memory'deki bitmemiş işlere göre "devam mı, yeni mi?" sorup bir hedef oluşturması.
- Hedefe göre her sayfanın ilgili/ilgisiz/nötr olarak değerlendirilmesi.
- ~45 sn civarında kayma ve hızlı sekme zıplamasının (parçalanma) fark edilmesi.
- Kademeli, sayfayı kilitlemeyen müdahale; "Take me back" ile en son ilgili sekmeye tek tıkla dönüş.
- Geri bildirimden öğrenme ("This is for my task" → kalıcı etiket; kişisel tolerans süresi).
- Modlar: Odak / Nazik / Rahatsız Etme / Kapalı.
- Tüm olayların ham bir olay günlüğüne yazılması; metriklerin bu günlükten hesaplanması; kayıt-ve-tekrar-oynat ile test.
- Demo videosunda baştan sona çalışan akış.

**Hedef olmayanlar (bu MVP'de yok)**
- Sistem genelinde (tarayıcı dışı) izleme, masaüstü uygulaması.
- Safa'nın MCP sunucusuna bağlantı (kararlaştırıldı: memory folder import ile çalışıyor; MCP sonra, gecikme ölçülünce değerlendirilecek).
- Muse Code / claude.ai/code oturum bağlantısı (sonraki aşama).
- Ham transcript'lerin (cold layer) kullanılması.
- Chrome Web Store yayını (isteğe bağlı "unlisted" gönderim, yetişirse bonus).
- Web search, MCP araçları, hızlı işlemler gibi genişletmeler.
- Ekran görüntüsü / sayfa içeriği okuma (yalnızca URL + başlık + sinyaller).

**Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)**
- Dırdır eden companion: araştırma yaparken haksız uyarı, aynı şeyi tekrar tekrar söylemek. Yanlış pozitif, yanlış negatiften daha kötüdür.
- Sayfayı bloklayan, modal açan, kapatılamayan müdahale.
- Ahlak dersi, tıbbi/ruh sağlığı tavsiyesi, teşhis dili.
- Demoda takılan akış (LLM gecikmesi kullanıcıya bekleme olarak yansımamalı).

## 3. Kısıtlar

- **Süre:** ~4 gün. Her karar "4 günde demoda sağlam çalışır mı?" ile tartılır. Aşırı mühendislik yok; her adım deneyerek, gözle kontrol edilerek ilerler.
- **Platform:** Chromium MV3 eklentisi, tamamen JavaScript. Ayrı backend yok; model çağrıları eklentiden doğrudan.
- **Build:** Repo şu an build adımı olmayan saf ES modülleri. Bu korunur; tek istisna LangGraph denemesi başarılı olursa agent için esbuild bundle (bkz. §6.3).
- **Model:** `muse-spark-1.3-contributor` (repodaki varsayılan, OpenAI uyumlu, `memory/model.js` üzerinden). Türkiye'den erişilemezse `muse-spark-1.3`. Muse Wonder kullanılmaz. Bütçe 150$ API kredisi.
- **Memory sınırı:** `memory/` Safa'nın. Değiştirilmez; yalnızca `Memory` API'si (memory/README.md) kullanılır. Gerekirse Safa'dan küçük API eklemeleri istenir.
- **Gizlilik:** Yalnızca URL, başlık, sekme sinyalleri. Sayfa içeriği ve ekran görüntüsü gönderilmez.
- **Dil:** Kod, yorumlar, prompt'lar, şablon mesajlar, UI metinleri ve demo videosu **İngilizce**. Companion'ın sesi minimal ve arkadaşça ("Take me back", "Give me 5" tonunda; kurumsal ya da robotik değil). Kullanıcı başka bir dilde yazarsa o dilde cevap verir.
- **Demo verisi:** Gerçek bir brain kullanılmaz. Repoda demo için hazırlanmış sahte bir brain klasörü (`demo/brain/`, brain formatında; bitmemiş işler ve birkaç not) ve örnek bir olay günlüğü (`demo/eventlog.json`) bulunur. Brain import ve options sayfasındaki "import event log" ile yüklenir; replay testleri de aynı günlüğü kullanır. Video bu veriyle tekrar tekrar aynı şekilde çekilebilir.

## 4. Kararlaştırılanlar (İrem ve ekip)

- Chromium tabanlı eklenti (sistem geneli değil).
- İki katmanlı memory: **sıcak** (eklenti içi IndexedDB; activity, olaylar, etiketler, brain'den alınan notlar) ve **soğuk/kalıcı** (Safa'nın second brain'i; şimdilik folder import ile). MCP şimdilik yok.
- Attention, agent ve UI/UX İrem'de; `agent/audit.js` temel alınmaz.
- Deterministik / factual işler script ile; LLM yalnızca yargı gereken yerde ve **structured output** ile. Agent **tool call yapmaz**; model bir niyet/aksiyon döndürür, script uygular.
- Avatar companion konuşmayı başlatır; chat arayüzü + modlar + geri bildirim UI'da.
- Loglama: kişinin tarayıcı kullanım akışını anlamaya yetecek, doğru kaydedilmiş ham veri.
- İlk dikkat motoru tasarımı (v1) kabul edildi; deneyerek iterate edilecek.

## 5. Mimari

### 5.1 Klasörler

```
memory/       Safa — dokunulmaz. Memory API (entries, intent, open loops, contextPack, recordActivity, brain import)
attention/    İrem — saf JS, Chrome'a bağımlı değil, node ile test edilir
              sensor olay modeli, relevance (etiket/önbellek/LLM kapısı), budget, state machine, triggers, policy, eventlog, metrics
agent/        İrem — LLM düğümleri (structured output), diyalog akışları, şemalar, prompt formatlama
              audit.js referans olarak kalır, bağlanmaz
extension/    İrem — Chrome yapıştırıcısı: background.js (yeniden yazılır), sidepanel/, overlay/ (content script), options/
test/         node unit testleri + replay testleri + canlı model testleri
```

### 5.2 Akış

```
chrome.tabs/windows/idle/alarms ─► sensor ─► context olayı ─► relevance ─► budget + state machine ─► trigger
                                                   │  (etiket → önbellek → LLM#1)                     │
                                                   ▼                                                  ▼
                                               eventlog ◄──────────────────────────────────────── policy (mod, cooldown, kademe)
                                                                                                      │
                                         agent (LLM#2–#4, structured) ◄── yalnızca konuşma gerekirse ─┘
                                                   │
                                                   ▼
                                     UI: avatar overlay + baloncuk + butonlar / side panel chat
                                                   │
                         kullanıcı cevabı ─► buton: doğrudan script aksiyonu │ serbest metin: LLM#3 → aksiyon → script
```

Attention "duyular ve refleks"tir: her saniye çalışır, deterministiktir. Agent "ses ve akıl"dır: yalnızca konuşulacağı ya da yargı gerektiğinde çalışır.

### 5.3 Script vs LLM ayrımı

**Script (deterministik):** sensörler, kalma süresi, kayma bütçesi, sekme değişim sıklığı, durum makinesi, tetikler, cooldown, modlar, etiket/önbellek kontrolü, sekmeye dönme, buton aksiyonları, loglama, metrikler, oturum başlangıcı tespiti.

**LLM (yargı):** yalnızca §6.2'deki beş düğüm.

## 6. Bileşenler

### 6.1 Attention motoru (`attention/`)

**Sensör (extension/background.js içinde, olayları attention'a verir)**
- `tabs.onActivated`, `tabs.onUpdated` (url/title/status complete), `windows.onFocusChanged`, `idle.onStateChanged`, `chrome.alarms` 30 sn heartbeat.
- Snapshot: `{ts, tabId, windowId, url, host, title, audible, browserFocused, idleState}`.
- Ses çalan sekmede input yokluğu "uzakta" sayılmaz (repodaki mevcut davranış korunur).
- Eklentinin kendi sayfaları nötrdür.
- Service worker uykuya geçebilir: tüm motor durumu (`state`, `budget`, `currentContext`, `lastRelevant`, `cooldowns`) `chrome.storage.session`'a yazılır ve her olayda oradan okunur. Bellekte tutulan durum doğruluk kaynağı değildir.

**İlgi kararı (relevance)**
- Anahtar: `intentId + host + normalize(title)` (YouTube gibi sitelerde başlık şart; çoğu sitede host yeterli olabilir — builder normalizasyonu belirler).
- Sıra: (1) kullanıcı etiketleri (2) önbellek (3) LLM#1. LLM cevabı beklenirken sayfa **nötr** sayılır.
- Sonuç: `related | unrelated | neutral` + `confidence`. Düşük güvenli `unrelated` (eşik builder'ın, başlangıç 0.6) nötr gibi davranır — anti-hedef: haksız uyarı.
- Nötr kategorisi: arama motorları, yeni sekme, takvim, eklentinin kendisi gibi ara geçişler.

**Kayma bütçesi**
- İlgisiz bağlamda geçen her saniye bütçeye eklenir; ilgili bağlamda bütçe azalır (decay); nötrde sabit kalır.
- Bütçe tolerans eşiğini aşınca `drift` tetiği.
- Ayrıca son 2 dk'daki sekme değişim sayısı ve ilgisiz payı izlenir → `fragmentation` tetiği.
- Başlangıç değerleri (builder ayarlar, replay ile doğrular): tolerans ~45 sn; decay ilgisiz birikimin ~2 katı hızında; fragmentation: 2 dk'da ≥6 geçiş ve süre payının ≥%50'si ilgisiz.

**Durum makinesi**
`focused` · `detour` (ilgisiz, bütçe eşik altı) · `drifting` · `away` (idle / tarayıcı odak dışı / ekran kilidi) · `break` (kullanıcı ilan etti, süreli) · `paused` (Rahatsız Etme / Kapalı) · `no_intent`.

**En son ilgili yer:** son `related` bağlamın `{tabId, url, title, ts}`'si her zaman tutulur. Sekme kapandıysa URL yeni sekmede açılır.

**Tetikler**
| Tetik | Koşul |
|---|---|
| `session_start` | Günün ilk aktif tarayıcı odağı ya da eklenti etkinleştirildi ve aktif hedef yok |
| `drift` | Bütçe toleransı aştı |
| `fragmentation` | §kayma bütçesindeki koşul |
| `return` | `away` → aktif, uzaklık ≥ birkaç dakika (builder: ~5 dk) |
| `break_over` | İlan edilen mola süresi doldu |
| `checkin` | Uzun kesintisiz odak (builder: ~25 dk) — hafif, opsiyonel |

**Politika (deterministik)**
- Mod: Odak = tüm tetikler; Nazik = toleranslar ~2 katı, yalnızca L1–L2; Rahatsız Etme = sensör ve log çalışır, müdahale yok (tetikler `suppressedBy: "dnd"` ile loglanır); Kapalı = sensör de durur.
- Kademe: **L1** avatar dikkat animasyonu, metin yok, LLM yok → **L2** baloncuk: kısa soru + butonlar (*Take me back*, *This is for my task*, *5-min break*) → **L3** hedef + "en son şunu yapıyordun" + *Take me back*. Kullanıcı tepki vermezse ve kayma sürerse bir sonraki kademeye geçilir.
- Cooldown: aynı tetik tipi için bekleme (builder: L2 sonrası ~2 dk). Bastırılan tetikler de loglanır.
- Müdahale hiçbir zaman sayfayı kilitlemez; avatar küçültülebilir.

**Öğrenme (deterministik)**
- *This is for my task* → etiket `{host(+title pattern), intentTopic, label: related}` sıcak katmana; ayrıca `memory.add({kind: "preference", ...})` ile memory'ye bir kayıt (brain'e export edilebilir).
- Kişisel tolerans: host başına; kullanıcı müdahaleden önce kendiliğinden dönüyorsa tolerans artar, müdahaleyi görmezden gelip uzun kalıyorsa azalır (basit üstel ortalama; sınırlar 20–120 sn).

### 6.2 Agent (`agent/`)

Beş LLM düğümü. Hepsi JSON şemaya göre structured output döndürür; şema doğrulaması başarısızsa bir kez hata metniyle tekrar sorulur, yine olmazsa deterministik fallback.

| # | Düğüm | Ne zaman | Girdi (ham state'ten formatlanır) | Çıktı | Fallback |
|---|---|---|---|---|---|
| 1 | `classifyRelevance` | Etiket/önbellekte olmayan yeni bağlam | hedef, adımlar, host, title, kullanıcı etiket örnekleri | `{label, confidence, reason}` | `neutral` |
| 2 | `openSession` | `session_start` diyaloğu | açık döngüler, son hedef, kullanıcının cevabı | `{message, intent?: {title, steps[], estMin, topic}, continueLoopId?, needsMore: bool}` | şablon soru |
| 3 | `interpretReply` | Kullanıcı serbest metin yazdı | konuşma geçmişi, attention snapshot | `{action: "label_relevant"\|"break"\|"new_intent"\|"complete_intent"\|"set_mode"\|"chat", args, reply}` | `chat` + şablon cevap |
| 4 | `composeNudge` | L2/L3 müdahalesi | tetik olayı, hedef, en son ilgili yer, kişisel örüntüler | `{message, buttons[]}` | şablon mesaj (hemen gösterilir; LLM cevabı ~2 sn içinde gelirse değiştirilir) |
| 5 | `reflect` | Saatlik alarm ve oturum sonu | olay günlüğünden hesaplanmış özet | `{patterns[], suggestions[]}` → memory'ye `lesson`/`fact` | atla |

Persona kuralları (tüm düğümler): kısa, sıcak, somut; varsayılan İngilizce, minimal ve arkadaşça; kullanıcı başka dilde yazarsa o dilde cevap; ahlak dersi ve tıbbi dil yok.

Repodan yeniden kullanılacaklar: `memory/model.js` (`modelClient`), `agent/audit.js`'teki `extractJsonObject` (kopyalanır), `test/live/audit.mjs` senaryoları LLM#1 değerlendirmesi için uyarlanır.

### 6.3 LangGraph.js kararı (ilk gün denemesi)

Diyalog akışları (2, 3, 4 ve aralarındaki "kullanıcı cevabını bekle") LangGraph'ın düğüm + `interrupt()` modeline uyuyor. Ancak tarayıcıda yalnızca `@langchain/langgraph/web` ile çalışıyor (bundle gerekir), service worker uykusunda `MemorySaver` kaybolur ve MV3 service worker'da resmi olarak doğrulanmış değil.

**Karar kapısı (en fazla ~2 saat):** LangGraph.js `/web`, esbuild ile bundle edilip eklentide (tercihen side panel bağlamında ya da IndexedDB checkpointer ile service worker'da) bir grafiği çalıştırıp `interrupt` → resume yapabiliyorsa kullanılır. Yapamıyorsa aynı düğüm/state tasarımı düz fonksiyonlar + basit bir durum nesnesiyle uygulanır. Düğüm tanımları, şemalar ve state tasarımı iki durumda da aynıdır. Attention motoru hiçbir durumda LangGraph'a bağlı değildir.

State ilkeleri (LangGraph'ın "Thinking in LangGraph" rehberinden): state'te ham veri; prompt'lar düğüm içinde formatlanır; geçici hatalar retry/backoff, şema hataları LLM'e geri döner, eksik bilgi kullanıcıya sorulur.

### 6.4 Olay günlüğü ve metrikler (`attention/eventlog`)

Attention'ın kendi IndexedDB veritabanında (memory'ninkinden ayrı; Safa'nın şemasına dokunmamak için) yalnızca ekleme yapılan `events` deposu, `ts` ve `type` indeksli. Ayrıca `labels`, `relevanceCache`, `tolerance` depoları.

```
context    {ts, tabId, host, url, title, audible, browserFocused, idleState}
relevance  {ts, key, label, confidence, source: label|cache|llm|fallback, latencyMs, intentId}
state      {ts, from, to, budget, switches2m}
trigger    {ts, id, type, level, evidence, suppressedBy?}
response   {ts, triggerId, choice, latencyMs}
llm        {ts, node, model, inputTokens, outputTokens, latencyMs, ok, error?}
session    {ts, kind: start|end|intent_set|intent_done|mode, payload}
feedback   {ts, kind: label|tolerance, payload}
```

- Metrikler (odak yüzdesi, kayma sayısı, geri dönüş süresi, müdahale kabul oranı, en çok kayılan siteler, saat bazında kayma) **saklanmaz, hesaplanır**.
- Günlük JSON olarak dışa aktarılabilir (options sayfasında buton) — hata ayıklama, replay ve demo için.
- Repodaki `memory.recordActivity` de beslenmeye devam eder (memory'nin `activity()` ve `distill()` akışları çalışsın diye).
- Saklama: 7 gün (memory ile aynı).

### 6.5 Memory entegrasyonu

| Ne | Nasıl |
|---|---|
| Bitmemiş işler (oturum açılışı) | `memory.openLoops()`, `memory.latestIntent()` |
| Hedef belirleme / bitirme | `memory.setIntent()`, `memory.completeIntent()` |
| İlgi kararı için bağlam | `memory.contextPack({title, url})` (LLM#1'e kısa haliyle) |
| Öğrenilen tercih ve örüntüler | `memory.add({kind: "preference"\|"lesson", topic, ...})` |
| Sekme aktivitesi | `memory.recordActivity()` (mevcut davranış) |
| Brain import / upkeep | mevcut `maintain`, `syncBrain` alarmları korunur |

Etiketler ve tolerans sıcak katmanda attention DB'sinde tutulur (hızlı, her saniye okunur); kalıcı karşılıkları memory'ye yazılır. MCP adaptörü bu tablonun arkasına ileride eklenebilir; arayüz değişmez.

### 6.6 UI/UX (`extension/`)

- **Avatar overlay (content script, Shadow DOM):** aktif sekmeye `chrome.scripting` ile enjekte edilir; sayfa köşesinde küçük, sürüklenebilir, küçültülebilir. Durum animasyonları: `idle`, `watching`, `curious` (L1), `talking` (L2/L3 baloncuk), `celebrating` (hedef tamamlandı / geri dönüldü), `sleeping` (Rahatsız Etme/mola). SVG + CSS animasyon. Enjekte edilemeyen sayfalarda (`chrome://`, Web Store) side panel + badge'e düşülür.
- **Baloncuk:** avatarın yanında; mesaj + en fazla 3 buton + *Talk to me* (side panel'i açar; bkz. §9.3). Hiçbir zaman modal değil.
- **Side panel (popup'ın yerini alır; eklenti ikonuna tıklayınca açılır):** üstte aktif hedef ve adımlar (*Bitti* butonu), mod seçici (4 mod), chat geçmişi ve giriş alanı, bugünün özeti (odak süresi, kayma sayısı, geri dönüş süresi — günlükten hesaplanır).
- **Options sayfası:** mevcut model/anahtar ayarları + brain klasörü bağlama (repoda var) + olay günlüğünü dışa aktarma + ayar sıfırlama.
- `chrome.notifications` yalnızca tarayıcı odak dışındayken mola bitişi gibi durumlar için yedek.
- **Avatarın görsel kimliği henüz tasarlanmadı.** Claude ikonunun sadeliği ve sevimliliği ilham; ama farklı bir yapıda olacak. Görsel tasarım ayrı bir oturumda mockup'larla yapılacak; builder bu süre için yer tutucu basit bir SVG karakterle (durum animasyonları çalışır halde) ilerler.

## 7. Deneyerek kurma sırası

Her adımın sonunda gözle kontrol edilebilir, çalışan bir şey olur:

1. **Sensör + olay günlüğü + dışa aktarma.** Bir saat gerçek gezinme; günlüğe bak.
2. **LLM#1 offline:** kayıtlı bağlamlar ve uyarlanmış senaryolar üzerinde node script'i; doğruluk ve gecikme tablosu. Contributor erişimi burada doğrulanır.
3. **Budget + durum makinesi + tetikler + politika,** kayıtlı günlüğü tekrar oynatan (replay) testlerle ayarlanır.
4. **LangGraph karar kapısı** (§6.3), en fazla ~2 saat.
5. **Overlay avatar + baloncuk + butonlar** (önce şablon mesajlar), "Take me back".
6. **Side panel:** hedef, modlar, chat; `openSession`, `interpretReply`, `composeNudge`.
7. **Öğrenme:** etiketler, tolerans; `reflect`.
8. **Demo verisi (sahte brain + örnek olay günlüğü) + demo senaryosu + video.** Sahte brain erken (adım 1–2 civarı) hazırlanabilir; replay testleri ona dayanır.

Testler: attention/ ve agent şema/parse fonksiyonları için node unit testleri; replay testleri; canlı model testleri (`MODEL_API_KEY`). Mevcut `npm test` yeşil kalır.

## 8. Demo senaryosu (taslak)

Eklenti açılır → avatar "Yesterday you stopped at the demo video edit. Pick it back up?" → hedef belirlenir → çalışma → YouTube'a kayma, ~45 sn sonra avatar bakar, sonra konuşur → *Take me back* ile doğru sekmeye dönüş → başka bir sitede *This is for my task* → bir dahaki sefere sessiz kalır (öğrenme) → hızlı sekme zıplaması → parçalanma uyarısı → side panel'de günün özeti.

## 9. Tasarım sırasında verilen kararlar (Claude'un kararı — İrem kontrol etsin)

Reviewer'ın sorularına verilen, İrem'in onayına açık cevaplar:

1. **Hedef (intent) kaydı attention DB'sinde "gölge" kayıt olarak tutulur.** `memory.setIntent()` yalnızca `{title, next}` alıyor, topic'i `"focus"` olarak sabitliyor ve id'si içerik hash'i (consolidate sırasında değişebilir). Bu yüzden attention DB'sinde `intents` deposu: `{id: uuid (sabit), title, steps[], estMin, topic, createdAt, doneAt?, expiredAt?, memoryEntryId?, fromLoopId?}`. Brain uyumluluğu için `memory.setIntent()` / `completeIntent()` yine çağrılır ve dönen id `memoryEntryId` olarak saklanır; ilgi anahtarı ve etiketler gölge kaydın sabit `id` ve `topic`'ini kullanır. Safa'nın memory API'sinde değişiklik gerekmez; step 6 kimseye bloklu değildir. `continueLoopId` = `memory.openLoops()`'tan seçilen entry; devam edilirse yeni gölge hedef `fromLoopId` ile oluşturulur.
2. **Eski akış kaldırılır.** İrem attention, UI/UX ve agent'ı Safa'nın denemesini temel almadan kuracak (ekip kararı). 5 dk'lık audit, popup ve drift bildirimi yeni akışla değiştirilir; `agent/audit.js` referans olarak kalır, bağlanmaz. `test:e2e` yeni akış için yeniden yazılır (fake model ile: hedef → kayma → overlay → "Take me back"). README'deki klasör sahipliği tablosu güncellenir (`agent/` → İrem).
3. **Agent service worker'da çalışır; overlay'de serbest metin yok.** Overlay baloncuğunda yalnızca butonlar ve *Talk to me* bulunur; *Talk to me* side panel'i açıp giriş alanına odaklar. Böylece diyalog (LLM#2–#3) side panel bağlamında yürür ve LangGraph kapısı side panel'de test edilir. `composeNudge` (LLM#4) ve `classifyRelevance` (LLM#1) tek atımlık çağrılardır; service worker'da düz fonksiyon olarak çalışır, LangGraph'a ihtiyaç duymaz.
4. **Hedefler gün sonunda açık döngüye döner.** Bitmemiş bir gölge hedef, yerel saatle yeni günün ilk aktif odağında (gün sınırı 04:00) ya da ≥6 saatlik uzaklıktan sonra `expiredAt` alır; aktif hedef sayılmaz ve `session_start` tetiklenir. Açılış diyaloğu süresi dolan hedefi "dün şurada kalmıştın" olarak memory'nin açık döngüleriyle birlikte sunar. Kural attention'dadır, memory'de değil.
5. **Geniş host izni kabul edilir.** Overlay'in kayma anında kendiliğinden görünmesi için `scripting` + `<all_urls>` gerekir. Content script yalnızca avatarı çizer; sayfa içeriğini okumaz. Gizlilik ilkesi (yalnızca URL + başlık) değişmez ve README'de açıkça yazılır. Web Store gönderimi isteğe bağlı olduğu için bu bir engel değildir.

## 10. İleriye notlar (v1'de yok)

- **Belirsiz sayfalar için küçük sayfa parçası.** v1 yalnızca URL + başlık kullanır; genel başlıklı sayfalar ("Inbox – Gmail", "Notion", "Untitled document") nötr sayılır ve etiketlerle öğrenilir. Olay günlüğü belirsiz sayfaların sık olduğunu gösterirse: yalnızca LLM#1 düşük güvenle döndüğünde content script'in `h1` + meta description'ı (≤300 karakter) okuması, ayarlardan açılıp kapanabilir şekilde. Sayfa gövdesi ve e-posta içeriği hiçbir zaman okunmaz.
- **Avatar görsel tasarımı** ayrı bir oturumda yapılacak; v1 yer tutucu SVG ile ilerler.
- **Safa'nın MCP sunucusu** (gecikme ölçüldükten sonra) ve **Muse Code bağlantısı** sonraki aşamalar.

## 11. Builder'a bırakılanlar

- Eşik ve sabitlerin kesin değerleri (replay ile ayarlanır).
- Başlık normalizasyonu ve ilgi anahtarının site bazında ayrıntısı.
- Prompt metinleri, persona ifadeleri, şablon mesajlar.
- Overlay'in konumu, sürükleme, boyutlar; side panel düzeni (avatar görsel kimliği hariç, o ayrıca tasarlanacak).
- Service worker / side panel arasında mesajlaşma yapısı.
- Dosya bölümlemesi `attention/` ve `agent/` içinde.
