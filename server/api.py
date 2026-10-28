#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
方块尖塔 (BlockSpire) 独立排行榜后端服务 (Python 版)
特性：
1. 纯 Python 3 原生标准库，零 pip 第三方依赖（支持自带 socket RESP，也自动兼容 redis 库）
2. 自动读取当前目录及上级目录的 .env / .env.deploy
3. 原生多线程 HTTP 服务 (ThreadingHTTPServer) + CORS 支持
4. 适合直接由 1Panel 进程守护 (Supervisor)、systemd 或 nohup 托管
"""

import os
import sys
import json
import time
import socket
import datetime
import unicodedata
import re
import threading
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# ────────────────── 1. 加载环境变量 ──────────────────
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

for search_dir in [PROJECT_ROOT, CURRENT_DIR]:
    for env_name in [".env", ".env.deploy"]:
        env_path = os.path.join(search_dir, env_name)
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            os.environ.setdefault(k.strip(), v.strip().strip("'\""))
            except Exception:
                pass

PORT = int(os.getenv("PORT", "3000"))
REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
REDIS_DB = int(os.getenv("REDIS_DB", "0"))

# ────────────────── 2. Redis 客户端 (原生 Socket RESP + redis 库双模驱动) ──────────────────
class NativeRESPClient:
    """零依赖原生 Redis RESP 协议客户端 (支持自动重连与连接复用)"""

    def __init__(self, host, port, password="", db=0):
        self.host = host
        self.port = port
        self.password = password
        self.db = db
        self.sock = None
        self.reader = None
        self.lock = threading.Lock()

    def _connect(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
        s = socket.create_connection((self.host, self.port), timeout=10)
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.sock = s
        self.reader = s.makefile("rb", buffering=65536)

        if self.password:
            self._send_raw([["AUTH", self.password]])
        if self.db:
            self._send_raw([["SELECT", str(self.db)]])

    def _send_raw(self, cmds):
        payload = bytearray()
        for cmd in cmds:
            payload.extend(f"*{len(cmd)}\r\n".encode("utf-8"))
            for arg in cmd:
                arg_bytes = str(arg).encode("utf-8")
                payload.extend(f"${len(arg_bytes)}\r\n".encode("utf-8"))
                payload.extend(arg_bytes)
                payload.extend(b"\r\n")

        self.sock.sendall(payload)
        results = []
        for _ in cmds:
            results.append(self._parse_resp())
        return results

    def _parse_resp(self):
        prefix = self.reader.read(1)
        if not prefix:
            raise ConnectionResetError("Redis 服务器主动关闭了连接")
        if prefix == b"+":
            line = self.reader.readline().rstrip(b"\r\n")
            return line.decode("utf-8", errors="replace")
        elif prefix == b"-":
            line = self.reader.readline().rstrip(b"\r\n")
            err_msg = line.decode("utf-8", errors="replace")
            raise RuntimeError(f"Redis Error: {err_msg}")
        elif prefix == b":":
            line = self.reader.readline().rstrip(b"\r\n")
            return int(line)
        elif prefix == b"$":
            line = self.reader.readline().rstrip(b"\r\n")
            length = int(line)
            if length == -1:
                return None
            data = self.reader.read(length)
            self.reader.read(2)  # skip \r\n
            return data.decode("utf-8", errors="replace")
        elif prefix == b"*":
            line = self.reader.readline().rstrip(b"\r\n")
            count = int(line)
            if count == -1:
                return None
            return [self._parse_resp() for _ in range(count)]
        else:
            raise ValueError(f"未知的 RESP 协议响应标识: {prefix}")

    def execute_pipeline(self, cmds):
        with self.lock:
            for attempt in range(2):
                try:
                    if self.sock is None:
                        self._connect()
                    return self._send_raw(cmds)
                except Exception as e:
                    if attempt == 0:
                        self._connect()
                    else:
                        raise e

def create_redis_executor():
    # 优先检测是否安装了 redis 库
    try:
        import redis
        client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD or None,
            db=REDIS_DB,
            decode_responses=True,
            socket_timeout=10,
        )
        # 测试连通
        client.ping()
        print(f"[Redis] 检测到 redis-py 库，已启用连接池驱动 ({REDIS_HOST}:{REDIS_PORT})")

        def redis_py_exec(cmds):
            pipe = client.pipeline()
            for c in cmds:
                op = str(c[0]).lower()
                args = c[1:]
                getattr(pipe, op)(*args)
            return pipe.execute()

        return redis_py_exec
    except Exception:
        pass

    # 无第三方库时，使用原生零依赖 Socket 客户端
    print(f"[Redis] 使用原生零依赖 Socket RESP 驱动 ({REDIS_HOST}:{REDIS_PORT})")
    client = NativeRESPClient(REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB)
    return client.execute_pipeline


# ────────────────── 3. 排行榜核心规则与计算 ──────────────────
COMMANDERS = ["steve", "alex", "villager", "witch"]
DAY_MS = 86_400_000
TZ_OFFSET_MS = 8 * 3_600_000
NAMES_KEY = "bs:names"
LIMIT = 50
DAILY_TRIES = 3
TTL = {"daily": 45 * 86400, "week": 120 * 86400, "all": 0}

INVISIBLE_RE = re.compile(
    r"[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]"
)
URL_RE = re.compile(r"https?:|www\.|\.(com|net|cn|org|io|xyz|top)\b", re.I)

def date_of(timestamp_ms: int) -> str:
    # 转换为东八区 YYYY-MM-DD
    dt = datetime.datetime.fromtimestamp(
        timestamp_ms / 1000,
        datetime.timezone(datetime.timedelta(hours=8))
    )
    return dt.strftime("%Y-%m-%d")

def week_of(date_str: str) -> str:
    d = datetime.date.fromisoformat(date_str)
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"

def daily_rule(date_str: str) -> dict:
    d = datetime.date.fromisoformat(date_str)
    epoch_day = (d - datetime.date(1970, 1, 1)).days
    commander = COMMANDERS[epoch_day % 4]
    omen = [3, 2, 4, 3][(epoch_day // 4) % 4]
    return {"commander": commander, "omen": omen}

# Keep these percentages aligned with src/data/difficulty.ts scoreMul.
SCORE_MULTIPLIERS = (100, 125, 150, 180, 220, 260)

def score_of(r: dict) -> int:
    base = (
        r["floor"] * 10
        + r["elites"] * 30
        + r["bosses"] * 120
        + r["gold"] * 60
        + r["red"] * 20
        + (500 if r["won"] else 0)
    )
    # Integer arithmetic matches JavaScript Math.round, including half-point ties.
    return (base * SCORE_MULTIPLIERS[r["omen"]] + 50) // 100

def is_int(v, lo: int, hi: int) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi

def check_run(v):
    if not isinstance(v, dict):
        return "缺少对局数据"
    cmd = v.get("commander")
    if not isinstance(cmd, str) or cmd not in COMMANDERS:
        return "统领无效"
    omen = v.get("omen")
    act = v.get("act")
    won = v.get("won")
    if not (is_int(omen, 0, 5) and is_int(act, 1, 7) and isinstance(won, bool)):
        return "对局数据无效"
    floor = v.get("floor")
    if not is_int(floor, (act - 1) * 14, act * 14):
        return "层数无效"
    bosses = v.get("bosses")
    if not is_int(bosses, act - 1, act) or (won and bosses < 3):
        return "首领数无效"
    elites = v.get("elites")
    crates = v.get("crates")
    if not (is_int(elites, 0, 8 * act) and is_int(crates, 0, 60 * act)):
        return "对局数据无效"
    gold = v.get("gold")
    red = v.get("red")
    if not (is_int(gold, 0, crates) and is_int(red, 0, crates) and gold + red <= crates):
        return "开箱数据无效"
    team = v.get("team")
    if not isinstance(team, list) or len(team) > 7:
        return "阵容无效"
    for c in team:
        if not (isinstance(c, list) and len(c) >= 2 and isinstance(c[0], str)):
            return "阵容无效"
        if not (re.match(r"^[a-z_]{2,32}$", c[0]) and is_int(c[1], 1, 3)):
            return "阵容无效"
    mins = v.get("mins")
    if mins is not None and not is_int(mins, 0, 1_000_000):
        return "用时无效"
    daily = v.get("daily")
    if daily is not None and not (isinstance(daily, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", daily)):
        return "日期无效"

    return {
        "commander": cmd,
        "omen": omen,
        "won": won,
        "act": act,
        "floor": floor,
        "elites": elites,
        "bosses": bosses,
        "gold": gold,
        "red": red,
        "crates": crates,
        "team": [[c[0], c[1]] for c in team],
        "mins": mins,
        "daily": daily,
    }

def clean_name(v):
    if not isinstance(v, str):
        return None
    n = unicodedata.normalize("NFKC", v)
    n = INVISIBLE_RE.sub("", n)
    n = re.sub(r"\s+", " ", n).strip()
    if not n or len(n) > 12:
        return None
    if URL_RE.search(n):
        return None
    return n

def valid_pid(v) -> bool:
    return isinstance(v, str) and bool(re.match(r"^[A-Za-z0-9_-]{16,64}$", v))

def board_key(board: str, date_str: str) -> str:
    if board == "all":
        return "bs:lb:all"
    if board == "week":
        return f"bs:lb:w:{week_of(date_str)}"
    return f"bs:lb:d:{date_str}"


# ────────────────── 4. 读写排行榜业务逻辑 ──────────────────
def read_board(redis_exec, board: str, date_str: str, pid: str = None) -> dict:
    key = board_key(board, date_str)
    res = redis_exec([
        ["ZREVRANGE", key, "0", str(LIMIT - 1), "WITHSCORES"],
        ["ZCARD", key],
        ["ZREVRANK", key, pid if pid else "-"],
        ["ZSCORE", key, pid if pid else "-"],
    ])

    top = res[0] or []
    total = int(res[1]) if res[1] is not None else 0
    my_rank = res[2]
    my_score = res[3]

    ids = []
    scores = []
    # top 格式可能为 ['id1', 'score1', 'id2', ...] (RESP) 或 [('id1', 100), ...] (redis-py)
    if top and isinstance(top[0], (list, tuple)):
        for item in top:
            ids.append(item[0])
            scores.append(float(item[1]))
    else:
        for i in range(0, len(top), 2):
            ids.append(top[i])
            scores.append(float(top[i + 1]))

    entries = []
    if ids:
        detail_res = redis_exec([
            ["HMGET", f"bs:e:{key}"] + ids,
            ["HMGET", NAMES_KEY] + ids,
        ])
        details = detail_res[0] or []
        names = detail_res[1] or []

        for i, uid in enumerate(ids):
            d = {}
            if i < len(details) and details[i]:
                try:
                    d = json.loads(details[i])
                except Exception:
                    d = {}
            name = names[i] if (i < len(names) and names[i]) else "无名统领"
            entry = {
                "rank": i + 1,
                "name": name,
                "avatar": d.get("avatar", ""),
                "score": int(scores[i]),
                "commander": d.get("commander", "steve"),
                "omen": d.get("omen", 0),
                "won": d.get("won", False),
                "act": d.get("act", 1),
                "floor": d.get("floor", 0),
                "team": d.get("team", []),
                "at": d.get("at", 0),
            }
            if uid == pid:
                entry["me"] = True
            entries.append(entry)

    me = None
    if pid and my_rank is not None:
        me = {
            "rank": int(my_rank) + 1,
            "score": int(float(my_score)) if my_score is not None else 0,
        }

    return {
        "board": board,
        "key": key.replace("bs:lb:", ""),
        "date": date_str,
        "week": week_of(date_str),
        "entries": entries,
        "total": total,
        "me": me,
    }

def submit_run(redis_exec, body: dict, ip: str, now_ms: int):
    pid = body.get("pid")
    if not valid_pid(pid):
        return {"error": "玩家标识无效"}, 400

    name = clean_name(body.get("name"))
    if not name:
        return {"error": "昵称需要 1–12 个字，且不能包含链接"}, 400

    run = check_run(body.get("run"))
    if isinstance(run, str):
        return {"error": run}, 400

    # 1. 频率限制 (每小时最多 40 次)
    rl_key = f"bs:rl:{ip}:{now_ms // 3_600_000}"
    rl_res = redis_exec([
        ["INCR", rl_key],
        ["EXPIRE", rl_key, "3700"],
    ])
    count = int(rl_res[0]) if rl_res[0] is not None else 0
    if count > 40:
        return {"error": "提交太频繁了，请稍后再试"}, 429

    today = date_of(now_ms)
    boards = ["week", "all"]

    # 2. 每日挑战校验
    if run.get("daily"):
        req_daily = run["daily"]
        yesterday = date_of(now_ms - DAY_MS)
        if req_daily != today and req_daily != yesterday:
            return {"error": "这一天的每日挑战已经结束"}, 400

        rule = daily_rule(req_daily)
        if rule["commander"] != run["commander"] or rule["omen"] != run["omen"]:
            return {"error": "与当天的每日挑战规则不符"}, 400

        tries_key = f"bs:dt:{req_daily}"
        tries_res = redis_exec([
            ["HINCRBY", tries_key, pid, "1"],
            ["EXPIRE", tries_key, str(3 * 86400)],
        ])
        tries_count = int(tries_res[0]) if tries_res[0] is not None else 0
        if tries_count > DAILY_TRIES:
            return {"error": f"今天的 {DAILY_TRIES} 次挑战机会已经用完"}, 400

        boards.insert(0, "daily")

    # 3. 计分与写入
    score = score_of(run)
    keys = [board_key(b, run.get("daily") if b == "daily" else today) for b in boards]

    zadd_cmds = [["ZADD", k, "GT", "CH", str(score), pid] for k in keys]
    zadd_cmds.append(["HSET", NAMES_KEY, pid, name])
    added_res = redis_exec(zadd_cmds)

    raw_avatar = body.get("avatar", "")
    avatar = str(raw_avatar)[:500] if raw_avatar else ""

    entry_data = json.dumps({
        "commander": run["commander"],
        "avatar": avatar,
        "omen": run["omen"],
        "won": run["won"],
        "act": run["act"],
        "floor": run["floor"],
        "team": run["team"][:7],
        "at": now_ms,
    }, ensure_ascii=False)

    post_cmds = []
    for i, k in enumerate(keys):
        # 如果新分数更新了最佳成绩
        if int(added_res[i] or 0) > 0:
            post_cmds.append(["HSET", f"bs:e:{k}", pid, entry_data])
        board_name = boards[i]
        if TTL.get(board_name):
            post_cmds.append(["EXPIRE", k, str(TTL[board_name])])
            post_cmds.append(["EXPIRE", f"bs:e:{k}", str(TTL[board_name])])

    # 查询当前玩家在各榜单的名次
    for k in keys:
        post_cmds.append(["ZREVRANK", k, pid])
        post_cmds.append(["ZCARD", k])
        post_cmds.append(["ZSCORE", k, pid])

    exec_res = redis_exec(post_cmds)
    rank_res = exec_res[len(post_cmds) - len(keys) * 3:]

    ranks = {}
    for i, b in enumerate(boards):
        r_rank = rank_res[i * 3]
        r_total = rank_res[i * 3 + 1]
        r_best = rank_res[i * 3 + 2]
        ranks[b] = {
            "rank": int(r_rank) + 1 if r_rank is not None else 1,
            "total": int(r_total) if r_total is not None else 1,
            "best": int(float(r_best)) if r_best is not None else score,
            "updated": int(added_res[i] or 0) > 0,
        }

    return {"ok": True, "score": score, "name": name, "ranks": ranks}, 200


# ────────────────── 5. HTTP 服务处理 Handler ──────────────────
class LeaderboardHTTPHandler(BaseHTTPRequestHandler):
    redis_exec = None

    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Player")

    def _send_json(self, data: dict, status_code: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self._send_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # 健康检查探针
        if path in ("/health", "/api/health"):
            return self._send_json({
                "status": "ok",
                "time": int(time.time() * 1000),
                "redis": f"{REDIS_HOST}:{REDIS_PORT}",
            })

        if path == "/api/telemetry":
            qs = parse_qs(parsed.query)
            limit = 100
            try:
                limit = int(qs.get("limit", ["100"])[0])
            except Exception:
                pass
            tele_file = os.path.join(PROJECT_ROOT, "runs-telemetry.json")
            runs = []
            if os.path.exists(tele_file):
                try:
                    with open(tele_file, "r", encoding="utf-8") as f:
                        runs = json.load(f)
                except Exception:
                    pass
            return self._send_json({"ok": True, "count": len(runs), "runs": runs[:limit]}, 200)

        if path != "/api/leaderboard":
            return self._send_json({"error": "Not Found"}, 404)

        now_ms = int(time.time() * 1000)
        qs = parse_qs(parsed.query)
        board = qs.get("board", ["week"])[0]
        if board not in ("daily", "week", "all"):
            return self._send_json({"error": "未知的榜单"}, 400)

        date_str = qs.get("date", [date_of(now_ms)])[0]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
            return self._send_json({"error": "日期无效"}, 400)

        pid = self.headers.get("X-Player")
        clean_pid = pid if valid_pid(pid) else None

        try:
            data = read_board(self.redis_exec, board, date_str, clean_pid)
            return self._send_json(data, 200)
        except Exception as e:
            print(f"[Error GET /api/leaderboard] {e}")
            return self._send_json({"error": "排行榜服务内部错误"}, 500)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/telemetry":
            try:
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length)
                body = json.loads(raw.decode("utf-8"))
            except Exception:
                return self._send_json({"error": "JSON 格式解析失败"}, 400)

            tele_file = os.path.join(PROJECT_ROOT, "runs-telemetry.json")
            runs = []
            if os.path.exists(tele_file):
                try:
                    with open(tele_file, "r", encoding="utf-8") as f:
                        runs = json.load(f)
                except Exception:
                    runs = []
            if not isinstance(runs, list):
                runs = []

            runs = [body] + [r for r in runs if r.get("date") != body.get("date")][:999]
            try:
                with open(tele_file, "w", encoding="utf-8") as f:
                    json.dump(runs, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"[Telemetry Write Error] {e}")

            try:
                self.redis_exec([
                    ["LPUSH", "bs:telemetry:runs", json.dumps(body, ensure_ascii=False)],
                    ["LTRIM", "bs:telemetry:runs", "0", "1999"],
                ])
            except Exception:
                pass

            return self._send_json({"ok": True, "received": True, "total": len(runs)}, 200)

        if parsed.path != "/api/leaderboard":
            return self._send_json({"error": "Not Found"}, 404)

        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0:
                return self._send_json({"error": "请求体为空"}, 400)
            raw = self.rfile.read(length)
            body = json.loads(raw.decode("utf-8"))
        except Exception:
            return self._send_json({"error": "JSON 格式解析失败"}, 400)

        # 解析客户端真实 IP
        forwarded = self.headers.get("X-Forwarded-For")
        real_ip = self.headers.get("X-Real-IP")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        elif real_ip:
            ip = real_ip.strip()
        else:
            ip = self.client_address[0]

        now_ms = int(time.time() * 1000)
        try:
            resp, status = submit_run(self.redis_exec, body, ip, now_ms)
            return self._send_json(resp, status)
        except Exception as e:
            print(f"[Error POST /api/leaderboard] {e}")
            return self._send_json({"error": "排行榜服务内部错误"}, 500)

    def log_message(self, format, *args):
        # 简化日志输出
        pass


# ────────────────── 6. 主启动入口 ──────────────────
def main():
    print("=" * 60)
    print(" [方块尖塔] 排行榜 API 服务正在启动 (Python 3)")
    print(f" 本地监听端口: {PORT}")
    print(f" 目标 Redis: {REDIS_HOST}:{REDIS_PORT} (DB: {REDIS_DB})")
    print("=" * 60)

    redis_exec = create_redis_executor()
    LeaderboardHTTPHandler.redis_exec = redis_exec

    server = ThreadingHTTPServer(("0.0.0.0", PORT), LeaderboardHTTPHandler)
    print(f"🎉 API 服务已就绪: http://127.0.0.1:{PORT}/api/leaderboard")
    print(f"探针检测地址: http://127.0.0.1:{PORT}/api/health")
    print("支持由 1Panel 进程守护 / Supervisor 直接接管。按 Ctrl+C 退出。\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n收到退出信号，服务正常停止。")
        server.server_close()


if __name__ == "__main__":
    main()

