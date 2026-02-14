# 🤖 AI_README.md - Context & Protocol for AI Agents

**DO NOT DELETE OR IGNORE THIS FILE.**
This document contains critical information for any AI agent taking over the development of the **Mathbox** project. Read this first to ensure you are 100% operational immediately.

## 1. 🌍 Development Environment
- **Host OS**: Linux (Steam Deck).
- **Working Directory**: `/home/deck/Documents/MathCam_NewProto`
- **Distrobox Container**: `Mathbox`
  - **Usage**: You MUST use this container for tools that are not available or configured on the host (specifically `gh` CLI).
  - **Command**: `distrobox enter Mathbox -- <command>`
  - **Example**: `distrobox enter Mathbox -- gh repo view`

## 2. 📝 Version Control (Git) Rules
- **Repository**: [https://github.com/GuillaumeTi/Mathbox](https://github.com/GuillaumeTi/Mathbox)
- **Current Branch**: Check with `git branch`.
- **Branch Strategy**:
  - **main**: Stable production branch (MVP + Tools v2).
  - **new_SAaS_Version**: Active development branch for the SAaS version.
  - **feature/*** : Temporary feature branches.
- **Commit Message Format (CRITICAL)**:
  You must strictly follow this format for **EVERY** commit:
  ```text
  Antigravity (Your Model Name) [YYYY-MM-DD HH:MM:SS] Description of changes
  ```
  *Example*:
  `Antigravity (Gemini 2.0 Pro) [2026-02-10 14:00:00] Fix: Corrected PublishData signature in useDrawing.js`

## 3. 🚀 Infrastructure & Deployment
- **Target VPS**: Ubuntu Server
- **IP Address**: `137.74.197.93`
- **SSH User**: `ubuntu` (Key-based auth is configured).
- **Project Path on VPS**: `/home/ubuntu/mathcam`

### Deployment Methods
1.  **Full Deployment (Preferred for setup)**:
    - Use the root script: `./deploy.sh`
    - It handles OS detection, dependencies, DB setup, PM2, and Cloudflare Tunnel.

2.  **Incremental Deployment (Hotfixes/Features)**:
    - **Frontend**:
        1.  SCP modified files to `/home/ubuntu/mathcam/frontend/...`
        2.  Run build on server: `ssh ubuntu@137.74.197.93 "cd /home/ubuntu/mathcam/frontend && npm run build"`
    - **Backend**:
        1.  SCP modified files to `/home/ubuntu/mathcam/backend/...`
        2.  Restart PM2: `ssh ubuntu@137.74.197.93 "pm2 restart mathbox-backend"`

## 4. 🛠️ Tech Stack & Key Components
- **Frontend**: React, Vite, TailwindCSS.
- **Backend**: Node.js, Express, Socket.io.
- **Video/Real-time**:
    - **LiveKit**: Used for Video, Audio, and Data Channels (drawing, events).
    - **Protocol Note**: `publishData` in `livekit-client` v1.15.0+ requires `DataPacket_Kind.RELIABLE` (Enum) as the second argument, NOT an object.
- **Database**: PostgreSQL (User: `mathcam_user`, DB: `mathcam`).
- **Persistence**: PM2 (Backend), Systemd (Cloudflare Tunnel).

## 5. 📂 Directory Structure (VPS)
```
/home/ubuntu/mathcam/
├── backend/       # Node.js server (.env required)
├── frontend/      # React sources
│   ├── dist/      # Production build artifacts
│   └── ...
├── database/      # SQL init scripts
└── deploy.sh      # Universal deployment script
```

---
*If you are an AI reading this: You are now up to speed. Good luck.*
