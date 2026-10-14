#!/usr/bin/env bash
# ============================================================
# verify-project runner — 「do you eat」发布前检查（Day 25）
#
# 用法：  在仓库根目录执行  bash scripts/verify.sh
# 退出码：0 = 无 FAIL（可发布）；1 = 有 FAIL（阻断发布）
#
# 只做只读检查 + 一次 npm run build；不写库、不部署、不接 CI。
# 详细说明见 .workbuddy/skills/verify-project/SKILL.md
# ============================================================
set -uo pipefail

API_BASE="${API_BASE:-https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api}"
SITE="${SITE:-https://doyoueat-d5g36rg7ia785b553-1496350653.tcloudbaseapp.com}"
SKIP_BUILD="${SKIP_BUILD:-0}"
PROBE_UID="verify-project-$(date +%Y%m%d-%H%M%S)"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; NC=$'\033[0m'
PASS_N=0; FAIL_N=0; EXC_N=0; FAIL_LIST=""

group() { printf '\n%s\n' "── $1 ─────────────────────────────"; }
ok()  { PASS_N=$((PASS_N+1)); printf '  %bPASS%b  %s\n' "$GREEN" "$NC" "$1"; }
bad() { FAIL_N=$((FAIL_N+1)); FAIL_LIST="${FAIL_LIST}
    - $1"; printf '  %bFAIL%b  %s\n' "$RED" "$NC" "$1"; }
exc() { EXC_N=$((EXC_N+1)); printf '  %bEXCEPTION%b  %s\n' "$YELLOW" "$NC" "$1"; }
ev()  { printf '        %b证据: %s%b\n' "$DIM" "$1" "$NC"; }
snip() { printf '%.100s' "$1"; }

# curl 封装：$1=method $2=path $3=body(可选) → 输出 "BODY\nHTTP_CODE"
# 网络抖动免疫力（Day 26）：curl 失败（000/超时）时自动重试 1 次，两次都挂才算不可达。
# 背景：当晚网关实测约 1/6 请求会挂 20s+，单次请求会把好接口误判成「未实现」FAIL。
http() {
  local m="$1" p="$2" b="${3:-}" out code try
  for try in 1 2; do
    if [ -n "$b" ]; then
      out=$(curl -s -m 15 -w $'\n%{http_code}' -X "$m" \
        -H "X-User-Id: $PROBE_UID" -H 'Content-Type: application/json' \
        --data-binary "$b" "$API_BASE$p" 2>/dev/null) || out=$'\n000'
    elif [ "$m" = "GET" ]; then
      out=$(curl -s -m 15 -w $'\n%{http_code}' -H "X-User-Id: $PROBE_UID" "$API_BASE$p" 2>/dev/null) || out=$'\n000'
    else
      out=$(curl -s -m 15 -w $'\n%{http_code}' -X "$m" -H "X-User-Id: $PROBE_UID" "$API_BASE$p" 2>/dev/null) || out=$'\n000'
    fi
    code=$(printf '%s' "$out" | tail -n1)
    if [ "$code" != "000" ]; then break; fi
    if [ "$try" = "1" ]; then printf '        （请求未响应，重试 1 次……）\n' >&2; fi
  done
  printf '%s' "$out"
}
code_of() { printf '%s' "$1" | tail -n1; }
body_of() { printf '%s' "$1" | sed '$d'; }

printf 'verify-project  ·  do you eat 发布前检查\n'
printf 'API : %s\nSITE: %s\n' "$API_BASE" "$SITE"

# ── A 安全 ────────────────────────────────────────────────
group "A 安全（密钥 / 环境变量 / 凭据）"

A1_PATHS="src functions db index.html package.json cloudbaserc.json vite.config.ts tsconfig.json"
secret=$(git grep -InE 'sk-[A-Za-z0-9]{20,}|AKID[A-Za-z0-9]{16,}|Bearer [A-Za-z0-9_-]{16,}|postgres(ql)?://' -- $A1_PATHS 2>/dev/null || true)
if [ -z "$secret" ]; then
  ok "A1 全仓库无硬编码密钥"; ev "git grep 命中 0 条"
else
  bad "A1 发现疑似硬编码密钥"; ev "$(printf '%s' "$secret" | head -3 | tr '\n' '|')"
fi

env_use=$(git grep -l 'process.env.CLOUDBASE_API_KEY' -- functions 2>/dev/null | wc -l | tr -d ' ')
lit=$(git grep -InE "CLOUDBASE_API_KEY['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_-]{16,}" -- functions src db 2>/dev/null || true)
if [ -z "$lit" ] && [ "${env_use:-0}" -ge 1 ]; then
  ok "A2 API Key 只走环境变量"; ev "$env_use 个云函数经 process.env 读取；无字面量"
else
  bad "A2 API Key 写法异常"; ev "env_use=$env_use literal=$(printf '%s' "$lit" | tr '\n' '|')"
fi

ig=$(git check-ignore -v .env 2>/dev/null || true)
tracked_env=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '\.env\.example$' || true)
if [ -n "$ig" ] && [ -z "$tracked_env" ]; then
  ok "A3 .env 被忽略且未跟踪"; ev "$ig"
else
  bad "A3 .env 处理异常"; ev "ignore=[$ig] tracked=[$(printf '%s' "$tracked_env" | tr '\n' ' ')]"
fi

cred=$(git ls-files | grep -E '(^|/)\.tcb-home/|(^|/)\.workbuddy/(memory|agents)/' || true)
if [ -z "$cred" ]; then
  ok "A4 凭据 / 记忆目录未入库"; ev "无 .tcb-home / .workbuddy(memory|agents) 被跟踪"
else
  bad "A4 凭据 / 记忆目录被跟踪"; ev "$(printf '%s' "$cred" | tr '\n' ' ')"
fi

# ── B 构建与部署 ──────────────────────────────────────────
group "B 构建与部署"

if [ "$SKIP_BUILD" = "1" ]; then
  exc "B1 前端构建（SKIP_BUILD=1，本次跳过）"
else
  build_log=$(npm run build 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then
    ok "B1 npm run build 通过"; ev "$(printf '%s' "$build_log" | grep -E 'built in|modules transformed' | tail -1)"
  else
    bad "B1 构建失败（退出码 $rc）"; ev "$(printf '%s' "$build_log" | tail -6 | tr '\n' ' ')"
  fi
fi

local_name=$(basename "$(ls dist/assets/index-*.js 2>/dev/null | head -1)" 2>/dev/null || true)
html=$(curl -s -m 15 "$SITE/" 2>/dev/null || true)
online_name=$(printf '%s' "$html" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 | sed 's#assets/##')
# 注意：本沙箱 curl -o /dev/null 会以 exit 23 失败（而 -w 仍会打印状态码，与 `|| echo`
# 叠加就变成 "200000" 假值）。故此处不落盘，改为直接量取 body 字节数来判断可访问性。
if [ -n "$online_name" ]; then
  asset_bytes=$(curl -s -m 15 "$SITE/assets/$online_name" 2>/dev/null | wc -c | tr -d ' ')
  if [ "${asset_bytes:-0}" -gt 1000 ]; then
    ok "B2a 线上静态托管可访问（首页含主 JS，且主 JS 可下载）"; ev "线上主 JS $online_name → ${asset_bytes} 字节"
  else
    bad "B2a 线上主 JS 异常"; ev "线上 $online_name → ${asset_bytes} 字节（过小或取不到）"
  fi
else
  bad "B2a 线上首页取不到主 JS"; ev "curl $SITE/ 无有效响应"
fi

if [ -z "$local_name" ]; then
  exc "B2b 本地没有 dist（本次未构建），跳过本地/线上比对"
elif [ "$local_name" = "$online_name" ]; then
  ok "B2b 本地构建产物与线上一致"; ev "本地=$local_name 线上=$online_name"
else
  exc "B2b 本地 dist（$local_name）≠ 线上（$online_name）—— 多半是「构建了还没部署」或 CDN 缓存"
fi

# ── C 公网接口连通 ────────────────────────────────────────
group "C 公网接口连通"

r=$(http GET /health); c=$(code_of "$r"); b=$(body_of "$r")
if [ "$c" = "200" ] && printf '%s' "$b" | grep -q '"ok"'; then
  ok "C1 GET /api/health 200"; ev "HTTP $c  $(snip "$b")"
else
  bad "C1 GET /api/health 异常"; ev "HTTP $c  $(snip "$b")"
fi

r=$(http GET /foods); c=$(code_of "$r"); FOODS_BODY=$(body_of "$r")
n=$(printf '%s' "$FOODS_BODY" | grep -o '"id"' | wc -l | tr -d ' ')
if [ "$c" = "200" ] && [ "$n" -ge 1 ]; then
  ok "C2 GET /api/foods 200（$n 条）"; ev "HTTP $c, $n 条"
else
  bad "C2 GET /api/foods 异常"; ev "HTTP $c, n=$n, $(snip "$FOODS_BODY")"
fi

r=$(http GET /favorites); c=$(code_of "$r"); FAV_BODY=$(body_of "$r")
if [ "$c" = "200" ] && printf '%s' "$FAV_BODY" | grep -q '^\['; then
  ok "C3 GET /api/favorites 200"; ev "HTTP $c  $(snip "$FAV_BODY")"
else
  bad "C3 GET /api/favorites 异常"; ev "HTTP $c  $(snip "$FAV_BODY")"
fi

r=$(http GET /ratings); c=$(code_of "$r"); RAT_BODY=$(body_of "$r")
if [ "$c" = "200" ] && printf '%s' "$RAT_BODY" | grep -q '^\['; then
  ok "C4 GET /api/ratings 200"; ev "HTTP $c  $(snip "$RAT_BODY")"
else
  bad "C4 GET /api/ratings 异常"; ev "HTTP $c  $(snip "$RAT_BODY")"
fi

# ── D 契约与实现一致 ──────────────────────────────────────
group "D 契约与实现一致（防虚报）"

# 契约总表（api-contract.md 第五节）状态列取值：
#   #1 #3 #4 #5 #6 #7 → ✅ 已实现（标了 Day）
#   #2 #8 → 空白（Day 18 已上线但文档漏补 ✅，Day 21 待办）→ 记 EXCEPTION
#   #9 #10 #11 #12 → 空白（确未实现；#9 为已知 Bug、#10 被前缀路由吃掉）
contract_status() { case "$1" in 1|3|4|5|6|7) echo impl ;; *) echo none ;; esac; }
probe_ep() { # num method path body
  local num="$1" m="$2" p="$3" b="${4:-}" r c bod actual marked
  r=$(http "$m" "$p" "$b"); c=$(code_of "$r"); bod=$(body_of "$r")
  if [ "$num" = "10" ] && printf '%s' "$bod" | grep -q '"ok"' && ! printf '%s' "$bod" | grep -qE 'heightCm|^null'; then
    exc "D1 #10 GET /health/profile 被 /api/health 前缀路由吃掉（HTTP $c）—— 已知 #10，登记在册"; return
  fi
  case "$c" in
    405) actual=none ;;
    200|201|204|400|409) actual=impl ;;
    404) if printf '%s' "$bod" | grep -q 'NOT_FOUND'; then actual=impl; else actual=none; fi ;;
    *) actual=none ;;
  esac
  marked=$(contract_status "$num")
  if [ "$actual" = "$marked" ]; then
    ok "D1 #$num $m $p → HTTP $c（$actual）＝总表 $marked"
  elif [ "$marked" = "impl" ] && [ "$actual" = "none" ]; then
    # 总表标 ✅、实测却没实现 —— 这才是「虚报」，最危险，必须阻断发布
    bad "D1 #$num $m $p → 总表标 ✅ 但实测未实现（HTTP $c）—— 虚报，阻断发布"; ev "$(snip "$bod")"
  else
    # 总表未标、实测却已实现 —— 文档滞后（欠账），登记 EXCEPTION，不阻断发布
    exc "D1 #$num $m $p → 实测已实现（HTTP $c）但总表未标 ✅ —— 契约待补（Day 21 待办）"
  fi
}
probe_ep 1  GET    /foods
probe_ep 2  POST   /foods '{}'
probe_ep 3  DELETE /foods/__verify_probe__
probe_ep 4  GET    /ratings
probe_ep 5  PUT    /ratings/__verify_probe__ '{"score":4}'
probe_ep 6  DELETE /ratings/__verify_probe__
probe_ep 7  GET    /favorites
probe_ep 8  POST   /favorites/__verify_probe__
probe_ep 9  DELETE /favorites/__verify_probe__
probe_ep 10 GET    /health/profile
probe_ep 11 PUT    /health/profile '{"heightCm":10}'
probe_ep 12 DELETE /health/profile

if printf '%s' "$FOODS_BODY$FAV_BODY$RAT_BODY" | grep -q 'CLOUDBASE_API_KEY'; then
  bad "D2 DB 接口报了「CLOUDBASE_API_KEY 未配置」"; ev "检查 C2/C3/C4 响应体"
else
  ok "D2 DB 型接口未报 API Key 未配置"; ev "C2/C3/C4 响应体不含该报错"
fi

# ── E 架构纪律 ────────────────────────────────────────────
group "E 架构纪律"

h=$(git grep -InE 'localStorage\.(get|set|remove)Item' -- src/pages src/components 2>/dev/null || true)
if [ -z "$h" ]; then
  ok "E1 页面 / 组件不直接读写存储"; ev "0 条（评分读写唯一出口 src/services/storage.ts）"
else
  bad "E1 组件层出现直接存储读写"; ev "$(printf '%s' "$h" | tr '\n' ' ')"
fi

h=$(find src -type f | LC_ALL=C grep '[^ -~]' || true)
if [ -z "$h" ]; then
  ok "E2 文件名无中文 / 非 ASCII"; ev "find src 命中 0 条"
else
  bad "E2 发现非 ASCII 文件名"; ev "$(printf '%s' "$h" | tr '\n' ' ')"
fi

missing=""
for f in src/pages/*.tsx; do
  grep -qE 'export function [A-Za-z0-9]+Page\(' "$f" || missing="$missing $(basename "$f")"
done
xss=$(git grep -InE 'dangerouslySetInnerHTML|\.innerHTML|eval\(' -- src 2>/dev/null || true)
if [ -z "$missing" ] && [ -z "$xss" ]; then
  ok "E3 page 统一命名导出 + 无 XSS 高危写法"; ev "src/pages 全部 export function XxxPage；XSS 命中 0 条"
else
  bad "E3 page 导出 / XSS 检查"; ev "missing=[$missing] xss=[$(printf '%s' "$xss" | tr '\n' ' ')]"
fi

# ── 汇总 ──────────────────────────────────────────────────
printf '\n════════════════════════════════════════════\n'
printf '结果：PASS %d / FAIL %d / EXCEPTION %d\n' "$PASS_N" "$FAIL_N" "$EXC_N"
if [ "$FAIL_N" -gt 0 ]; then
  printf '%b阻断发布%b —— 以下 FAIL 必须先修：%b\n' "$RED" "$NC" "$FAIL_LIST"
  exit 1
fi
printf '%b无 FAIL，可以发布%b\n' "$GREEN" "$NC"
exit 0
