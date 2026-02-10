# Mathbox Project

## Overview

Mathbox is an innovative dual-camera remote tutoring platform designed for mathematics education. It allows students to broadcast both their face and their handwritten work simultaneously, while providing teachers with advanced tools for real-time annotation and interaction.

## Key Features

- **Dual Camera Streaming**: Students can stream from two cameras simultaneously (Face + Paper/Work).
- **Real-time Interaction**: Teachers can view student work in high definition and annotate directly on the video feed.
- **Drawing Tools**: Integrated drawing toolbar for teachers with pen, highlighter, and laser pointer tools.
- **LiveKit Integration**: High-performance, low-latency video and data transmission using LiveKit.
- **Role-based Access**: distinct dashboards and capabilities for Professors and Students.

## Tech Stack

- **Frontend**: React, Vite, TailwindCSS
- **Backend**: Node.js, Express, Socket.io
- **Database**: PostgreSQL
- **Video/Audio**: LiveKit SDK

## Technical Implementation Details

### Video Architecture
The dual-camera system uses a specific protocol for track identification without relying on metadata:
1.  **Student Publishing**: Cameras are published in a strict order:
    -   **Track 0**: Face Camera (default resolution)
    -   **Track 1**: Paper/Work Camera (High resolution 1920x1080)
    -   *No `trackName` is used to maximize compatibility.*
2.  **Professor Receiving**: The system automatically detects tracks based on their source and order to assign them to the correct view (PiP or Main).

### Drawing System
Real-time annotation is implemented with a custom overlay system:
-   **Canvas**: A fixed 1920x1080 transparent canvas overlays the video feed.
-   **Coordinates**: All drawing coordinates are normalized (0.0 to 1.0) to ensure accurate rendering regardless of the recipient's screen size.
-   **Transmission**: Drawing data (strokes, clear events) is sent via LiveKit Data Channels for low-latency updates.
-   **Targeting**: Drawings are specifically routed to the "Paper" camera track using its `trackSid`.

## Repository Structure

- `frontend/`: React application source code.
- `backend/`: Node.js server and API endpoints.
- `database/`: Database schema and migration scripts.
- `setup-vps.sh`: Script for setting up the VPS environment.

## Setup Instructions

### Prerequisites

- Node.js (v18+)
- PostgreSQL
- LiveKit Server (local or cloud)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/Mathbox.git
    cd Mathbox
    ```

2.  Install dependencies for backend:
    ```bash
    cd backend
    npm install
    ```

3.  Install dependencies for frontend:
    ```bash
    cd ../frontend
    npm install
    ```

### Running Locally

1.  Start the backend server:
    ```bash
    cd backend
    npm run dev
    ```

2.  Start the frontend development server:
    ```bash
    cd frontend
    npm run dev
    ```

## Deployment

The project includes a `setup-vps.sh` script to automate deployment on a VPS (Ubuntu).

## Contributing

Please read the contributing guidelines before submitting pull requests.

## License

[Add License Here]
