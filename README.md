# UE Asset Manager

> ## Bring Your Own Assets
>
> **This repository does not include a preloaded asset library. It starts empty.**
> **Your assets are uploaded by you and remain in your own `data/assets` folder.**
> This is the project's Bring Your Own Asset policy.

The original browser interface now runs with one Node service. It serves the UI and API, stores catalogue data in SQLite, and writes uploaded assets directly to a folder on the host. Nextcloud and PostgreSQL are not needed for a new installation.

## Unreal Engine importing

The web app is the catalogue and file delivery layer. To actually import assets into Unreal Engine, use the companion Unreal Engine plugin. The plugin ZIP will be added to this repository later. Install it in your Unreal project and use its import workflow with the asset links from the manager.

## Highlights

- One service: frontend, API, SQLite catalogue, local asset storage, admin tools, and backups ship together.
- Windows-friendly storage: bind-mount a normal NTFS folder; Linux and macOS use their normal host filesystems too.
- Large uploads: files over 128 MiB use retryable 16 MiB chunks and can resume after a dropped connection.
- Asset health: Stored Files checks every asset file, thumbnail, and poster and reports uploaded, empty, missing, external, and orphaned files.
- Database manager: browse assets, users, and favorites; edit metadata; inspect SQLite integrity; and remove stale favorite rows.
- Safe asset folders: each asset gets a UUID directory, so renaming metadata does not break its files.

## Start with Docker (Windows, Linux, macOS)

1. Install Docker Desktop on Windows/macOS, or Docker Engine with Compose on Linux.
2. Optionally copy `.env.example` to `.env` to change the port, file limit, or initial admin credentials. A new data folder creates `admin` / `admin` by default. Existing users are not reset when these settings change.
3. From this directory, run:

   ```sh
   docker compose up -d --build
   ```

4. Open `http://localhost:8080` and sign in as `admin` / `admin` (or the values in `.env`). Use **Change Password** in the app after signing in, especially before exposing it beyond a trusted local network. Admins can add more users in the UI.

Windows PowerShell copy command: `Copy-Item .env.example .env`. Linux/macOS: `cp .env.example .env`.

The same admin account opens **Database** and **Stored Files** from the app's Admin panel, or directly at `http://localhost:8080/admin-tools.html` (use your configured `APP_PORT` if different). The database manager browses assets, users, and favorites, checks SQLite integrity, edits asset metadata, removes favorite rows, and creates full backups. Password hashes and session tokens are not shown. The storage view scans `data/assets`, shows the state and size of each asset file, thumbnail, and poster, flags missing or external files, and lists orphan files with no database reference. Both views require an admin login; SQLite has no separate database password.

The companion Unreal Engine plugin is required for importing assets into Unreal Engine. This repository currently contains the web manager only; the plugin ZIP will be added later.

Docker mounts `./data` into the container. All persistent state is here:

```text
data/
  catalog.sqlite           SQLite catalogue and accounts
  assets/                  uploaded files, one UUID folder per asset
  backups/                 complete backup archives
  staging/                 temporary uploads and backup snapshots
```

The `data` folder lives on the host's native filesystem: NTFS on a typical Windows machine, or the chosen filesystem on Linux/macOS. Put it on a local disk with enough free space. Do not use a temporary container filesystem for persistent data. Files are streamed to disk during upload. The browser sends files over 128 MiB in retryable 16 MiB chunks; choosing the same file again after a refresh resumes completed chunks. The default per-file limit is 50 GiB and can be changed with `MAX_FILE_BYTES` in `.env`. A reverse proxy must also allow uploads of that size and provide a long enough request timeout.

For access from other devices, set `PUBLIC_URL` in `.env` to the browser-facing **origin** (for example `https://assets.example.com`) so asset and import links use the right hostname. If an HTTPS reverse proxy forwards to the container, set `TRUST_PROXY=1`. Use HTTPS when exposing the service outside a trusted local network.

## Back up and restore

Click **Backup All** as an admin. The app blocks new writes while it takes a SQLite snapshot and archives it with the uploaded files. The browser starts a download and an identical `.tar.gz` stays in `data/backups`. Copy that archive to another disk or backup service; a copy in the same `data` folder does not protect against disk failure.

Restore only while the service is stopped:

```sh
docker compose stop asset-manager
docker compose run --rm --no-deps asset-manager node assetmanager_backend/restore.js /data/backups/UE-AssetManager-YYYY-MM-DDTHH-MM-SS-MMMZ.tar.gz
docker compose up -d asset-manager
```

Replace the archive name with the actual backup file. You can also mount an archive copied from another machine into `./data/backups` first. The restore command validates the SQLite snapshot and checks that every locally stored asset it references exists. It keeps the previous database and assets under `data/previous-<timestamp>` so they can be recovered. After verifying the restored app, you may remove that previous directory manually.

For a fully offline host backup, stop the app and copy the entire `data` directory. Keep the database and `assets` from the same point in time. Do not copy only `catalog.sqlite` from a running app, because SQLite may have a write-ahead log.

## Update

Back up first, then update the source files and run `docker compose up -d --build`. The bind-mounted `data` folder is retained. Check `docker compose logs --tail=100 asset-manager` and `http://localhost:8080/health` (or your configured `APP_PORT`) after the restart.

## Run without Docker

Install Node.js 24.12 or a later Node 24 release and a `tar` utility. On Windows 10/11, `tar.exe` is normally available. From `assetmanager_backend`, run `npm ci`, set `DATA_DIR` in the environment, then `npm start`. `ADMIN_PASSWORD` is optional and defaults to `admin` on a new data folder. The service listens on port 4030 unless `PORT` is set. Keep `DATA_DIR` outside the application source for upgrades.

Example in PowerShell:

```powershell
$env:DATA_DIR = 'D:\UE-AssetManager-Data'
npm ci --prefix .\assetmanager_backend
node .\assetmanager_backend\server.js
```

## Existing Nextcloud installations

This is a new storage layout. Existing PostgreSQL rows and Nextcloud files are **not** automatically imported by starting the new container. For a one-time migration:

1. While the old backend, PostgreSQL, and Prisma dependencies still work, copy `assetmanager_backend/legacy-export.js` into that old backend directory and run `node legacy-export.js <output.json>` with its old `DATABASE_URL` set. The export contains password hashes, so keep it private.
2. Put the JSON file in the new installation's `data` directory. Ensure the old share URLs are reachable from the new host. If they require HTTP Basic authentication, pass `LEGACY_HTTP_USER` and `LEGACY_HTTP_PASSWORD` to the import container.
3. Stop the new app, then run:

   ```sh
   docker compose stop asset-manager
   docker compose run --rm --no-deps asset-manager node assetmanager_backend/import-legacy.js /data/legacy-export.json
   docker compose up -d asset-manager
   ```

4. Verify the asset count, open several thumbnails, download files, and create a **Backup All** archive. Then remove the sensitive export JSON from `data`.

The importer streams each old share directly into a UUID directory, rewrites its catalogue URLs to local paths, and imports users and favorites. It skips External IDs already present, which allows a failed import to be retried. Keep the old installation and its backup until the new catalogue is verified.

## Verification

`npm test` in `assetmanager_backend` exercises login, UI serving, uploads, resumable chunks, ranged download, search, favorites, file replacement, full backup, archive extraction, offline restore, and legacy file import. The Dockerfile is pinned to the same Node 24.12 runtime as the tested native service.

For the complete Windows, Linux, and macOS deployment guide, see [deploy.md](D:/Moses/UE-AssetManager/deploy.md).

