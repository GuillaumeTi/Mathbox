# 🤖 AI_README.md - Context & Protocol for AI Agents

**DO NOT DELETE OR IGNORE THIS FILE.**
This document contains critical information for any AI agent taking over the development of the **Mathbox** project. Read this first to ensure you are 100% operational immediately.

## 1. 🌍 Development Environment
- **Host OS**: Linux (Steam Deck).
- **Working Directory**: `/home/deck/Documents/Mathbox_SAasProto`
- **Distrobox Container**: `Mathbox`
  - **Usage**: You MUST use this container for tools that are not available or configured on the host (specifically `gh` CLI).
  - **Command**: `distrobox enter Mathbox -- <command>`
  - **Example**: `distrobox enter Mathbox -- gh repo view`

## 2. 📝 Version Control (Git) Rules
- **Repository**: [https://github.com/GuillaumeTi/Mathbox](https://github.com/GuillaumeTi/Mathbox)
- **Current Development Branch**: `correction` (Used for active fixes/features).
- **Stable Branch**: `main` (Production).
- **Commit Message Format (CRITICAL)**:
  You must strictly follow this format for **EVERY** commit:
  ```text
  Antigravity (Your Model Name) [YYYY-MM-DD HH:MM:SS] Description of changes
  ```
  *Example*: `Antigravity (Gemini 2.0 Pro) [2026-02-15 14:00:00] Fix: Cloud VFS logic and Auto-Archiving`

## 3. 🚀 Infrastructure & Deployment
- **Target VPS**: Ubuntu Server (`137.74.197.93`)
- **SSH User**: `ubuntu` (Key-based auth configured).
- **Project Path**: `/home/ubuntu/mathcam`
- **Live URL**: `https://housewares-bill-inbox-predict.trycloudflare.com`

### Deployment Workflow
 **Always use the script.**
1.  **Commit & Push**: Ensure changes are pushed to the current branch (`correction` or `main`).
2.  **Deploy**: Run `./deploy.sh` from the host.
    -   The script automatically handles the Distrobox environment for building.
    -   Builds Frontend, transfers code, and restarts services on VPS.
    -   Runs `npm install` and `npx prisma db push` on VPS.
    -   Restarts Backend via PM2 (`mathbox`).

## 4. 🛠️ Tech Stack & Key Components
- **Frontend**: React, Vite, TailwindCSS (Shadcn/UI components).
- **Backend**: Node.js, Express, Socket.io.
- **Database**: PostgreSQL + Prisma ORM.
- **Real-time**:
    -   **LiveKit**: Video/Audio + DataChannels (Whiteboard sync, background broadcast).
    -   **Socket.io**: Room signaling, Chat persistence.
-   **Storage**: Local Filesystem (Mock S3 interface) with strict VFS logic.

## 5. ☁️ Cloud Architecture (Virtual File System)
The Cloud Storage uses a **strict Virtual File System (VFS)** logic enforced by the Backend (`folders.js`, `documents.js`).

### VFS Structure
1.  **Teacher View**:
    -   **Root**: Shows 2 Virtual Folders: `Private` and `Students`.
    -   **Private**: Maps to `folderId=null`, `courseId=null`, `ownerId=Teacher`. Personal files.
    -   **Students**: Lists all Students/Courses the teacher manages.
    -   **Course Folder**: Inside `Students > [Student_Name]`, maps to the Shared Course Folder.
2.  **Student View**:
    -   **Root**: Shows Aliased Folders `Course_{Subject}_{ProfName}`.
    -   **Isolation**: Strict. Cannot access `Private` or other Students' folders.

### Auto-Archiving Logic
-   **Chat Attachments & Screenshots**: Automatically routed to:
    `[Course_Root]/Archives/{YYYY-MM-DD}/`
-   **Implementation**: `ensureFolder` helper in `documents.js` and `room.js`.
-   **Physical Paths** (Aligned with VPS storage structure):
    -   **Course Context**: `Teacher_{ProfID}/Student/Student_{StudentID}/{CourseName}/Archives/{YYYY-MM-DD}/{filename}`
    -   **Private Context**: `Teacher_{ProfID}/Private/[VirtualSubfolder]/{filename}`

## 6. 🎨 Features & Capabilities
-   **Whiteboard**:
    -   Tools: Pen, Eraser (Follower cursor), Shapes (Triangle, Rect, Circle, Line).
    -   **Shape Preview**: Transient canvas layer for real-time drag preview.
    -   **Image Import**: From Device OR Cloud VFS (`CloudFilePicker`).
-   **Chat**:
    -   File Sharing support (Auto-archived).
    -   Persistent message history via `RoomContent`.
-   **Room Logic**:
    -   `room.js`: Handles Token generation, Status checks, and **Screenshots**.
    -   Sync: `useRoomContext` handles reliable state synchronization (Backgrounds, View Mode).

---
*If you are an AI reading this: You are now up to speed. Maintain the VFS strictness and commit format!*
