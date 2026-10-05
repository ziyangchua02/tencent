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

## 2026-10-05: Setpoint demo, notification emails, profiles

**Built**
- The engineer's comment can propose a measure the agent didn't pick. It joins the plan unticked, tagged "Added by me", and its share of the change is drawn in violet on the load chart and board diagram. For the demo, SB-1 is rated 820 kW so the agent's plan still leaves it at 96%, and the agent never proposes a setpoint raise itself. The engineer's +1 °C raise brings it to 81%.
- The agent's plan ranking now treats a board over its rating as worse than any number of warnings.
- Notification emails through Resend's HTTP API (`server/email.ts`): to the manager when a pill is issued, to the engineer when it is approved or returned. Sent in the background after the action is saved; each outcome goes in the audit log without the address.
- Profile page from the user menu: photo (cropped and shrunk in the browser), email, an on/off switch for emails, and a test email. Email addresses are only returned to their owner, never in the shared app state.

**How to run:** set `RESEND_API_KEY` and `MANAGER_EMAIL` (and optionally `ENGINEER_EMAIL`) in `.env` or on Render, then use **Profile and notifications** in the user menu.

**Verified:** 16 tests pass, including emails with a stubbed Resend. Against the real Resend API the request was accepted but delivery was refused: without a verified domain, Resend only delivers to the account owner's address.

**Known issues**
- The current Resend key only delivers to its account owner's address. Other recipients need a verified domain and `EMAIL_FROM`.
- No real login, so anyone who picks a role can change that role's email address.
- On Render's free tier, profile changes are lost when the instance sleeps.

**Deviations:** none from the product notes. The server stays dependency-free.
