#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");

const CDP_HOST = process.env.CDP_HOST || "127.0.0.1";
const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const DEFAULT_OUT_DIR = "C:\\Users\\m37d2\\OneDrive\\画像\\Screenshots\\tradingview";
const DEFAULT_LABELS = ["NK225-4h", "NK225-1h", "NK225-15m"];

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function listArg(name, fallback) {
  const value = argValue(name, "");
  if (!value) {
    return fallback;
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: CDP_HOST, port: CDP_PORT, path: pathname, timeout: 5000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("CDP request timed out")));
    req.on("error", reject);
  });
}

function cdpSession(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    let nextId = 0;
    const pending = new Map();

    const timer = setTimeout(() => {
      reject(new Error("WebSocket open timed out"));
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timer);
      resolve({
        send(method, params = {}, timeoutMs = 15000) {
          return new Promise((resolveCommand, rejectCommand) => {
            const id = ++nextId;
            const timeout = setTimeout(() => {
              pending.delete(id);
              rejectCommand(new Error(`${method} timed out`));
            }, timeoutMs);
            pending.set(id, { resolveCommand, rejectCommand, timeout });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          ws.close();
        },
      });
    };

    ws.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket error: ${event.message || "unknown"}`));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) {
        return;
      }
      const pendingCommand = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(pendingCommand.timeout);
      if (message.error) {
        pendingCommand.rejectCommand(new Error(JSON.stringify(message.error)));
        return;
      }
      pendingCommand.resolveCommand(message.result);
    };
  });
}

function timestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}

function sanitizeFilePart(value) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "tradingview";
}

function normalizeTimeframe(value) {
  const text = String(value || "").trim();
  const match = text.match(/(?:^|[^\d])((?:15|60|1|4)\s*(?:分|時間|m|h|H)?)(?:$|[^\d])/);
  if (!match) {
    return null;
  }
  const token = match[1].replace(/\s+/g, "");
  if (token === "15" || token === "15分" || token.toLowerCase() === "15m") {
    return "15m";
  }
  if (token === "60" || token === "60分" || token === "1時間" || token.toLowerCase() === "1h") {
    return "1h";
  }
  if (token === "4時間" || token.toLowerCase() === "4h") {
    return "4h";
  }
  return null;
}

function labelFromTimeframe(timeframe, index) {
  if (timeframe === "15m") {
    return "NK225-15m";
  }
  if (timeframe === "1h") {
    return "NK225-1h";
  }
  if (timeframe === "4h") {
    return "NK225-4h";
  }
  return `NK225-chart-${String(index).padStart(2, "0")}`;
}

async function detectTimeframe(session, targetTitle) {
  const titleMatch = normalizeTimeframe(targetTitle);
  if (titleMatch) {
    return titleMatch;
  }
  try {
    await session.send("Runtime.enable");
    const result = await session.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `
(() => {
  const values = [];
  const elements = Array.from(document.querySelectorAll('button, [role="button"], [data-name], [aria-label], span, div')).slice(0, 2500);
  for (const el of elements) {
    const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('data-name') || '').trim();
    if (!text || text.length > 40) continue;
    if (/^(15分|1時間|4時間|15m|1h|4h|15|60)$/.test(text)) values.push(text);
  }
  return values.slice(0, 30);
})()
      `,
    });
    const values = result.result?.value || [];
    for (const value of values) {
      const timeframe = normalizeTimeframe(value);
      if (timeframe) {
        return timeframe;
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}

async function captureTarget(target, outputPath, existingSession = null) {
  const session = existingSession || await cdpSession(target.webSocketDebuggerUrl);
  try {
    await session.send("Page.enable");
    const result = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    fs.writeFileSync(outputPath, Buffer.from(result.data, "base64"));
  } finally {
    if (!existingSession) {
      session.close();
    }
  }
}

async function main() {
  const outDir = path.resolve(argValue("--out", DEFAULT_OUT_DIR));
  const match = argValue("--match", "tradingview.com/chart");
  const limit = Number(argValue("--limit", "3"));
  const labels = listArg("--labels", DEFAULT_LABELS);
  const autoDetect = hasArg("--auto-detect-timeframe");
  const dryRun = hasArg("--dry-run");

  fs.mkdirSync(outDir, { recursive: true });

  const targets = await getJson("/json/list");
  const chartTabs = targets
    .filter((target) => target.type === "page")
    .filter((target) => target.webSocketDebuggerUrl)
    .filter((target) => target.url.includes(match))
    .slice(0, limit);

  if (chartTabs.length === 0) {
    throw new Error(`No Chrome page tabs matched: ${match}`);
  }

  const runStamp = timestamp();
  const manifest = [];

  for (let i = 0; i < chartTabs.length; i += 1) {
    const tab = chartTabs[i];
    let session = null;
    try {
      session = await cdpSession(tab.webSocketDebuggerUrl);
      const timeframe = autoDetect ? await detectTimeframe(session, tab.title) : null;
      const label = labels[i] || labelFromTimeframe(timeframe, i + 1);
      const fileName = `${runStamp}-${sanitizeFilePart(label)}.png`;
      const outputPath = path.join(outDir, fileName);
      if (!dryRun) {
        await captureTarget(tab, outputPath, session);
      }
      manifest.push({
        index: i + 1,
        label,
        timeframe,
        title: tab.title,
        url: tab.url,
        outputPath,
        captured: !dryRun,
      });
    } finally {
      if (session) {
        session.close();
      }
    }
  }

  const manifestPath = path.join(outDir, `${runStamp}-manifest.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify({ outDir, manifestPath, count: manifest.length, tabs: manifest }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
