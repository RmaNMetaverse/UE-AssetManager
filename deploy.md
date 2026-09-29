# UE Asset Manager deployment

This service starts with an empty catalogue and follows a Bring Your Own Asset policy. Users upload their own files into the host's `data/assets` directory. The companion Unreal Engine plugin, whose ZIP will be added later, is required to import assets into Unreal Engine.

## Docker on Windows

Install Docker Desktop with Linux containers enabled. From PowerShell in the repository:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
docker compose ps
```

Open `http://localhost:4030`, sign in as `admin` / `admin`, and change the password. Persistent data is in `data\`. To use another NTFS drive, change `./data:/data` in `compose.yaml` to `D:\UE-AssetManager-Data:/data`.

## Docker on Linux

Install Docker Engine and the Compose plugin. Then run:

```sh
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Sign in at `http://localhost:4030` as `admin` / `admin`, then change the password. For a dedicated data disk, use an absolute bind mount such as `/srv/ue-asset-manager-data:/data`.

## Docker on macOS

Install Docker Desktop, allow repository access, and run:

```sh
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:4030`, sign in as `admin` / `admin`, change the password, and upload your own assets.

## Native Node on Windows

Install Node.js 24.12 or later. Windows 10/11 normally includes `tar.exe`.

```powershell
$env:DATA_DIR = 'D:\UE-AssetManager-Data'
$env:PORT = '4030'
npm ci --prefix .\assetmanager_backend
node .\assetmanager_backend\server.js
```

Use the same `admin` / `admin` first login. Keep the process running or register it with Task Scheduler, NSSM, or another Windows service manager.

## Native Node on Linux or macOS

Install Node.js 24.12 or later and ensure `tar` is available:

```sh
export DATA_DIR=/srv/ue-asset-manager-data
export PORT=4030
npm ci --prefix ./assetmanager_backend
node ./assetmanager_backend/server.js
```

Use systemd, launchd, or another process supervisor for a long-running service. Put it behind HTTPS when it is reachable outside the local machine.

## Reverse proxy

Forward requests to port 4030. Set `PUBLIC_URL` to the browser-facing origin and `TRUST_PROXY=1` when the proxy terminates HTTPS. Allow bodies up to `MAX_FILE_BYTES`, use a long upload timeout, and use HTTPS outside a trusted local network.

## First-run checklist

1. Start the service.
2. Sign in as `admin` / `admin`.
3. Change the password.
4. Upload one small test asset.
5. Open Admin → Stored Files and confirm it says `uploaded`.
6. Open Admin → Database and confirm the asset row exists.
7. Create **Backup All** and confirm a `.tar.gz` appears in `data/backups`.
8. Install the companion Unreal Engine plugin when its ZIP is added. The web app catalogues and serves files; the plugin performs the Unreal import workflow.

## Backup and restore

Create a backup from **Backup All** or the Database manager. Store it on another disk or backup service. Restore while stopped:

```sh
docker compose stop asset-manager
docker compose run --rm --no-deps asset-manager node assetmanager_backend/restore.js /data/backups/your-backup.tar.gz
docker compose up -d asset-manager
```

The restore validates SQLite and referenced files and keeps previous active data under `data/previous-*`.

## Updates and troubleshooting

Back up first, then run `docker compose up -d --build`. Never delete `data` during an update. Check `docker compose logs --tail=200 asset-manager` and `http://localhost:4030/health`. Admin → Stored Files identifies missing paths; files with no catalogue record appear as orphans.
