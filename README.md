# Intelligence Pills

Keppel track, Tencent Cloud "AI CAN DO IT" Hackathon Singapore 2026 (case study: AI HARVEST, Energy Optimisation).
React + Vite frontend and a dependency-free Node server (built-in `node:sqlite`) in one repo, shipped as one container.

## Run locally

Needs Node 22.18 or newer.

```sh
npm ci
cp .env.example .env      # add GEMINI_API_KEY; without it, offline rules read engineer comments
npm run dev               # http://127.0.0.1:5173
npm test                  # governance and comment rules
```

Production build, one process on port 8080:

```sh
npm run build && npm start
```

## Deploy

**Render (free).** New > Web Service, pick this repo, and Render builds the `Dockerfile`. Choose the Free instance type and set `GEMINI_API_KEY` and `GEMINI_MODEL` as environment variables.
The free instance sleeps after 15 minutes without traffic and takes about a minute to wake. Its disk is wiped when it sleeps, and the app reseeds the demo data on start.

**Any Linux server with SSH**, such as Tencent Cloud Lighthouse. From this folder, with `.env` filled in:

```sh
./deploy.sh ubuntu@<server-ip>
```

The script copies the code and `.env`, builds the image and restarts the container on port 80.
`.env` stays on the server and is never baked into the image. Data lives in the `pills-data` Docker volume and survives redeploys.
