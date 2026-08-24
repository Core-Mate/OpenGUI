# Managed Android Platform Tools

The `coremate-mobile` package carries a fixed Android Debug Bridge runtime so
users do not need to install Android Platform Tools or configure `PATH`.

- Android Debug Bridge: 1.0.41, Platform Tools 37.0.1-15733141
- macOS universal `adb` SHA-256: `1811e253b21b12cbfda7201ebaf86c10e7ddcb5c606a7a81f7c82b4c429c2d3b`
- Linux x64 `adb` SHA-256: `a902be8f45c6c62e76c9efaf6947a0fa747c9cabd89a2ac8e0d16ecb30b3ed01`
- Windows `adb.exe` SHA-256: `957e46b8615f7af5b7292a2ddabe98d2e61940c3fb2b0545756507f080613e71`
- Windows `AdbWinApi.dll` SHA-256: `120bef587119c6cb926b86b9be90fdfbce38937588eae28cd91a94ce63c7b965`
- Windows `AdbWinUsbApi.dll` SHA-256: `6ca69a2ca0e31309c087d288f058977d421ad03500e4c3e1dbd981241a069c60`

The accompanying Android Platform Tools `NOTICE.txt` is preserved in every
platform directory. Runtime selection is package-relative and never falls back
to an arbitrary executable found on `PATH`.
