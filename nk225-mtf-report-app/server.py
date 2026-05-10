from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, ProxyHandler, build_opener
from urllib.error import HTTPError, URLError
import json
import os


ROOT = Path(__file__).resolve().parent
VISION_MODEL = os.environ.get("OPENAI_VISION_MODEL", "gpt-4.1-mini")
ANALYSIS_MODEL = os.environ.get("OPENAI_ANALYSIS_MODEL", "gpt-5.5")
REASONING_EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "high")
OPENAI_OPENER = build_opener(ProxyHandler({}))


SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "instrument": {"type": "string"},
        "reportTime": {"type": "string"},
        "currentPrice": {"type": "string"},
        "ocrText": {"type": "string"},
        "trends": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "sw1": {"$ref": "#/$defs/trendRow"},
                "sw2": {"$ref": "#/$defs/trendRow"},
                "sw3": {"$ref": "#/$defs/trendRow"},
            },
            "required": ["sw1", "sw2", "sw3"],
        },
        "report": {"$ref": "#/$defs/reportBlock"},
    },
    "required": ["instrument", "reportTime", "currentPrice", "ocrText", "trends", "report"],
    "$defs": {
        "trendRow": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "timeframe": {"type": "string"},
                "trend": {"type": "string"},
                "wave": {"type": "string"},
                "conversion": {"type": "string"},
                "pullback": {"type": "string"},
                "rebound": {"type": "string"},
                "ma": {"type": "string"},
                "note": {"type": "string"},
            },
            "required": [
                "timeframe",
                "trend",
                "wave",
                "conversion",
                "pullback",
                "rebound",
                "ma",
                "note",
            ],
        },
        "tradeIdea": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "kind": {"type": "string", "enum": ["UP", "DOWN"]},
                "title": {"type": "string"},
                "trigger": {"type": "string"},
                "judgment": {"type": "string"},
                "targets": {"type": "string"},
                "invalidation": {"type": "string"},
            },
            "required": ["kind", "title", "trigger", "judgment", "targets", "invalidation"],
        },
        "reportBlock": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "h4Analysis": {"type": "array", "items": {"type": "string"}},
                "h1Analysis": {"type": "array", "items": {"type": "string"}},
                "m15Analysis": {"type": "array", "items": {"type": "string"}},
                "mtfComment": {"type": "string"},
                "tradeIdeas": {
                    "type": "array",
                    "minItems": 4,
                    "maxItems": 4,
                    "items": {"$ref": "#/$defs/tradeIdea"},
                },
                "currentAction": {"type": "array", "items": {"type": "string"}},
                "cautions": {"type": "array", "items": {"type": "string"}},
            },
            "required": [
                "h4Analysis",
                "h1Analysis",
                "m15Analysis",
                "mtfComment",
                "tradeIdeas",
                "currentAction",
                "cautions",
            ],
        },
    },
}

REPORT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "report": {"$ref": "#/$defs/reportBlock"},
    },
    "required": ["report"],
    "$defs": {
        "tradeIdea": SCHEMA["$defs"]["tradeIdea"],
        "reportBlock": SCHEMA["$defs"]["reportBlock"],
    },
}


PROMPT = """あなたはTradingViewスクリーンショット読取・MTFダウ理論レポート作成担当。
画像は長期 / 中期 / 短期の3チャート、または複数時間軸が1枚に並んだTradingViewスクリーンショットである。時間軸は固定ではない。
画像内のDow Theory IndicatorのTrend Table、現在値、主要価格ラベル、水平線、MA位置、注釈テキストを読み取り、レポート本文まで作る。

必ず守ること:
- instrumentには分析対象を入れる。画像ヘッダーの商品名・シンボルを最優先し、読めない場合はファイル名の先頭トークンを使う。例: NK2251!_2026... は "NK225先物"、USDJPY_... は "USDJPY"。
- 入力された分析対象と画像内の商品名が違う場合は、画像内の商品名またはファイル名から判断した値を優先する。
- 読めない項目は空文字ではなく "---" とする。
- Trend Tableは SW1=短期, SW2=中期, SW3=長期 の枠として返す。
- 各trendRowのtimeframeには、画像ヘッダーから読める実際の時間軸を入れる。例: "15m", "1H", "4H", "5m", "日足", "週足"。読めない場合は "短期" / "中期" / "長期" を入れる。
- trendは「上昇」「下降」「レス」のいずれか。
- waveは「上昇波動」「下落波動」「レンジ」のいずれか。
- conversion / pullback / rebound は矢印や●/×が読める場合は含める。
- 転換価格の矢印は「波動転換方向」を示す。トレンド転換ではない。
- 上昇トレンド・上昇波動で転換価格に↓がある場合、その価格を終値で下抜けると「上昇トレンド・下落波動」へ波動転換する。トレンドはまだ上昇のまま。
- 下降トレンド・下落波動で転換価格に↑がある場合、その価格を終値で上抜けると「下降トレンド・上昇波動」へ波動転換する。トレンドはまだ下降のまま。
- トレンド自体の維持/崩れは押し安値・戻り高値の有効性で判断する。
- 押し安値や戻り高値に●が付いている場合は、その価格がまだ終値ブレイクされておらず有効という意味。
- 押し安値や戻り高値に×または✕が付いている場合は、終値ブレイク済みで、その構造ラインは無効化されたという意味。
- 転換価格を「弱気」「強気」と表現しない。「波動転換価格」「終値で下抜けると下落波動へ転換」「終値で上抜けると上昇波動へ転換」と表現する。
- Trend Tableの5列「トレンド / 波動 / 転換価格 / 押安 / 戻高」は最優先で読む。画像左下の色付き表を拡大して読むつもりで処理する。
- 押安列の緑セルにある価格は必ず pullback に入れる。例: 62670●, 62020●, 58630●。
- 戻高列が "---" の場合のみ rebound を "---" にする。数字や×が見える場合は必ず入れる。
- Trend Tableに数字が見えるのに "---" を返してはいけない。
- 直近高値・直近安値は出力しない。
- currentPrice は画像ヘッダーまたは右端価格ラベルから読む。
- 複数画像で時刻や現値が違う場合は、ファイル名または画像上部の作成時刻が最も新しい画像を優先する。古い画像の現値を採用してはいけない。
- 入力テキストに「ファイル名」がある場合、YYYY-MM-DD_HH-MM-SS の時刻を読み、最も新しい時刻を reportTime と currentPrice の基準にする。
- 古い画像の価格と新しい画像の価格が矛盾する場合、古い画像の値は参考扱いにし、注意点に「画像間で時刻差がある」と書く。
- 重要価格帯セクションは作らない。価格コメントの羅列をしない。
- 価格はTrend Table、分析本文、トレードアイデア、無効化ラインの中で必要最小限に使う。
- ocrText には読み取った重要テキストを短くまとめる。
- reportには、長期/中期/短期分析、MTF整合性、トレードアイデア、現時点のアクション、注意点を書く。
- Discord版は作らない。
- 重要価格帯、結論、前回トレードアイデア検証、ポジション保有中の無効化ラインは作らない。
- 現在値より下にある転換価格を「回復ライン」と書かない。現在値より下なら「維持ライン」「終値割れ警戒ライン」「押し目候補」と書く。
- 上方向ターゲットは現在値より上の価格を優先する。現在値より下の価格を上方向ターゲットにしない。
- 下方向ターゲットは現在値より下の支持帯を優先する。
- 終値ベースの成立を優先する。髭は重要な未成立・だまし判断に必要な場合だけ触れ、毎回言及しない。
- 断定的な売買指示、「必ず上がる」「買うべき」「売るべき」「エントリー検討可能」「利確検討」「買い安心感」「期待が持てる」「強気材料」は書かない。
- 文体は常体。「です」「ます」は使わない。「注視する」「確認する」「見送り」「警戒する」「条件未達」「終値で成立」を使う。
- トレードアイデアは必ず4枚のシナリオカードにする。UP①ブレイク追随型、UP②押し目買い型、DOWN①戻り売り型、DOWN②押し安値割れ型。1枚だけにしてはいけない。
- SHORTの無効化ラインは「上値側の終値上抜け」または「戻り高値終値超え」とする。支持維持をSHORT無効化ラインにしてはいけない。
- LONGの無効化ラインは直近押し安値、転換価格、支持候補の終値割れとする。
- 前回検証は前回条件が画像内に明確に読めない場合、「前回条件の入力がないため未検証」とし、架空の前回レポートを作らない。

参考レポートの文体:
- 分析文は1セクション3段落前後。長く説明しない。
- 長期は「大局は上方向維持」「押し安値として大局の上昇構造は継続」「高値圏では利確・押し目調整にも注意」のように書く。
- 中期は「上昇再開は未確認」「回復できれば上方向が明確化」「割れで反発失敗を警戒」のように中期の確認ラインを書く。
- 短期は「短期は買い優位/戻り売り優位」「高値追いではなく押し目確認」「割れで短期失速」のように実行局面を書く。
- MTF整合性は「長期は上昇維持だが、中期・短期が下落波動」「MTFは上方向に改善」「完全な上方向一致ではない」など、時間軸のズレを簡潔にまとめる。
- 現時点のアクションは「新規LONGは〜確認を待つ」「SHORTは〜までは先回りしにくい」「〜割れなら短期調整を警戒」の形で書く。
- トレードアイデアは条件箇条書き中心。説明を盛らない。
- 「転換価格の矢印は〜」という解説を本文に書かない。転換価格は自然に「61,740円を終値で割れるまでは」「62,470円を終値で回復すれば」のように使う。
- 「波動転換価格」という用語も本文では多用しない。必要な場合のみ短く使う。
- 参考表現例:
  - 「長期は上昇トレンド・上昇波動を維持。」
  - 「ただし、最高値更新には至らず、上値抵抗帯を明確に突破できていない。」
  - 「現在は上昇後の調整局面と判断。」
  - 「ここを終値で回復できるまでは、戻り売り圧力が残る。」
  - 「回復できれば反発継続、割れなら短期失速を警戒。」
  - 「高値追いではなく、押し目確認を待つ。」
"""


REPORT_PROMPT = """あなたはMTFダウ理論レポート編集担当。
入力として、画像AIが読み取ったTrend Table、現値、読取メモ、そして元画像が渡される。
Trend Tableの数値は抽出済みデータを正とし、画像全体からローソク足の流れ、MA位置、水平線、注釈、直近の上げ下げを確認して、参考レポートの文体で report を作る。

出力ルール:
- 重要価格帯、結論、前回検証、ポジション無効化ライン、Discord版は作らない。
- 長期/中期/短期分析、MTF整合性、トレードアイデア、現時点のアクション、注意点のみ作る。
- reportBlockのh4Analysisは長期分析、h1Analysisは中期分析、m15Analysisは短期分析として使う。フィールド名に引っ張られて4H/1H/15m固定にしない。
- 転換価格の矢印説明を本文に書かない。
- 転換価格は自然な価格条件として使う。「61,740円を終値で割れるまでは」「62,470円を終値で回復できれば」のように書く。
- 「弱気」「強気」「買うべき」「売るべき」「エントリー検討可能」「利確検討」は使わない。
- Trend Tableの値を勝手に変えない。分析文だけを作る。
- 画像から見えるチャート形状、直近の上昇/下落、押し目・戻り、MA上/下、注釈テキストは分析に反映する。
- ただしTrend Tableのトレンド/波動/転換価格/押し安値/戻り高値は抽出済みデータを優先する。
- 分析文は各時間軸3段落前後。短く、参考レポートのように書く。
- トレードアイデアは4シナリオ固定: UP①ブレイク追随型、UP②押し目買い型、DOWN①戻り売り型、DOWN②押し安値割れ型。
- 文体は常体。「です」「ます」は使わない。
- 終値ベースの成立を優先する。髭は重要な未成立・だまし判断に必要な場合だけ触れ、毎回言及しない。
- 現在値より下の価格を上方向ターゲットにしない。
- 現在値より上の価格を下方向ターゲットにしない。
"""


def call_openai(api_key, content, schema, name, model, reasoning=False):
    request_body = {
        "model": model,
        "input": [{"role": "user", "content": content}],
        "text": {
            "format": {
                "type": "json_schema",
                "name": name,
                "strict": True,
                "schema": schema,
            }
        },
    }
    if reasoning:
        request_body["reasoning"] = {"effort": REASONING_EFFORT}
    req = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with OPENAI_OPENER.open(req, timeout=90) as res:
        raw = res.read().decode("utf-8", errors="replace")
        try:
            api_payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"OpenAI returned non-JSON response: {raw[:300]}") from exc

    output_text = api_payload.get("output_text")
    if not output_text:
        parts = []
        for output in api_payload.get("output", []):
            for item in output.get("content", []):
                if item.get("type") == "output_text":
                    parts.append(item.get("text", ""))
        output_text = "".join(parts)
    return json.loads(output_text)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/vision-read":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            api_key = body.get("apiKey") or os.environ.get("OPENAI_API_KEY")
            images = body.get("images") or []
            instrument = (body.get("instrument") or "分析対象").strip()
            file_instrument = (body.get("fileInstrument") or "").strip()
            if not api_key:
                self._json(400, {"error": "OpenAI APIキーが必要"})
                return
            if not images:
                self._json(400, {"error": "画像がない"})
                return

            content = [{"type": "input_text", "text": f"画面入力の分析対象: {instrument}\nファイル名からの推定: {file_instrument}\n\n{PROMPT}"}]
            for item in images[:3]:
                label = item.get("label", "chart")
                file_name = item.get("fileName", "")
                data_url = item.get("dataUrl")
                if data_url:
                    content.append({"type": "input_text", "text": f"画像: {label}\nファイル名: {file_name}"})
                    content.append({"type": "input_image", "image_url": data_url, "detail": "high"})

            data = call_openai(api_key, content, SCHEMA, "nk225_chart_reading", VISION_MODEL, reasoning=False)
            instrument = (data.get("instrument") or file_instrument or instrument).strip()
            refine_content = [
                {"type": "input_text", "text": f"分析対象: {instrument}\n\n{REPORT_PROMPT}"},
                {"type": "input_text", "text": json.dumps({
                    "instrument": instrument,
                    "reportTime": data.get("reportTime"),
                    "currentPrice": data.get("currentPrice"),
                    "ocrText": data.get("ocrText"),
                    "trends": data.get("trends"),
                }, ensure_ascii=False)},
            ]
            for item in images[:3]:
                label = item.get("label", "chart")
                file_name = item.get("fileName", "")
                data_url = item.get("dataUrl")
                if data_url:
                    refine_content.append({"type": "input_text", "text": f"分析用画像: {label}\nファイル名: {file_name}"})
                    refine_content.append({"type": "input_image", "image_url": data_url, "detail": "high"})
            refined = call_openai(api_key, refine_content, REPORT_SCHEMA, "nk225_report_refine", ANALYSIS_MODEL, reasoning=True)
            data["report"] = refined.get("report", data.get("report"))
            self._json(200, {"data": data})
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            self._json(exc.code, {"error": f"OpenAI API error ({exc.code}): {detail[:800]}"})
        except (URLError, TimeoutError) as exc:
            self._json(502, {"error": f"OpenAI接続エラー: {exc}"})
        except Exception as exc:
            self._json(500, {"error": str(exc)})

    def _json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving MTF Dow report app on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()
