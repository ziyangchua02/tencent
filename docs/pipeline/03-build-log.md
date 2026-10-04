# Build log

## 2026-10-05: Gemini key and Tencent Cloud deploy setup

**Built**
- Gemini key moved out of `.env.example` into the git-ignored `.env`. Default model changed from `gemini-2.5-flash`, which Google no longer offers to new keys, to `gemini-3.5-flash`. `gemini-3.8-flash` was tried first but failed most calls with "high demand" errors on 2026-10-05.
- `Dockerfile`: one container, Node 22, runs as the non-root `node` user, serves the API and built site on port 8080.
- `.dockerignore` keeps `.env` and local data out of the image.
- `deploy.sh user@ip`: copies the code and `.env` over SSH, installs Docker if missing, builds and restarts the container on port 80 with a `pills-data` volume.

**How to run:** see README, "Deploy".

**Verified:** the container's build steps rehearsed in a clean folder on the dev workstation, then the production server started with settings passed from outside. Health check, site, deep links, data API and live-update stream all responded, and the SQLite file was created. The Docker build itself was not run there, because Docker is not available to that account.

**Known issues**
- No real login: the demo trusts the user the browser names, so anyone with the public link can reset data or spend Gemini quota.
- Plain HTTP on the server's IP. HTTPS needs a domain.

**Deviations:** none. The product notes already chose one container.

## 2026-10-05: Free hosting on Render

**Deviation:** the Tencent Lighthouse free trial was unavailable on the user's account, so the free deploy target is Render's free web service, built from the same `Dockerfile`. Hugging Face Docker Spaces need a paid plan. Tailscale Funnel needs root on the dev workstation. Cloudflare quick tunnels don't support the server-sent events the app uses. `deploy.sh` stays for any SSH server.

**Known issues:** the free instance sleeps after 15 minutes idle, takes about a minute to wake, and resets to the seeded demo data on each wake.
