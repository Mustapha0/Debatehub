# Debate Hub

React + Vite + Ably (real-time) wrapped with Capacitor to build an Android APK via GitHub Actions.

## Get your APK
1. Create a new GitHub repo and upload the contents of this folder (keep the `.github` folder).
2. Go to the **Actions** tab → **Build Android APK** → it runs on every push (or click *Run workflow*).
3. When it finishes, open the run and download the **DebateHub-apk** artifact. Unzip it and install `app-debug.apk` on your phone.

## Local dev
```
npm install
npm run dev
```
