const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// ─── Mock Network Data Generator ─────────────────────────────────────────────
// In production, replace this with real python-nmap or arp-scan results
// For demo/portfolio: generates realistic network topology data

const DEVICE_TYPES = ["router", "laptop", "phone", "desktop", "iot", "server", "unknown"];
const VENDORS = ["Apple", "Samsung", "Dell", "Cisco", "Raspberry Pi", "Unknown", "Intel", "TP-Link"];
const OS_LIST = ["Windows 11", "macOS Ventura", "Ubuntu 22.04", "Android 13", "iOS 17", "RouterOS", "Unknown"];

function randomMac() {
  return Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase()
  ).join(":");
}

function randomIp(base = "192.168.1") {
  return `${base}.${Math.floor(Math.random() * 200) + 2}`;
}

function randomPort() {
  const commonPorts = [22, 80, 443, 3000, 3306, 5432, 8080, 8443, 27017];
  const count = Math.floor(Math.random() * 4);
  return [...new Set(Array.from({ length: count }, () =>
    commonPorts[Math.floor(Math.random() * commonPorts.length)]
  ))];
}

function generateDevices(count = 8) {
  const gateway = {
    id: "gateway",
    ip: "192.168.1.1",
    mac: "AA:BB:CC:DD:EE:FF",
    hostname: "gateway.local",
    type: "router",
    vendor: "Cisco",
    os: "RouterOS",
    ports: [80, 443, 22],
    status: "online",
    latency: Math.floor(Math.random() * 3) + 1,
    traffic: Math.floor(Math.random() * 900) + 100,
    isGateway: true,
    lastSeen: new Date().toISOString(),
    anomaly: false,
  };

  const devices = [gateway];
  for (let i = 0; i < count - 1; i++) {
    const type = DEVICE_TYPES[Math.floor(Math.random() * DEVICE_TYPES.length)];
    devices.push({
      id: `device_${i}`,
      ip: randomIp(),
      mac: randomMac(),
      hostname: `${type}-${Math.floor(Math.random() * 100)}.local`,
      type,
      vendor: VENDORS[Math.floor(Math.random() * VENDORS.length)],
      os: OS_LIST[Math.floor(Math.random() * OS_LIST.length)],
      ports: randomPort(),
      status: Math.random() > 0.1 ? "online" : "idle",
      latency: Math.floor(Math.random() * 80) + 2,
      traffic: Math.floor(Math.random() * 500),
      isGateway: false,
      lastSeen: new Date().toISOString(),
      anomaly: Math.random() > 0.85,
    });
  }
  return devices;
}

function generateLinks(devices) {
  const gateway = devices.find((d) => d.isGateway);
  return devices
    .filter((d) => !d.isGateway)
    .map((d) => ({
      source: gateway.id,
      target: d.id,
      strength: Math.random() * 0.5 + 0.5,
      traffic: Math.floor(Math.random() * 200),
    }));
}

let networkState = {
  devices: generateDevices(9),
  scanTime: new Date().toISOString(),
  scanning: false,
};
networkState.links = generateLinks(networkState.devices);

// ─── REST Endpoints ───────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok" }));

app.get("/network", (_, res) => {
  res.json({
    success: true,
    ...networkState,
    totalDevices: networkState.devices.length,
    onlineDevices: networkState.devices.filter((d) => d.status === "online").length,
    anomalies: networkState.devices.filter((d) => d.anomaly).length,
  });
});

app.post("/scan", (_, res) => {
  networkState.scanning = true;
  io.emit("scan_start");

  setTimeout(() => {
    networkState.devices = generateDevices(Math.floor(Math.random() * 5) + 6);
    networkState.links = generateLinks(networkState.devices);
    networkState.scanTime = new Date().toISOString();
    networkState.scanning = false;
    io.emit("scan_complete", {
      ...networkState,
      totalDevices: networkState.devices.length,
      onlineDevices: networkState.devices.filter((d) => d.status === "online").length,
      anomalies: networkState.devices.filter((d) => d.anomaly).length,
    });
    res.json({ success: true, message: "Scan complete" });
  }, 3000);
});

// ─── Socket.io Live Updates ───────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Send initial state
  socket.emit("network_update", {
    ...networkState,
    totalDevices: networkState.devices.length,
    onlineDevices: networkState.devices.filter((d) => d.status === "online").length,
    anomalies: networkState.devices.filter((d) => d.anomaly).length,
  });

  // Live traffic updates every 3 seconds
  const interval = setInterval(() => {
    networkState.devices = networkState.devices.map((d) => ({
      ...d,
      traffic: Math.max(0, d.traffic + Math.floor((Math.random() - 0.4) * 80)),
      latency: Math.max(1, d.latency + Math.floor((Math.random() - 0.5) * 10)),
      lastSeen: d.status === "online" ? new Date().toISOString() : d.lastSeen,
    }));
    networkState.links = networkState.links.map((l) => ({
      ...l,
      traffic: Math.max(0, l.traffic + Math.floor((Math.random() - 0.4) * 30)),
    }));

    socket.emit("network_update", {
      ...networkState,
      totalDevices: networkState.devices.length,
      onlineDevices: networkState.devices.filter((d) => d.status === "online").length,
      anomalies: networkState.devices.filter((d) => d.anomaly).length,
    });
  }, 3000);

  socket.on("disconnect", () => {
    clearInterval(interval);
    console.log("Client disconnected:", socket.id);
  });

  socket.on("request_scan", () => {
    networkState.scanning = true;
    socket.emit("scan_start");
    setTimeout(() => {
      networkState.devices = generateDevices(Math.floor(Math.random() * 5) + 6);
      networkState.links = generateLinks(networkState.devices);
      networkState.scanTime = new Date().toISOString();
      networkState.scanning = false;
      io.emit("scan_complete", {
        ...networkState,
        totalDevices: networkState.devices.length,
        onlineDevices: networkState.devices.filter((d) => d.status === "online").length,
        anomalies: networkState.devices.filter((d) => d.anomaly).length,
      });
    }, 3000);
  });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => console.log(`NetPulse backend running on port ${PORT}`));
