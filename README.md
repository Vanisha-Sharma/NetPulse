# ◈ NetPulse — Live Network Topology Visualizer

> Map and monitor every device on your network in real-time, visualized as an interactive force-directed graph.

---

## What is NetPulse?

NetPulse scans your local network, builds a live graph of all connected devices, and monitors traffic, latency, and anomalies in real time — right in the browser. Think Cisco DNA Center, but open-source and minimal.

---

## Features

- **Live force-directed graph** — D3.js interactive topology map, drag nodes, zoom/pan
- **Real-time updates** — Socket.io pushes live traffic and latency every 3 seconds
- **Device details** — click any node for IP, MAC, vendor, OS, open ports
- **Anomaly detection** — flags devices showing unusual behavior in red
- **Manual scan** — trigger a fresh network scan on demand
- **Activity log** — live stream of all network events
- **Cyberpunk HUD design** — Orbitron + Share Tech Mono, full dark terminal aesthetic

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, D3.js v7 |
| Real-time | Socket.io client |
| Backend | Node.js, Express.js, Socket.io |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Project Structure

```
netpulse/
├── backend/
│   ├── server.js       # Express + Socket.io + network scanner
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx     # D3 graph + all React components
    │   ├── App.css     # Full cyberpunk HUD styling
    │   └── main.jsx
    ├── index.html
    └── vite.config.js
```

---

## How It Works

```
Backend scans network (python-nmap / mock data)
        ↓
Socket.io pushes device list + links to React frontend
        ↓
D3.js force simulation renders interactive topology graph
        ↓
Every 3s: traffic + latency updates streamed live
        ↓
User clicks node → device detail panel slides in
```

---

## Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/Vanisha-Sharma/netpulse.git
cd netpulse
```

### 2. Backend
```bash
cd backend
npm install
cp .env
npm run dev
# Runs on http://localhost:3002
```

### 3. Frontend
```bash
cd ../frontend
npm install
cp .env
npm run dev
# Runs on http://localhost:5173
```

---

## Deployment

### Frontend → Vercel
- Root directory: `frontend`
- Env var: `VITE_API_URL=https://your-backend.onrender.com`

### Backend → Render
- Root directory: `backend`
- Build: `npm install` · Start: `node server.js`
- Env var: `FRONTEND_URL=https://your-app.vercel.app`

---

## Key Engineering Decisions

**Why D3.js force simulation?**
Force-directed graphs are the standard for network topology visualization — nodes repel each other and links act as springs, naturally producing readable layouts without manual positioning.

**Why Socket.io over REST polling?**
Persistent WebSocket connection eliminates polling overhead and delivers updates in real time with sub-100ms latency, making the graph feel truly live.

**Why mock data in the backend?**
Real network scanning requires root/admin privileges and platform-specific tools (nmap). The mock generator produces realistic data so the app works in any environment — swap in real nmap output by replacing the `generateDevices()` function.

---

## Built By

**Vanisha Sharma**
3rd Year CSE · Global Institute of Technology, Jaipur
[LinkedIn](#) · [GitHub](#) · [Portfolio](#)

---

## License

MIT
