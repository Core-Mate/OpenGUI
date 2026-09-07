# Troubleshooting

Use this guide when the backend starts but the Android client cannot run a task, report progress, or keep the device ready for remote work.

## Backend connection

### Android client cannot reach the backend

Likely causes:

- the backend is not running
- the Android client is using the wrong server URL
- the backend is bound to `localhost` only
- a firewall blocks the backend port

Checks:

```bash
cd server
./start.sh
```

Open the backend health or API endpoint from the host machine first. Then open the same address from the Android device browser.

Fixes:

- use the host machine LAN IP instead of `localhost` when connecting from a physical phone
- make sure the phone and host machine are on the same network
- allow the backend port through the host firewall
- restart the Android client after changing the server URL

### Emulator uses the wrong host address

Android emulators do not use `localhost` to reach the host machine.

Use:

```text
http://10.0.2.2:<backend-port>
```

For Genymotion or other emulator runtimes, check the runtime-specific host gateway address.

### Physical phone cannot connect to the laptop backend

Checks:

- confirm the phone and laptop are on the same Wi-Fi network
- confirm VPN, guest Wi-Fi, or hotspot isolation is not blocking local traffic
- open `http://<laptop-lan-ip>:<backend-port>` from the phone browser
- confirm the backend is listening on all interfaces, not only `127.0.0.1`

Fixes:

- use the laptop LAN IP in the Android client server URL
- disable guest network isolation or move both devices to the same trusted network
- allow inbound traffic for the backend port in Windows Defender Firewall, macOS firewall, or Linux firewall rules

## Android permissions

### AccessibilityService is disabled or killed

Symptoms:

- tasks start but no taps, swipes, or text input happen
- screenshots work but UI actions do not execute
- the service disappears after the screen is locked or the app is backgrounded

Checks:

- Android Settings -> Accessibility -> OpenGUI service is enabled
- the Android client is allowed to run in the background
- battery optimization is disabled for the Android client

Fixes:

- re-enable the AccessibilityService after installing a new APK
- disable battery optimization for the Android client
- keep the device unlocked during local debugging
- check vendor-specific background app settings on Xiaomi, Huawei, Oppo, Vivo, Samsung, and similar devices

### Overlay permission blocks task feedback

Symptoms:

- the client runs but progress UI or floating task feedback never appears
- Android shows a permission warning for displaying over other apps

Fixes:

- Android Settings -> Apps -> OpenGUI -> Display over other apps -> Allow
- restart the client after granting the permission
- on restricted devices, grant the permission through the vendor security or permission manager app

## Model configuration

### Missing model API configuration

Symptoms:

- backend starts but planning or vision steps fail
- task output mentions missing provider credentials
- requests fail immediately before any Android action

Checks:

- compare local environment variables with `.env.example`
- confirm the provider API key is present
- confirm the selected model supports the role it is assigned to

Fixes:

- fill in the required model provider keys before starting the backend
- restart the backend after changing environment variables
- start with one known working provider profile, then split planner and vision models after the first successful run

## Local services

### Redis or PostgreSQL port conflicts

Symptoms:

- `./start.sh` fails before the backend is ready
- logs mention a port already in use
- Docker starts some services but not Redis or PostgreSQL

Checks:

```bash
docker ps
docker compose ps
```

Fixes:

- stop the local service that already uses the same port
- update the project environment or compose port mapping to use a free port
- restart the backend after changing service ports

## Reporting a useful issue

If the problem still happens, include:

- host operating system
- Android device or emulator type
- Android version
- backend server URL used by the client, with secrets removed
- the exact symptom and the first failing step
- relevant backend logs
- whether AccessibilityService, overlay permission, and battery settings were enabled
