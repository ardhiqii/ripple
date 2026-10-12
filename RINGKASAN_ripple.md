# Ripple (nama sementara): ringkasan untuk tim

Versi 12 Okt 2026 (diperbarui setelah review tim). Baca ini dulu (5 menit). Detail lengkap ada di `RIPPLE_PROPOSAL_v3.md`, rencana kerja per lane di `TECH_PLAN_ripple.md`.

Nama produk belum final. Kandidat: Shiftwise, Reckon, Kalau. Diputuskan bersama.

---

## Satu kalimat

Asisten AI untuk planner yang membaca kabar perubahan jadwal (chat WA, email), memahami opsi mana yang realistis untuk kasus itu, mencari rencana layak terbaik dengan solver, lalu menyusun ulang rencana logistik. Keputusan akhir tetap di tangan manusia.

## Masalahnya

Di operasi offshore, satu pekerjaan sumur (misalnya ganti pompa ESP) butuh barge, tempat di dek supply boat, cuaca yang aman, dan pompa yang sudah lulus test. Jadwal ini berubah terus: ada yang minta job dimajukan, pompa vendor telat, ombak tinggi, atau alat ternyata siap lebih cepat.

Setiap kali berubah, planner menghitung manual dampaknya ke job lain, kapal, dan kesiapan alat, sambil bolak-balik chat ke vendor dan gudang. Lambat, dan kesalahannya baru ketahuan di lapangan, misalnya barge sudah di lokasi tapi pompanya belum siap.

Perkiraan kasar biayanya (estimasi meja, belum diukur): satu perubahan yang salah urus sekitar USD 58.500 (1 hari barge menganggur + 2 hari sumur telat produksi), atau sekitar USD 1,4 juta per tahun kalau terjadi dua kali sebulan. Ceritanya soal barel dan kapal yang menganggur, bukan soal menghemat jam kerja planner.

Pola yang sama ada di industri lain: turnaround pabrik, konstruksi, maintenance pesawat. Offshore kita pakai sebagai kasus utama karena paling berat dan kita paham dari dalam.

## Tiga jenis perubahan

| Jenis | Contoh | Yang dilakukan sistem |
|---|---|---|
| Permintaan | "Bisa A-12 dimajukan ke minggu ini?" | Memberi vonis (layak, layak dengan syarat, tidak layak) plus alternatif |
| Gangguan | "Test pompa mundur 3 hari", ombak tinggi | Menyusun ulang rencana |
| Peluang | Pompa lulus test 4 hari lebih cepat | Menyarankan job dimajukan |

## Istilah penting: tuas

Tuas = cara mengubah keadaan supaya jadwal bisa bergeser. Contoh: minta vendor mempercepat test pompa, pindahkan muatan ke kapal lain, tukar slot dua job. Daftar tuas dan siapa yang harus approve ditentukan perusahaan di **action registry** (config). Contoh: percepat test boleh (approve planner), memindahkan job yang dikunci tidak boleh.

## Contoh demo utama (A-12)

1. Engineer produksi menulis: "A-12 drop lagi, bisa dimajukan ke D+3? Jangan ganggu B-05, ada inspeksi klien."
2. Planner paste pesan itu ke aplikasi.
3. Gemini paham: ini permintaan, target D+3, B-05 dikunci.
4. Agent mengecek kesiapan: pompa A-12 baru bisa sampai lokasi D+7. D+3 tidak mungkin.
5. Agent coba tanpa tuas: A-12 tetap D+9. Buka tuas termurah yang realistis, "percepat test" (D+4 ke D+2): slot kosong D+5 bisa dipakai, tapi dek kapal D+5 jadi 105%.
6. Agent buka tuas kedua, "pindah muatan": drum kimia job lain dipindah ke kapal D+6. Dek jadi 90%. Cuaca aman. Simulasi bersih.
7. Rekomendasi: "D+3 tidak bisa. A-12 bisa D+5 dengan syarat vendor setuju test di D+2. Di skenario ini model memperkirakan sekitar 1.000 barel terselamatkan."
8. Planner approve, menolak dengan alasan, atau membalas dengan bahasa biasa ("jangan pindahkan drum itu, butuh kapal khusus") supaya agent menyusun ulang.

**Momen kunci kedua: data sama, pesan beda.** Kalau pesannya ditambah satu kalimat, "FYI vendor bilang test bay penuh sampai Kamis", database dan solvernya persis sama, tapi agent menutup tuas "percepat test", mencoba tuas lain, dan jujur bilang A-12 tidak bisa lebih cepat dari D+9 tanpa mengganggu B-05. Dua hasil ini ditampilkan berdampingan. Inilah jawaban untuk "ini cuma if-else?": aturannya memang kode, tapi menentukan aturan mana yang berlaku datang dari membaca pesan manusia.

## Siapa mengerjakan apa di dalam sistem

| Action registry (kebijakan) | Gemini (situasi) | Engine + solver (kalkulator) | Planner (pemutus) |
|---|---|---|---|
| Tuas apa yang boleh, siapa yang approve | Membaca pesan, mengekstrak job, tanggal, constraint | Menghitung tanggal, kapasitas, deadline kesiapan | Approve, tolak dengan alasan, atau membalas |
| Ditentukan perusahaan, bukan AI | Menentukan tuas mana yang realistis kali ini, dan urutan membukanya | Mencari rencana layak terbaik di dalam tuas yang dibuka (CP-SAT) | Mengonfirmasi syarat di luar model (janji vendor, pompa cadangan) |
| | Menandai risiko dari daftar tetap (mis. "temuan seal") beserta kutipan sumbernya | Menerapkan aturan tetap untuk risiko, ETA rentang, data basi | Mencentang checklist |
| | Membandingkan opsi dan menjelaskannya | Validasi ulang saat approve | |

Aturan emas:
- Gemini tidak pernah menghitung angka dan tidak menentukan bobot.
- Gemini boleh menutup tuas yang diizinkan, tapi tidak pernah bisa membuka tuas yang dilarang.
- Apa pun di luar model (misalnya pompa cadangan) ditampilkan sebagai syarat yang harus dikonfirmasi manusia, bukan fakta.
- Agent tidak bisa mengubah jadwal sendiri. Hanya tombol approve yang bisa.

Yang **tidak** kita klaim: Gemini menemukan rencana yang tidak bisa ditemukan optimizer. Yang kita klaim: Gemini mengerjakan pekerjaan merumuskan masalah yang hari ini dilakukan planner secara manual, dan solver membuat hasilnya bisa dipercaya.

## Tampilan aplikasi

1. Jadwal: Gantt per barge dan per pelayaran supply boat.
2. Papan kesiapan: checklist semua job, terurut dari yang paling mepet.
3. Panel agent: kotak paste, timeline tuas yang dibuka dan alasannya, kartu opsi dengan syarat (label "Conditional"), tombol approve/tolak, kotak balasan.

## Teknologi

- Backend: Python, FastAPI, Google ADK, di Cloud Run.
- Model: Gemini Flash (3.x) lewat Vertex AI. Jangan pakai Gemini 2.5, shutdown 16 Okt.
- Solver: OR-Tools CP-SAT.
- Database: PostgreSQL di Cloud SQL (trial gratis lewat Firebase Data Connect).
- Frontend: React + TypeScript + Vite, di Firebase Hosting.
- Tambahan: Cloud Trace, Secret Manager. Cloud Scheduler (cek harian) kalau sempat.

## Kenapa ini bisa menang

| Kriteria | Bobot | Jawaban kita |
|---|---|---|
| Technical Merit & Gen AI | 40% | Gemini merumuskan masalah dan membuka tuas, engine memverifikasi. Ablation 3 arah: optimizer dengan semua tuas terbuka, optimizer diisi manual lewat form, dan Ripple |
| Problem & Impact | 25% | Masalah nyata dari dalam industri, dampak dalam barel dan USD |
| Innovation | 25% | Agent yang tunduk pada kebijakan perusahaan, berani menolak, dan memberi "bisa, kalau..." dengan syarat yang jelas |
| UX | 10% | Paste pesan, lihat AI bekerja, approve. Tanpa integrasi apa pun |

## Yang wajib dikumpulkan (deadline 18 Okt 2026)

- [ ] Link aplikasi yang sudah deploy (juri bisa coba sendiri, ada tombol reset demo)
- [ ] Video demo di bawah 3 menit
- [ ] Repo GitHub publik (tanpa data asli kantor, tanpa API key)
- [ ] Deck dalam PDF
- Semua dalam bahasa Inggris. Registrasi dan pembentukan tim tutup 11 Okt.

## Keputusan yang sudah diambil

- Agent tidak mengejar vendor lewat chat. Kesiapan berupa checklist yang dicentang orang, AI mengusulkan update dari dokumen yang di-paste.
- Input lewat paste/upload saja. Integrasi email/WA masuk roadmap.
- Domain kedua (turnaround pabrik) cukup satu slide, kecuali semua yang lain sudah selesai.
- Scope dipangkas: wajib A-12 (pasangan 1a/1b) dan D-07. E-02, upload PDF/screenshot, cek harian, dan draft notifikasi hanya kalau sempat.
- Bahasa klaim: "best feasible plan found", bukan "optimal". Penghematan disebut perkiraan model untuk skenario contoh, bukan hasil nyata.
- Tidak ada kredit dari panitia. Satu orang membuka akun GCP baru (trial USD 300), jadi pemegang billing, budget alert USD 20.

## Yang masih perlu diputuskan

1. Nama produk.
2. Siapa pegang lane mana (A Engine & data, B Agent, C Frontend, D Platform & cerita).
3. Siapa pemegang akun billing GCP.
