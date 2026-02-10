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
