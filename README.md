# DebateHub

React + Vite + Ably (real-time) wrapped with Capacitor to build an Android APK via GitHub Actions.

## Get your APK
1. Create a new GitHub repo and upload the contents of this folder (keep the `.github` folder).
2. In the repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `ABLY_KEY`
   - Value: your Ably API key
3. Go to the **Actions** tab → **Build Android APK** → it runs on every push (or click *Run workflow*).
4. When it finishes, open the run and download the **DebateHub-apk** artifact. Unzip it and install `app-debug.apk` on your phone.

## Local dev
```
cp .env.example .env   # add your key
npm install
npm run dev
```
