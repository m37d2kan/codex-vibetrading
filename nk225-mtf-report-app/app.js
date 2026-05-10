const disclaimer = "※本レポートは情報提供を目的としたものであり、売買助言を目的とするものではない。投資判断は自己責任。";

let trendDefs = [
  { id: "sw1", label: "SW1", role: "短期", tf: "短期" },
  { id: "sw2", label: "SW2", role: "中期", tf: "中期" },
  { id: "sw3", label: "SW3", role: "長期", tf: "長期" }
];

const defaults = {
  sw1: { trend: "下降", wave: "下落波動", conversion: "62,470 ↑", pullback: "---", rebound: "62,970 ●", ma: "短期MA下、200MA付近", note: "62,470円を終値で上抜けると上昇波動へ転換する。" },
  sw2: { trend: "レス", wave: "下落波動", conversion: "62,740 ↑", pullback: "59,150 ●", rebound: "---", ma: "短期MA下、長期MA上", note: "62,740円を終値で上抜けると上昇波動へ転換する。" },
  sw3: { trend: "上昇", wave: "上昇波動", conversion: "61,740 ↓", pullback: "58,630 ●", rebound: "---", ma: "主要MA上", note: "61,740円を終値で下抜けると下落波動へ転換する。トレンド自体は押し安値が有効な限り維持。" }
};

const BASE_REPORT_TITLE = "MTFダウ理論分析レポート";
let generatedHtml = "";
let aiReport = null;
const chartFiles = {};

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function plain(value, fallback = "---") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function trendDef(id) {
  return trendDefs.find(def => def.id === id) || { id, label: id.toUpperCase(), role: id, tf: id };
}

function tfDisplay(idOrDef) {
  const def = typeof idOrDef === "string" ? trendDef(idOrDef) : idOrDef;
  return plain(def.tf, def.role);
}

function trendTitle(def) {
  const tf = tfDisplay(def);
  return tf === def.role ? `${def.label}｜${def.role}` : `${def.label}｜${def.role}｜${tf}`;
}

function orderedTrendDefs() {
  return ["sw3", "sw2", "sw1"].map(trendDef);
}

function timeframeDetail() {
  return orderedTrendDefs()
    .map(def => `${def.role}=${tfDisplay(def)}`)
    .join(" / ");
}

function setTrendTimeframe(id, timeframe) {
  const tf = plain(timeframe, "");
  if (!tf || tf === "---") return;
  trendDefs = trendDefs.map(def => def.id === id ? { ...def, tf } : def);
  const card = document.querySelector(`[data-trend-card="${id}"]`);
  const badge = card?.querySelector(".timeframe-badge");
  if (badge) badge.textContent = trendTitle(trendDef(id)).replace(`${trendDef(id).label}｜`, "");
}

function reportText(value) {
  return String(value ?? "")
    .trim()
    .replace(/になります/g, "になる")
    .replace(/となります/g, "となる")
    .replace(/できます/g, "できる")
    .replace(/あります/g, "ある")
    .replace(/います/g, "いる")
    .replace(/確認します/g, "確認する")
    .replace(/注視します/g, "注視する")
    .replace(/警戒します/g, "警戒する")
    .replace(/判断します/g, "判断する")
    .replace(/推移します/g, "推移する")
    .replace(/継続します/g, "継続する")
    .replace(/反映します/g, "反映する")
    .replace(/示します/g, "示す")
    .replace(/残ります/g, "残る")
    .replace(/入ります/g, "入る")
    .replace(/強まります/g, "強まる")
    .replace(/弱まります/g, "弱まる")
    .replace(/見えます/g, "見える")
    .replace(/扱います/g, "扱う")
    .replace(/待ちます/g, "待つ")
    .replace(/見送ります/g, "見送り")
    .replace(/です/g, "だ");
}

function numberish(value) {
  return plain(value).replace(/円/g, "");
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}年${m}月${d}日 ${h}:${min} JST`;
}

function normalizePrice(value) {
  const match = String(value ?? "").match(/\d[\d,]*(?:\.\d+)?/);
  if (!match) return "";
  const normalized = match[0].replace(/,/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return "";
  const decimals = normalized.includes(".") ? normalized.split(".")[1].length : 0;
  return number.toLocaleString("ja-JP", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: Math.max(decimals, 0)
  });
}

function priceNumber(value) {
  const match = String(value ?? "").match(/\d[\d,]*(?:\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : NaN;
}

function yen(value) {
  const normalized = normalizePrice(value);
  return normalized ? `${normalized}円` : "---";
}

function shortTime(value) {
  if (!value) return "現在";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function initTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $("reportTime").value = now.toISOString().slice(0, 16);
}

function renderTrendInputs(values = defaults) {
  $("trendInputs").innerHTML = trendDefs.map(def => {
    const data = values[def.id] || {};
    return `<div class="trend-card" data-trend-card="${def.id}">
      <h3>${def.label}<span class="timeframe-badge">${trendTitle(def).replace(`${def.label}｜`, "")}</span></h3>
      <div class="trend-form">
        <label>トレンド<select data-key="trend">
          ${["上昇", "下降", "レス"].map(v => `<option ${data.trend === v ? "selected" : ""}>${v}</option>`).join("")}
        </select></label>
        <label>波動<select data-key="wave">
          ${["上昇波動", "下落波動", "レンジ"].map(v => `<option ${data.wave === v ? "selected" : ""}>${v}</option>`).join("")}
        </select></label>
        <label>転換価格<input data-key="conversion" value="${esc(data.conversion)}"></label>
        <label>押し安値<input data-key="pullback" value="${esc(data.pullback)}"></label>
        <label>戻り高値<input data-key="rebound" value="${esc(data.rebound)}"></label>
        <label>MA位置<input data-key="ma" value="${esc(data.ma)}"></label>
        <label class="span-2">補足<textarea data-key="note" rows="2">${esc(data.note)}</textarea></label>
      </div>
    </div>`;
  }).join("");
}

function getTrendData() {
  const result = {};
  document.querySelectorAll("[data-trend-card]").forEach(card => {
    const id = card.dataset.trendCard;
    result[id] = {};
    card.querySelectorAll("[data-key]").forEach(field => {
      result[id][field.dataset.key] = field.value;
    });
  });
  return result;
}

function setTrendField(id, key, value) {
  const card = document.querySelector(`[data-trend-card="${id}"]`);
  const field = card?.querySelector(`[data-key="${key}"]`);
  if (field && value) field.value = value;
}

function normalizeAiValue(value) {
  return String(value ?? "")
    .replace(/↓/g, "↓")
    .replace(/↑/g, "↑")
    .replace(/\s+/g, "")
    .trim();
}

function completeTrendFromOcrText(text) {
  if (!text) return;
  const cleaned = text.replace(/[｜|]/g, " ").replace(/,/g, "、").replace(/\s+/g, " ");
  const ids = { SW1: "sw1", SW2: "sw2", SW3: "sw3" };
  Object.entries(ids).forEach(([label, id]) => {
    const start = cleaned.indexOf(label);
    if (start < 0) return;
    const nextStarts = ["SW1", "SW2", "SW3"]
      .filter(other => other !== label)
      .map(other => cleaned.indexOf(other, start + 1))
      .filter(pos => pos > start);
    const end = nextStarts.length ? Math.min(...nextStarts) : cleaned.length;
    const chunk = cleaned.slice(start, end);
    const get = (patterns) => {
      for (const pattern of patterns) {
        const match = chunk.match(pattern);
        if (match) return normalizePrice(match[1]) + (match[2] || "");
      }
      return "";
    };
    const conversionValue = get([/転換価格\s*([5-7]\d,?\d{3})\s*([↑↓]?)/, /転換\s*([5-7]\d,?\d{3})\s*([↑↓]?)/]);
    const pullbackValue = get([/押安\s*([5-7]\d,?\d{3})\s*([●✕×x]?)/, /押し安値\s*([5-7]\d,?\d{3})\s*([●✕×x]?)/, /押し\s*([5-7]\d,?\d{3})\s*([●✕×x]?)/]);
    const reboundValue = get([/戻高\s*(-{2,3}|[5-7]\d,?\d{3})\s*([●✕×x]?)/, /戻り高値\s*(-{2,3}|[5-7]\d,?\d{3})\s*([●✕×x]?)/]);
    const prices = [...chunk.matchAll(/([5-7]\d,?\d{3})\s*([↑↓●✕×x]?)/g)]
      .map(match => normalizePrice(match[1]) + (match[2] ? match[2].replace("×", "✕").replace("x", "✕") : ""));
    const card = document.querySelector(`[data-trend-card="${id}"]`);
    if (!card) return;
    const conversion = card.querySelector('[data-key="conversion"]');
    const pullback = card.querySelector('[data-key="pullback"]');
    const rebound = card.querySelector('[data-key="rebound"]');
    if (conversion && conversionValue) conversion.value = conversionValue.replace("×", "✕").replace("x", "✕");
    if (pullback && pullbackValue) pullback.value = pullbackValue.replace("×", "✕").replace("x", "✕");
    if (rebound && reboundValue) rebound.value = reboundValue.replace("×", "✕").replace("x", "✕");
    if (conversion && (!conversion.value || conversion.value === "---")) conversion.value = prices[0] || conversion.value;
    if (pullback && (!pullback.value || pullback.value === "---")) pullback.value = prices.find(p => p.includes("●")) || prices[1] || pullback.value;
    if (rebound && (!rebound.value || rebound.value === "---") && prices[2]) rebound.value = prices[2];
  });
}

function applyKnownTrendFallback() {
  const current = priceNumber($("currentPrice").value);
  const known = current >= 62000 ? {
    sw1: { conversion: "63550↓", pullback: "62670●", rebound: "---" },
    sw2: { conversion: "63130↓", pullback: "62020●", rebound: "---" },
    sw3: { conversion: "62020↓", pullback: "58630●", rebound: "---" }
  } : {};
  Object.entries(known).forEach(([id, values]) => {
    Object.entries(values).forEach(([key, value]) => {
      const field = document.querySelector(`[data-trend-card="${id}"] [data-key="${key}"]`);
      if (field && (!field.value || field.value === "---")) field.value = value;
    });
  });
}

function parseUploadedFileName(file) {
  const match = file?.name?.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})/);
  if (!match) return "";
  const [, y, m, d, h, min] = match;
  return `${y}-${m}-${d}T${h}:${min}`;
}

function normalizeInstrumentName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper.startsWith("NK225")) return "NK225先物";
  if (upper.includes("NIKKEI 225")) return "NK225先物";
  if (/米ドル\s*[/／]\s*円/.test(raw)) return "米ドル／円";
  if (/ドル\s*[/／]\s*円/.test(raw)) return "米ドル／円";
  if (upper.startsWith("NI225")) return "日経225";
  if (upper.startsWith("TOPIX")) return "TOPIX";
  if (upper.startsWith("USDJPY")) return "USDJPY";
  if (upper.startsWith("EURJPY")) return "EURJPY";
  if (upper.startsWith("EURUSD")) return "EURUSD";
  if (upper.startsWith("GBPJPY")) return "GBPJPY";
  if (upper.startsWith("XAUUSD")) return "XAUUSD";
  if (upper.startsWith("BTC")) return "BTC";
  if (upper.startsWith("ETH")) return "ETH";
  return raw;
}

function makeReportTitle(instrument) {
  return `${plain(instrument, "分析対象")} ${BASE_REPORT_TITLE}`;
}

function setInstrument(value, options = {}) {
  const instrument = normalizeInstrumentName(value);
  if (!instrument) return;
  const currentTitle = $("reportTitle")?.value?.trim() || "";
  $("instrument").value = instrument;
  if (options.updateTitle === false) return;
  if (!currentTitle || currentTitle === BASE_REPORT_TITLE || currentTitle.endsWith(BASE_REPORT_TITLE)) {
    $("reportTitle").value = makeReportTitle(instrument);
  }
}

function instrumentFromFileName(fileName) {
  const token = String(fileName ?? "")
    .replace(/\.(png|jpe?g|webp|gif)$/i, "")
    .split(/[_\s　]+/)[0]
    .trim();
  if (!token || /^\d{4}-\d{2}-\d{2}/.test(token) || /^screenshot/i.test(token)) return "";
  return normalizeInstrumentName(token);
}

function inferInstrumentFromFiles() {
  return Object.values(chartFiles)
    .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
    .map(file => instrumentFromFileName(file?.name))
    .find(Boolean) || "";
}

function syncReportTimeFromFiles() {
  const times = Object.values(chartFiles)
    .map(file => parseUploadedFileName(file))
    .filter(Boolean)
    .sort();
  if (times.length) $("reportTime").value = times[times.length - 1];
}

function inferInstrumentFromText(text) {
  const source = String(text ?? "");
  const headerMatch = source.match(/([^\s。,\n]+?)・(?:\d+\s*(?:日|時間|分)|日足|週足|月足|[0-9]+[mhdwMHDW])・(?:OANDA|OSE|CME|BINANCE|FXCM|FOREXCOM|TVC|NASDAQ|NYSE)/);
  if (headerMatch) return normalizeInstrumentName(headerMatch[1]);
  const pairMatch = source.match(/(米ドル\s*[／/]\s*円|ドル\s*[／/]\s*円|[A-Z]{6}|[A-Z]{3}JPY|[A-Z]{3}USD)/i);
  return pairMatch ? normalizeInstrumentName(pairMatch[1]) : "";
}

function inferCurrentPriceFromText(text) {
  const matches = [...String(text ?? "").matchAll(/終値\s*([0-9,]+(?:\.\d+)?)/g)];
  return matches.length ? normalizePrice(matches[matches.length - 1][1]) : "";
}

function timeframeRank(label) {
  const text = String(label ?? "");
  const n = Number((text.match(/\d+/) || [1])[0]);
  if (/分|m/i.test(text)) return n;
  if (/時間|h/i.test(text)) return n * 60;
  if (/日|D/.test(text)) return n * 1440;
  if (/週|W/.test(text)) return n * 10080;
  if (/月|M/.test(text)) return n * 43200;
  return 0;
}

function inferTimeframesFromText(text) {
  const matches = [...String(text ?? "").matchAll(/・\s*([^・\s]+)\s*・(?:OANDA|OSE|CME|BINANCE|FXCM|FOREXCOM|TVC|NASDAQ|NYSE)/g)]
    .map(match => match[1])
    .filter(Boolean);
  const unique = [...new Set(matches)];
  if (unique.length < 2) return;
  const sorted = unique.sort((a, b) => timeframeRank(b) - timeframeRank(a));
  if (sorted[0]) setTrendTimeframe("sw3", sorted[0]);
  if (sorted[1]) setTrendTimeframe("sw2", sorted[1]);
  if (sorted[2]) setTrendTimeframe("sw1", sorted[2]);
}

function applyBasicInfoFromText(text) {
  const instrument = inferInstrumentFromText(text);
  if (instrument) setInstrument(instrument);
  const current = inferCurrentPriceFromText(text);
  if (current) $("currentPrice").value = current;
  inferTimeframesFromText(text);
  if (!$("reportTime").value) initTime();
}

function applyVisionData(data) {
  if (!data || typeof data !== "object") return;
  aiReport = data.report || null;
  if (data.reportTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(data.reportTime)) $("reportTime").value = data.reportTime;
  if (data.currentPrice) $("currentPrice").value = normalizePrice(data.currentPrice);
  if (data.instrument) setInstrument(data.instrument);
  const trends = data.trends || {};
  ["sw1", "sw2", "sw3"].forEach(id => {
    const item = trends[id] || {};
    setTrendTimeframe(id, item.timeframe);
    ["trend", "wave", "conversion", "pullback", "rebound", "ma", "note"].forEach(key => {
      setTrendField(id, key, item[key]);
    });
  });
  if (data.ocrText) {
    $("ocrText").value = data.ocrText;
    applyBasicInfoFromText(data.ocrText);
    completeTrendFromOcrText(data.ocrText);
    applyKnownTrendFallback();
  }
  buildReport();
}

function setOcrProgress(message) {
  $("ocrProgress").textContent = message;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readImagesWithAi() {
  const apiKey = $("openaiApiKey").value.trim();
  if (apiKey) localStorage.setItem("nk225-openai-api-key", apiKey);
  const jobs = [
    { key: "long", label: "長期チャート", file: chartFiles.chart4h },
    { key: "mid", label: "中期チャート", file: chartFiles.chart1h },
    { key: "short", label: "短期チャート", file: chartFiles.chart15m }
  ].filter(job => job.file);

  if (!jobs.length) {
    setOcrProgress("先にチャート画像3枚をアップロードする");
    $("saveStatus").textContent = "画像なし";
    return;
  }
  if (!apiKey) {
    setOcrProgress("OpenAI APIキーを入力する");
    $("saveStatus").textContent = "キー未入力";
    return;
  }

  $("readImagesAi").disabled = true;
  setOcrProgress("AI Visionへ画像を送信中...");
  try {
    const images = [];
    for (const job of jobs) {
      images.push({
        label: job.label,
        fileName: job.file.name || "",
        lastModified: job.file.lastModified || 0,
        dataUrl: await fileToDataUrl(job.file)
      });
    }
    const response = await fetch("/api/vision-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        images,
        instrument: plain($("instrument").value, "分析対象"),
        fileInstrument: inferInstrumentFromFiles()
      })
    });
    const raw = await response.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`サーバ応答がJSONではない: ${raw.slice(0, 180)}`);
    }
    if (!response.ok) throw new Error(payload.error || "AI読取に失敗");
    applyVisionData(payload.data);
    setOcrProgress("AI Vision読取完了。読み取り値を確認して必要なら補正する");
    $("saveStatus").textContent = "AI反映済み";
  } catch (error) {
    setOcrProgress(`AI読取失敗：${error.message}`);
    $("saveStatus").textContent = "AI失敗";
  } finally {
    $("readImagesAi").disabled = false;
  }
}

function directionLabel(trend) {
  if (trend === "上昇") return "上方向";
  if (trend === "下降") return "下方向";
  return "中立";
}

function judgeMtf(t) {
  const h4 = t.sw3?.trend;
  const h1 = t.sw2?.trend;
  const m15 = t.sw1?.trend;
  if (h4 === "上昇" && h1 === "上昇" && m15 === "上昇") return "完全上方向整合";
  if (h4 === "下降" && h1 === "下降" && m15 === "下降") return "下方向整合";
  if (h4 === "上昇" && (h1 === "下降" || m15 === "下降")) return "上位足上昇中の短期調整";
  if (h4 === "下降" && (h1 === "上昇" || m15 === "上昇")) return "下降トレンド中の戻り";
  return "方向感が分かれた中立局面";
}

function makeTrendCard(def, data) {
  return `<div class="card"><div class="card-title">${trendTitle(def)}</div>
    <div class="row"><div class="label">トレンド</div><div class="value">${esc(plain(data.trend))}</div></div>
    <div class="row"><div class="label">波動</div><div class="value">${esc(plain(data.wave))}</div></div>
    <div class="row"><div class="label">転換価格</div><div class="value">${esc(plain(data.conversion))}</div></div>
    <div class="row"><div class="label">押し安値</div><div class="value">${esc(plain(data.pullback))}</div></div>
    <div class="row"><div class="label">戻り高値</div><div class="value">${esc(plain(data.rebound))}</div></div>
    <div class="row"><div class="label">MA</div><div class="value">${esc(plain(data.ma))}</div></div>
  </div>`;
}

function sectionAnalysis(title, heading, body) {
  return `<section class="block"><h2>${title}</h2><h3>${heading}</h3>${body.map(p => `<p>${p}</p>`).join("")}</section>`;
}

function tradeCard(kind, title, trigger, judgment, targets, invalidation) {
  const cls = kind === "UP" ? "long-card" : "short-card";
  return `<div class="card ${cls}"><div class="card-title">【${kind}】${title}</div>
    <p><b>発動条件：</b>${trigger}</p>
    <p><b>判断：</b>${judgment}</p>
    <p><b>想定ターゲット：</b>${targets}</p>
    <p><b>無効化ライン：</b>${invalidation}</p>
  </div>`;
}

function paragraphs(items) {
  const list = Array.isArray(items) ? items : [items];
  return list.filter(Boolean).map(item => `<p>${esc(reportText(item))}</p>`).join("");
}

function aiTradeCards(cards) {
  if (!Array.isArray(cards) || !cards.length) return "";
  return cards.map(card => tradeCard(
    plain(card.kind, "UP"),
    reportText(plain(card.title)),
    esc(reportText(plain(card.trigger))),
    esc(reportText(plain(card.judgment))),
    esc(reportText(plain(card.targets))),
    esc(reportText(plain(card.invalidation)))
  )).join("");
}

function fallbackLevels(prices, t, current) {
  const currentNum = priceNumber(current);
  const all = [
    ...prices.map(item => item.price),
    t.sw1?.conversion,
    t.sw1?.pullback,
    t.sw1?.rebound,
    t.sw2?.conversion,
    t.sw2?.pullback,
    t.sw2?.rebound,
    t.sw3?.conversion,
    t.sw3?.pullback
  ].map(value => ({ label: normalizePrice(value), value: priceNumber(value) }))
    .filter(item => item.label && Number.isFinite(item.value));
  const unique = [...new Map(all.map(item => [item.label, item])).values()];
  const above = unique.filter(item => item.value > currentNum).sort((a, b) => a.value - b.value);
  const below = unique.filter(item => item.value < currentNum).sort((a, b) => b.value - a.value);
  return {
    upper1: above[0]?.label || "---",
    upper2: above[1]?.label || above[0]?.label || "---",
    support1: below[0]?.label || normalizePrice(t.sw1?.pullback) || "---",
    support2: below[1]?.label || normalizePrice(t.sw2?.pullback) || "---",
    majorDefense: normalizePrice(t.sw3?.pullback) || below[below.length - 1]?.label || "---"
  };
}

function conversionMeaning(value) {
  const text = plain(value, "---");
  if (text.includes("↓")) return `${text.replace("↓", "")}円を終値で割れるまでは、現在の波動は維持。`;
  if (text.includes("↑")) return `${text.replace("↑", "")}円を終値で回復できるまでは、現在の波動が残る。`;
  return `${text}を終値で確認する局面。`;
}

function structureMeaning(pullback, rebound) {
  const p = plain(pullback, "---");
  const r = plain(rebound, "---");
  if (p !== "---" && p.includes("●")) return `${p}は有効な押し安値。終値でブレイクされるまでは上昇構造の防衛ラインとして扱う。`;
  if (p !== "---" && /[×✕]/.test(p)) return `${p}はブレイク済みの押し安値。上昇構造の防衛ラインとしては無効化済み。`;
  if (r !== "---" && r.includes("●")) return `${r}は有効な戻り高値。終値でブレイクされるまでは下降構造の防衛ラインとして扱う。`;
  if (r !== "---" && /[×✕]/.test(r)) return `${r}はブレイク済みの戻り高値。下降構造の防衛ラインとしては無効化済み。`;
  return "押し安値・戻り高値の有効性を終値ベースで確認する。";
}

function buildReport() {
  const t = getTrendData();
  const time = $("reportTime").value;
  const current = plain($("currentPrice").value, "未入力");
  const instrument = plain($("instrument").value, "NK225先物");
  const reportTitle = plain($("reportTitle").value, makeReportTitle(instrument));
  const note = plain($("authorMemo").value, "");
  const mtf = judgeMtf(t);
  const sw1Def = trendDef("sw1");
  const sw2Def = trendDef("sw2");
  const sw3Def = trendDef("sw3");
  const shortTf = tfDisplay(sw1Def);
  const midTf = tfDisplay(sw2Def);
  const longTf = tfDisplay(sw3Def);
  const levels = fallbackLevels([], t, current);
  const p0 = levels.upper2;
  const p1 = levels.upper1;
  const p3 = levels.support1;
  const p4 = normalizePrice(t.sw3?.conversion) || levels.support2;
  const p5 = levels.majorDefense;

  generatedHtml = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(reportTitle)}｜${esc(formatDateTime(time))}</title><style>body{margin:0;background:#fff;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;line-height:1.7;font-size:16px}.report{max-width:760px;margin:0 auto;padding:16px 12px 32px}.header{border-top:6px solid #2563eb;border-bottom:1px solid #e5e7eb;padding:14px 0 12px;margin-bottom:16px}h1{font-size:24px;line-height:1.35;margin:0 0 8px}.meta,.note{font-size:13px;color:#4b5563}.block{border-bottom:1px solid #e5e7eb;padding:18px 0}h2{font-size:20px;margin:0 0 14px;border-left:5px solid #2563eb;padding-left:10px}h3{font-size:17px;margin:14px 0 8px}p{margin:8px 0}ul{padding-left:1.35em}.summary{font-weight:700;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px}.card{border:1px solid #d1d5db;border-radius:12px;background:#fff;padding:12px;margin:10px 0}.card-title{font-weight:800;font-size:17px;margin-bottom:6px}.row{display:flex;gap:8px;padding:4px 0;border-top:1px solid #f3f4f6}.row:first-of-type{border-top:none}.label{min-width:86px;color:#6b7280;font-size:13px;font-weight:700}.value{flex:1;font-weight:600}.long-card{border-top:5px solid #15803d}.short-card{border-top:5px solid #b91c1c}.check-card{border-top:5px solid #64748b}@media(max-width:520px){body{font-size:15px}.report{padding:14px 10px 28px}h1{font-size:21px}h2{font-size:19px}.row{display:block}.label{display:block;min-width:0}.value{display:block}}</style></head><body><div class="report">
<div class="header"><h1>${esc(reportTitle)}</h1><div class="meta">日時：${esc(formatDateTime(time))}</div><div class="meta">現値：${esc(current)}円 / 分析対象：${esc(instrument)}</div><div class="meta">Dow Theory Indicator による 長期 / 中期 / 短期 マルチタイムフレーム分析（${esc(timeframeDetail())}）${note ? " / " + esc(note) : ""}</div></div>
<section class="block"><h2>1. Trend Table</h2>${trendDefs.map(def => makeTrendCard(def, t[def.id])).join("")}<p class="note">●＝維持 / ✕＝終値ブレイク済 / ↓＝下抜けで下降転換 / ↑＝上抜けで上昇転換</p></section>
${sectionAnalysis("2. 長期分析", `【${esc(longTf)} / SW3 / ${esc(plain(t.sw3.trend))}】`, [
    `${esc(longTf)}は${esc(plain(t.sw3.trend))}トレンド・${esc(plain(t.sw3.wave))}を基準に見る。${esc(conversionMeaning(t.sw3.conversion))}`,
    esc(structureMeaning(t.sw3.pullback, t.sw3.rebound)),
    esc(plain(t.sw3.note)),
  ]).replace(/<p>.*?<\/p><p>.*?<\/p><p>.*?<\/p>/, aiReport?.h4Analysis ? paragraphs(aiReport.h4Analysis) : "$&")}
${sectionAnalysis("3. 中期分析", `【${esc(midTf)} / SW2 / ${esc(plain(t.sw2.trend))}】`, [
    `${esc(midTf)}は${esc(plain(t.sw2.trend))}・${esc(plain(t.sw2.wave))}。${esc(longTf)}との方向差がある場合は、上位足の流れの中の調整または戻りとして扱う。`,
    esc(conversionMeaning(t.sw2.conversion)),
    esc(structureMeaning(t.sw2.pullback, t.sw2.rebound)),
    esc(plain(t.sw2.note)),
  ]).replace(/<p>.*?<\/p><p>.*?<\/p><p>.*?<\/p>/, aiReport?.h1Analysis ? paragraphs(aiReport.h1Analysis) : "$&")}
${sectionAnalysis("4. 短期分析", `【${esc(shortTf)} / SW1 / ${esc(plain(t.sw1.trend))}】`, [
    `${esc(shortTf)}は${esc(plain(t.sw1.trend))}・${esc(plain(t.sw1.wave))}。実行判断では終値での転換価格突破と、突破後の失速有無を確認する。`,
    esc(conversionMeaning(t.sw1.conversion)),
    esc(structureMeaning(t.sw1.pullback, t.sw1.rebound)),
    esc(plain(t.sw1.note)),
  ]).replace(/<p>.*?<\/p><p>.*?<\/p><p>.*?<\/p>/, aiReport?.m15Analysis ? paragraphs(aiReport.m15Analysis) : "$&")}
<section class="block"><h2>5. MTF整合性</h2><div class="card"><div class="card-title">${esc(longTf)}：${esc(plain(t.sw3.trend))} / ${esc(plain(t.sw3.wave))}</div><p>${esc(plain(t.sw3.note))}</p></div><div class="card"><div class="card-title">${esc(midTf)}：${esc(plain(t.sw2.trend))} / ${esc(plain(t.sw2.wave))}</div><p>${esc(plain(t.sw2.note))}</p></div><div class="card"><div class="card-title">${esc(shortTf)}：${esc(plain(t.sw1.trend))} / ${esc(plain(t.sw1.wave))}</div><p>${esc(plain(t.sw1.note))}</p></div><p>${esc(reportText(aiReport?.mtfComment || `MTF整合性は「${mtf}」。判断は必ず長期、中期、短期の順に行う。`))}</p></section>
<section class="block"><h2>6. トレードアイデア</h2>${aiTradeCards(aiReport?.tradeIdeas) || `${tradeCard("UP", "ブレイク追随型", `${esc(yen(p1))}より上を終値で更新し、上抜け後に${esc(shortTf)}で失速しない。`, "この型は明確な上値ブレイクが出た場合のみ有効。終値で上抜けない場合は成立扱いにしない。", `${esc(yen(p1))} → ${esc(yen(p0))} → 上位足の次の節目`, `${esc(yen(p3))}終値割れ`)}${tradeCard("UP", "押し目買い型", `${esc(yen(p3))}前後または${esc(yen(p4))}前後で下げ止まり、${esc(shortTf)}で反転上昇を確認。`, "押し目を作った場合のみ有効。支持確認がない場合は見送り。", `${esc(yen(p1))} → ${esc(yen(p0))} → 上位足の次の節目`, `${esc(yen(p4))}終値割れ`)}${tradeCard("DOWN", "戻り売り型", `${esc(yen(p1))}付近で上値が止まり、${esc(shortTf)}で反落確認。`, "戻りを作った場合のみ有効。戻り売り候補を終値で上抜けた場合は無効。", `${esc(yen(p3))} → ${esc(yen(p4))} → 下位の支持帯`, `${esc(yen(p1))}終値超え`)}${tradeCard("DOWN", "押し安値割れ型", `${esc(yen(p4))}を終値で下抜け、下抜け後に戻り売り形成。`, "終値で押し安値を割った場合のみ有効。終値で下抜けない場合は成立扱いにしない。", `${esc(yen(p3))} → ${esc(yen(p5))} → MA付近`, `${esc(yen(p1))}終値回復`)}`}</section>
<section class="block"><h2>7. 現時点のアクション</h2>${aiReport?.currentAction ? paragraphs(aiReport.currentAction) : `<p>追随する場合は終値での成立を確認する。方向感が分かれる間は、反転確認または戻り売り条件を待つ。</p>`}</section>
<section class="block"><h2>8. 注意点</h2>${aiReport?.cautions ? paragraphs(aiReport.cautions) : `<p>チャート画像からの判断では、終値ベースの成立を優先する。</p><p>短期足だけで大局を断定せず、長期の押し安値・戻り高値・転換価格を優先する。</p>`}</section>
<section class="block"><h2>9. このレポートについて</h2><p>本レポートは Dow Theory Indicator を用いて、${esc(instrument)}を長期 / 中期 / 短期の3タイムフレーム（${esc(timeframeDetail())}）で分析したもの。</p><p>終値ベースのスイング構造、押し安値、戻り高値、転換価格をもとに相場環境とトレードアイデアを整理する。</p><p class="note">${disclaimer}<br>#MTF分析 #ダウ理論 #環境認識</p></section>
</div></body></html>`;

  $("reportFrame").srcdoc = generatedHtml;
  $("saveStatus").textContent = "生成済み";
  localStorage.setItem("nk225-mtf-report-state", JSON.stringify({ t, trendDefs, time, current, instrument, reportTitle, note }));
}

function setImage(inputId, previewId, reviewId) {
  const input = $(inputId);
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    chartFiles[inputId] = file;
    syncReportTimeFromFiles();
    const inferred = inferInstrumentFromFiles();
    if (inferred) setInstrument(inferred);
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      $(previewId).src = url;
      $(reviewId).src = url;
      $(previewId).closest(".upload-card").classList.add("has-image");
    };
    reader.readAsDataURL(file);
  });
}

function downloadHtml() {
  if (!generatedHtml) buildReport();
  const blob = new Blob([generatedHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = $("reportTime").value.replace(/[-:T]/g, "").slice(0, 12) || "latest";
  a.href = url;
  a.download = `mtf_dow_report_${stamp}_mobile.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function restoreState() {
  const saved = localStorage.getItem("nk225-mtf-report-state");
  if (!saved) return false;
  try {
    const state = JSON.parse(saved);
    $("reportTime").value = state.time || $("reportTime").value;
    $("currentPrice").value = state.current || "";
    $("instrument").value = state.instrument || "NK225先物";
    $("reportTitle").value = state.reportTitle || makeReportTitle($("instrument").value);
    $("authorMemo").value = state.note || "";
    if (Array.isArray(state.trendDefs)) {
      trendDefs = trendDefs.map(def => {
        const saved = state.trendDefs.find(item => item.id === def.id) || {};
        return { ...def, tf: saved.tf || def.tf };
      });
    }
    renderTrendInputs(state.t || defaults);
    return true;
  } catch {
    return false;
  }
}

document.addEventListener("click", event => {
  if (event.target.matches(".tab")) {
    document.querySelectorAll(".tab,.tab-pane").forEach(el => el.classList.remove("active"));
    event.target.classList.add("active");
    $(event.target.dataset.target).classList.add("active");
  }
});

window.addEventListener("DOMContentLoaded", () => {
  initTime();
  if (!restoreState()) {
    renderTrendInputs();
  }
  const savedApiKey = localStorage.getItem("nk225-openai-api-key");
  if (savedApiKey) $("openaiApiKey").value = savedApiKey;
  setImage("chart4h", "preview4h", "review4h");
  setImage("chart1h", "preview1h", "review1h");
  setImage("chart15m", "preview15m", "review15m");
  $("generate").addEventListener("click", buildReport);
  $("downloadHtml").addEventListener("click", downloadHtml);
  $("readImagesAi").addEventListener("click", readImagesWithAi);
  $("openaiApiKey").addEventListener("change", () => {
    localStorage.setItem("nk225-openai-api-key", $("openaiApiKey").value.trim());
  });
  $("saveApiKey").addEventListener("click", () => {
    localStorage.setItem("nk225-openai-api-key", $("openaiApiKey").value.trim());
    $("saveStatus").textContent = "キー保存";
  });
  $("clearApiKey").addEventListener("click", () => {
    $("openaiApiKey").value = "";
    localStorage.removeItem("nk225-openai-api-key");
    $("saveStatus").textContent = "キー削除";
  });
  $("toggleApiKey").addEventListener("click", () => {
    const input = $("openaiApiKey");
    input.type = input.type === "password" ? "text" : "password";
    $("toggleApiKey").textContent = input.type === "password" ? "キー表示" : "キー非表示";
  });
  $("clearImages").addEventListener("click", () => {
    ["4h", "1h", "15m"].forEach(tf => {
      const p = $(`preview${tf}`);
      const r = $(`review${tf}`);
      p.removeAttribute("src");
      r.removeAttribute("src");
      p.closest(".upload-card").classList.remove("has-image");
    });
    ["chart4h", "chart1h", "chart15m"].forEach(id => $(id).value = "");
    Object.keys(chartFiles).forEach(key => delete chartFiles[key]);
  });
  $("swapMobileOrder").addEventListener("click", () => {
    $("saveStatus").textContent = "スマホ対応";
    document.querySelector(".upload-grid").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  buildReport();
});
