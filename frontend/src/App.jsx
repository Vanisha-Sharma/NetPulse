import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL || "http://localhost:3002";

const DEVICE_ICONS = {
  router: "⬡",
  laptop: "▣",
  phone: "▨",
  desktop: "▦",
  iot: "◈",
  server: "⬢",
  unknown: "◇",
};
const DEVICE_COLORS = {
  router: "#00ffcc",
  laptop: "#4fc3f7",
  phone: "#ce93d8",
  desktop: "#80cbc4",
  iot: "#ffb74d",
  server: "#ef9a9a",
  unknown: "#90a4ae",
};

function formatBytes(kb) {
  if (kb > 1000) return (kb / 1000).toFixed(1) + " MB/s";
  return kb + " KB/s";
}
function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

// ─── D3 Force Graph ───────────────────────────────────────────────────────────
function NetworkGraph({ data, onSelectDevice, selectedId }) {
  const svgRef = useRef();
  const simRef = useRef();

  useEffect(() => {
    if (!data?.devices?.length) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const W = svgRef.current.clientWidth || 700;
    const H = svgRef.current.clientHeight || 480;

    // Defs: glow filters
    const defs = svg.append("defs");
    ["glow-teal", "glow-red", "glow-amber"].forEach((id, i) => {
      const color = ["#00ffcc", "#ff4444", "#ffaa00"][i];
      const filter = defs
        .append("filter")
        .attr("id", id)
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%");
      filter
        .append("feGaussianBlur")
        .attr("stdDeviation", "4")
        .attr("result", "blur");
      const merge = filter.append("feMerge");
      merge.append("feMergeNode").attr("in", "blur");
      merge.append("feMergeNode").attr("in", "SourceGraphic");
    });

    const g = svg.append("g");

    // Zoom
    svg.call(
      d3
        .zoom()
        .scaleExtent([0.3, 3])
        .on("zoom", (e) => g.attr("transform", e.transform)),
    );

    const nodes = data.devices.map((d) => ({ ...d }));
    const links = data.links.map((l) => ({ ...l }));

    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(120)
          .strength(0.5),
      )
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(50));

    simRef.current = sim;

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "graph-link")
      .attr("stroke", (d) =>
        d.traffic > 100 ? "rgba(0,255,204,0.4)" : "rgba(255,255,255,0.08)",
      )
      .attr("stroke-width", (d) => Math.max(1, d.traffic / 80));

    // Node groups
    const node = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "graph-node")
      .style("cursor", "pointer")
      .call(
        d3
          .drag()
          .on("start", (e, d) => {
            if (!e.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (e, d) => {
            d.fx = e.x;
            d.fy = e.y;
          })
          .on("end", (e, d) => {
            if (!e.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      )
      .on("click", (_, d) => onSelectDevice(d));

    // Outer ring (gateway pulse)
    node
      .filter((d) => d.isGateway)
      .append("circle")
      .attr("r", 36)
      .attr("fill", "none")
      .attr("stroke", "#00ffcc")
      .attr("stroke-width", 1)
      .attr("opacity", 0.3)
      .attr("class", "pulse-ring");

    // Node circle
    node
      .append("circle")
      .attr("r", (d) => (d.isGateway ? 26 : 18))
      .attr("fill", (d) =>
        d.anomaly ? "rgba(255,68,68,0.15)" : `${DEVICE_COLORS[d.type]}18`,
      )
      .attr("stroke", (d) =>
        d.anomaly ? "#ff4444" : DEVICE_COLORS[d.type] || "#90a4ae",
      )
      .attr("stroke-width", (d) => (d.isGateway ? 2 : 1.5))
      .attr("filter", (d) =>
        d.anomaly ? "url(#glow-red)" : d.isGateway ? "url(#glow-teal)" : "none",
      );

    // Icon
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", (d) => (d.isGateway ? "16px" : "12px"))
      .attr("fill", (d) =>
        d.anomaly ? "#ff4444" : DEVICE_COLORS[d.type] || "#90a4ae",
      )
      .text((d) => DEVICE_ICONS[d.type] || "◇");

    // Label
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.isGateway ? 40 : 30))
      .attr("font-size", "9px")
      .attr("fill", "rgba(255,255,255,0.5)")
      .attr("font-family", "Share Tech Mono")
      .text((d) => d.ip);

    // Anomaly badge
    node
      .filter((d) => d.anomaly)
      .append("circle")
      .attr("cx", 14)
      .attr("cy", -14)
      .attr("r", 5)
      .attr("fill", "#ff4444")
      .attr("filter", "url(#glow-red)");

    sim.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [data?.devices?.length, data?.scanTime]);

  return <svg ref={svgRef} className="graph-svg" />;
}

// ─── Device Panel ─────────────────────────────────────────────────────────────
function DevicePanel({ device, onClose }) {
  if (!device) return null;
  const color = DEVICE_COLORS[device.type] || "#90a4ae";
  return (
    <div className="device-panel">
      <div
        className="dp-header"
        style={{ borderColor: device.anomaly ? "#ff4444" : color }}
      >
        <div className="dp-icon" style={{ color, borderColor: color }}>
          {DEVICE_ICONS[device.type]}
        </div>
        <div>
          <div className="dp-hostname">{device.hostname}</div>
          <div className="dp-type">{device.type.toUpperCase()}</div>
        </div>
        <button className="dp-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="dp-body">
        {device.anomaly && (
          <div className="dp-anomaly">
            ⚠ Anomaly Detected — Unusual activity on this device
          </div>
        )}
        <div className="dp-grid">
          <div className="dp-item">
            <span>IP</span>
            <strong>{device.ip}</strong>
          </div>
          <div className="dp-item">
            <span>MAC</span>
            <strong>{device.mac}</strong>
          </div>
          <div className="dp-item">
            <span>Vendor</span>
            <strong>{device.vendor}</strong>
          </div>
          <div className="dp-item">
            <span>OS</span>
            <strong>{device.os}</strong>
          </div>
          <div className="dp-item">
            <span>Status</span>
            <strong
              style={{
                color: device.status === "online" ? "#00ffcc" : "#90a4ae",
              }}
            >
              {device.status.toUpperCase()}
            </strong>
          </div>
          <div className="dp-item">
            <span>Latency</span>
            <strong>{device.latency}ms</strong>
          </div>
          <div className="dp-item">
            <span>Traffic</span>
            <strong>{formatBytes(device.traffic)}</strong>
          </div>
          <div className="dp-item">
            <span>Last Seen</span>
            <strong>{timeAgo(device.lastSeen)}</strong>
          </div>
        </div>
        {device.ports?.length > 0 && (
          <div className="dp-ports">
            <span>Open Ports</span>
            <div className="port-tags">
              {device.ports.map((p) => (
                <span key={p} className="port-tag">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, pulse }) {
  return (
    <div
      className="stat-card"
      style={{ borderColor: color || "rgba(255,255,255,0.1)" }}
    >
      <div className="sc-value" style={{ color: color || "#fff" }}>
        {pulse && <span className="sc-pulse" style={{ background: color }} />}
        {value}
      </div>
      <div className="sc-label">{label}</div>
      {sub && <div className="sc-sub">{sub}</div>}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [network, setNetwork] = useState(null);
  const [selected, setSelected] = useState(null);
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [log, setLog] = useState([]);
  const socketRef = useRef();

  const addLog = useCallback((msg) => {
    setLog((prev) =>
      [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50),
    );
  }, []);

  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      addLog("Connected to NetPulse backend");
    });
    socket.on("disconnect", () => {
      setConnected(false);
      addLog("Disconnected from backend");
    });
    socket.on("network_update", (data) => {
      setNetwork(data);
    });
    socket.on("scan_start", () => {
      setScanning(true);
      addLog("Network scan initiated...");
    });
    socket.on("scan_complete", (data) => {
      setNetwork(data);
      setScanning(false);
      addLog(
        `Scan complete — ${data.totalDevices} devices found, ${data.anomalies} anomalies`,
      );
    });

    return () => socket.disconnect();
  }, []);

  const triggerScan = () => {
    if (socketRef.current) {
      socketRef.current.emit("request_scan");
      addLog("Manual scan requested...");
    }
  };

  return (
    <div className="app">
      <div className="scanlines" />
      <div className="bg-radial" />

      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">
            NET<em>PULSE</em>
          </span>
        </div>
        <div className="header-center">
          <span className={`conn-dot ${connected ? "online" : "offline"}`} />
          <span className="conn-label">{connected ? "LIVE" : "OFFLINE"}</span>
          {network?.scanTime && (
            <span className="scan-time">
              Last scan: {new Date(network.scanTime).toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          className={`scan-btn ${scanning ? "scanning" : ""}`}
          onClick={triggerScan}
          disabled={scanning}
        >
          {scanning ? "⟳ SCANNING..." : "⟳ SCAN NOW"}
        </button>
      </header>

      <main className="main">
        {/* Stats Row */}
        <div className="stats-row">
          <StatCard
            label="DEVICES"
            value={network?.totalDevices ?? "—"}
            color="#00ffcc"
            pulse={connected}
          />
          <StatCard
            label="ONLINE"
            value={network?.onlineDevices ?? "—"}
            color="#4fc3f7"
          />
          <StatCard
            label="ANOMALIES"
            value={network?.anomalies ?? "—"}
            color={network?.anomalies > 0 ? "#ff4444" : "#90a4ae"}
          />
          <StatCard
            label="GATEWAY"
            value={network?.devices?.find((d) => d.isGateway)?.ip ?? "—"}
            color="#00ffcc"
          />
        </div>

        {/* Main Grid */}
        <div className="grid">
          {/* Graph */}
          <div className="graph-wrap">
            <div className="panel-label">NETWORK TOPOLOGY</div>
            {network ? (
              <NetworkGraph
                data={network}
                onSelectDevice={setSelected}
                selectedId={selected?.id}
              />
            ) : (
              <div className="graph-loading">
                <div className="spinner" />
                <p>Connecting to network...</p>
              </div>
            )}
            <DevicePanel device={selected} onClose={() => setSelected(null)} />
          </div>

          {/* Right column */}
          <div className="right-col">
            {/* Device List */}
            <div className="device-list-panel">
              <div className="panel-label">
                DEVICES{" "}
                <span className="panel-count">
                  {network?.devices?.length ?? 0}
                </span>
              </div>
              <div className="device-list">
                {network?.devices?.map((d) => (
                  <div
                    key={d.id}
                    className={`dl-item ${selected?.id === d.id ? "active" : ""} ${d.anomaly ? "anomaly" : ""}`}
                    onClick={() => setSelected(d)}
                  >
                    <span
                      className="dl-icon"
                      style={{ color: DEVICE_COLORS[d.type] }}
                    >
                      {DEVICE_ICONS[d.type]}
                    </span>
                    <div className="dl-info">
                      <div className="dl-hostname">{d.hostname}</div>
                      <div className="dl-ip">{d.ip}</div>
                    </div>
                    <div className="dl-right">
                      <span className={`dl-status ${d.status}`} />
                      {d.anomaly && <span className="dl-warn">⚠</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Log */}
            <div className="log-panel">
              <div className="panel-label">ACTIVITY LOG</div>
              <div className="log-list">
                {log.length === 0 && (
                  <div className="log-empty">Waiting for events...</div>
                )}
                {log.map((l, i) => (
                  <div key={i} className="log-item">
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
