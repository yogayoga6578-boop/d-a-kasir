# Kasir Suara

Project web/PWA dari source JSX Kasir Suara. Penyimpanan `window.storage` telah diganti otomatis menjadi `localStorage` agar dapat berjalan sebagai aplikasi web/PWA.

## Tujuan
1. Build web dengan Vite.
2. Deploy hasil `dist/` ke hosting.
3. Bungkus PWA menjadi aplikasi Android (APK/AAB) menggunakan layanan cloud/PWA packaging.

Fitur suara menggunakan Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`) dengan bahasa `id-ID`. Ketersediaan fitur suara bergantung pada browser/Android WebView yang digunakan.
