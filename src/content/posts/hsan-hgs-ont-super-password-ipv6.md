***

title: "天邑 TEWA-7500V 光猫：超密获取与 IPv6 防火墙放开"
published: 2026-08-30
description: "天邑 TEWA-7500V 移动光猫（海思 hsan + HGS 新固件）：challenge-response 登录、隐藏 TELNET 页、setObjs 开 telnet、读 lastgood.xml 拿超密、hbus 放开 IPv6 入站完整教程。"
tags: \[光猫, 网络, IPv6, 逆向, 家庭网络]
category: 网络
lang: "zh"
----------

> 2026-08-30 实测通过。仅供个人家庭网络调优使用，请勿用于违法违规用途；获取 root 级权限有风险，操作前请自行评估（可能被运营商限速/封停，后果自负）。

***

# 第一部分：可复现教程

## 0. 判断你的光猫是不是同款

本教程适用**海思 hsan 平台 + HGS 新版 Web 固件**的移动光猫。验证特征：

| 检查项           | 命令/方法                                           | 本机实测                                     | <br />                         |
| ------------- | ----------------------------------------------- | ---------------------------------------- | ------------------------------ |
| Web 主页        | \`curl -s <http://192.168.1.1/>                 | wc -c\`                                  | \~266KB 大单页（easyui SPA，全部页面内嵌） |
| 配置字典          | \`curl -s <http://192.168.1.1/json/config.json> | wc -c\`                                  | 存在，\~128KB                     |
| 老固件后门         | `getpage.gch` / `cgi-bin/telnetenable.cgi`      | 均 404（新固件已封，网上老教程不适用）                    | <br />                         |
| telnet banner | 开启后 telnet 192.168.1.1                          | `hsan login:`（海思标志，无 `load_cli factory`） | <br />                         |

适用设备：**天邑 TEWA-7500V**（10G XG-PON ONT，海思 hsan 平台），同系列 TEWA-700/7500 其他海思方案机型可对照尝试（博通版走 `load_cli factory` 路线，本教程不适用）。

前置条件：

* 光猫背面标签上的**普通账号密码**（格式一般为 `user / <随机8位字母数字混合>`）

* 局域网内一台能访问 `192.168.1.1` 的 Linux 机器 + python3（无 host 解释器可用 `docker exec <容器> python3` 跑）

* 光猫 HTTP 服务很脆（见注意事项），所有脚本必须带重试

## 1. 普通账号登录（挑战-应答）

光猫登录是 challenge-response：先取 challenge，再回传 `md5(challenge:密码)`。**不需要 Cookie**，服务端按源 IP 识别会话。

```python
import urllib.request, urllib.parse, hashlib, json

BASE = "http://192.168.1.1"
USER = "user"
PWD  = "光猫背面标签上的普通用户密码"

op = urllib.request.build_opener()
op.addheaders = [("User-Agent", "Mozilla/5.0"), ("Referer", BASE + "/")]

d = json.loads(op.open(BASE + "/getChallengeStr", timeout=10).read().decode())
# 返回: {"challenge": "...", "session": "..."}
resp = hashlib.md5((d["challenge"] + ":" + PWD).encode()).hexdigest()
url = (BASE + "/lgDevice?userName=" + urllib.parse.quote(USER)
       + "&responseChallenge=" + resp
       + "&session=" + urllib.parse.quote(str(d.get("session", ""))))
r = json.loads(op.open(url, timeout=10).read().decode())
# r["errorCode"] == 0 即登录成功
```

坑：响应是 **tab 分隔的 pretty JSON**（`"errorCode":\t0`），不要用 `'errorCode": 0'` 这种字符串匹配，必须 `json.loads`。

## 2. 找到被隐藏的 TELNET 页

新版固件的 TELNET 开关页就在主页里，只是被前端 CSS 类隐藏了：

```bash
curl -s http://192.168.1.1/ -o index.html
grep -o 'FEATURE_TELNET[^>]*' index.html
grep -o 'hgs_key="Telnet[A-Za-z]*"' index.html
# 可见: TelnetEnable / TelnetWANEnable / TelnetUserName / TelnetPassword
```

再拉配置字典确认对象名和读写方式：

```bash
curl -s http://192.168.1.1/json/config.json -o config.json
grep -A 20 'HGS_TELNET_CFG' config.json
```

关键信息（`/json/config.json` + `/json/tableCfg.json` 是全部对象/路径的权威字典）：

* 对象：`HGS_TELNET_CFG`，读写在 `InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage.` 节点

* `customerCheckout` msgType=220（POST `/getObjs`），`customerCheckin` msgType=221（POST `/setObjs`）

## 3. 调 API 开启 telnet

先读当前状态（端点在 **80 端口**，不是 8080）：

```python
full = "InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage."
body = [{"fullPath": full}]
POST("http://192.168.1.1/getObjs?waitTimeoutMs=5000", body)
```

典型返回（出厂值）：

```json
[{"fullPath": "InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage.",
  "TelnetEnable": "0", "TelnetWANEnable": "0",
  "TelnetUserName": "CMCCAdmin", "TelnetPassword": "aDm8H%MdA",
  "TelnetPort": "23", "SSHEnable": "0", ...}]
```

写入开启 telnet（**所有值都是字符串**；建议顺手改成自己的账号密码）：

```python
body = [{"fullPath": full,
         "TelnetEnable": "1",
         "TelnetWANEnable": "0",
         "TelnetUserName": "你自己的telnet用户名",
         "TelnetPassword": "你自己的强密码"}]
POST("http://192.168.1.1/setObjs?waitTimeoutMs=5000", body)
# 返回 [0] 即成功, telnetd 立即启动
```

> 通用教程里的 `cgi-bin/telnetenable.cgi?telnetenable=1&key=MAC` 在新固件上不存在（404）。`Fh@MAC后6位` 这类默认 telnet 密码属于老/其他固件，新固件密码自己定。

验证：`nc -zv 192.168.1.1 23`，然后 telnet 登录。

## 4. telnet 登录，读配置文件拿超密

```bash
telnet 192.168.1.1
# login: <你上面设的telnet账号>   Password: <你上面设的telnet密码>
```

进去后是海思 hsan 的 busybox ash（提示符 `/ $`）。**没有** `load_cli factory`、`cfg_cmd`、`qoecmd`、`cli`，`su` 需要的密码也不是博通版算法能算的——都不用管，直接读配置文件：

```bash
cat /config/work/lastgood.xml
```

这是运行配置的**明文 XML**（约 166KB）。注意 busybox 的 grep 不支持 `\{0,400\}` 区间正则，最稳的做法是把整个文件 cat 到终端日志里拷回本地再 grep：

```bash
grep -n 'SYSMNG_ACCOUNT_ATTR_TAB' -A 10 lastgood.log
```

命中账号表：

```xml
<Dir Name="SYSMNG_ACCOUNT_ATTR_TAB">
  <Value Name="ucTeleAccountEnable" Value="1"/>
  <Value Name="aucTeleAccountName" Value="CMCCAdmin"/>
  <Value Name="aucTeleAccountPassword" Value="超级密码就在这里"/>   ← 超级密码
  <Value Name="aucUserAccountName" Value="user"/>
  <Value Name="aucUserAccountPassword" Value="与光猫标签一致的普通密码"/>   ← 可验证没读错文件
</Dir>
```

> 超密可能被 TR069 随机化过（默认密码 `aDm8H%MdA` 等都登不上就是这种情况），所以必须读文件拿真值，而不是猜默认密码。

## 5. 用超密登录 Web 后台

用第 1 步同样的 challenge-response 登录，userName 换成 `CMCCAdmin`、密码换成读到的超密即可。登录后浏览器打开 `http://192.168.1.1` 可看到全部隐藏功能（安全、telnet、广域网等）。

## 6. 读改安全配置（放开 IPv6 入站）

安全配置在 `hbus://mdm/InternetGatewayDevice.X_CMCC_Security.` 节点，走 hbus 协议（**path 原样拼 URL，不要 urlencode**）：

```python
HBUS = "hbus://mdm/InternetGatewayDevice.X_CMCC_Security."

# 读 (msgType=211)
GET(f"http://192.168.1.1/getHbusData?path={HBUS}&msgType=211")

# 写 (msgType=212, method=set, body 带 path+para)
body = {"path": HBUS, "para": {"FirewallLevel": "0"}}
POST(f"http://192.168.1.1/setHbusData?path={HBUS}&method=set&msgType=212", body)
```

读到的全部字段与参考值：

| 字段                                       | 含义                     | 出厂值  | 推荐值                    |
| ---------------------------------------- | ---------------------- | ---- | ---------------------- |
| FirewallEnable                           | 防火墙总开关                 | 1    | 1（保留）                  |
| FirewallLevel                            | 防火墙等级 0低/1中/2高         | 1(中) | **0(低)**（放开 IPv4 入站过滤） |
| DoSEnable                                | 防 DoS 攻击               | 1    | 1（保留）                  |
| PortScanEnable                           | 防端口扫描                  | 0    | 0                      |
| **IPv6SessionSecurityEnable**            | **IPv6 会话安全（v6 入站过滤）** | 0    | 0（本来就是关的，别动）           |
| IPFilterIn/OutEnable、UrlFilter、MacFilter | 各类过滤                   | 0    | 0                      |
| LockNetEnable                            | 锁网                     | 0    | 0                      |

改完回读确认 `FirewallLevel` 变成 `"0"`，然后从外网（手机关 WiFi 用流量）测试入站。

***

# 第二部分：注意事项与经验总结

## 稳定性坑（脚本必须处理）

1. **光猫 HTTP 极脆**：大文件、连续请求经常 `ConnectionReset`，甚至连续十几次失败。所有请求必须带重试（实测 15 次 × 2s 间隔才稳）。单个 `curl -s` 看天意。
2. **响应格式**：JSON 是 tab 分隔 pretty-print，判断成败用 `json.loads`，别字符串匹配。
3. **没有 Cookie/Token**：登录态绑源 IP。同一脚本内一口气完成「登录→动作」，别中途换出口 IP（Docker 容器、host、手机热点的出口 IP 都不同）。
4. **登录限速**：密码错 3 次/分钟 → 锁 60s（`lgErrCnt` 计数）。`/lgDevice?task=logout` 会被当成登录尝试烧掉额度，**别用它**。脚本里的重试等待用 65s。
5. **旧会话顶住**：有别的设备已登录 Web 时 `getChallengeStr` 返回 errorCode 1（"其他设备已登录"）。操作时让家里人别开着光猫后台。
6. **连接竞争**：telnet 和 Web 会话基本互不影响，但连续开关 telnet 后建议等几秒再连 23 端口。

## 方法论坑

1. **先判定固件再抄教程**：网上流传的 `telnetenable.cgi`、`load_cli factory`、`Fh@MAC后6位`、天邑博通版 SU 密码生成算法，在 海思 hsan + HGS 新固件 上**全部无效**。本教程的路线（隐藏页面→setObjs→读 lastgood.xml）才是新版通用解。
2. **busybox 工具是残血版**：grep 不支持区间正则；`2>/dev/null` 重定向在受限 shell 下会报 `can't create /dev/null: Permission denied`（命令本身能跑）。别依赖 shell 惯用技巧，直接 cat 回本地分析。
3. **`/json/config.json`** **是万能钥匙**：拿到它就知道每个功能对应哪个对象、哪个 hbus 路径、msgType 是多少，Web UI 能做的都能 API 化。
4. **读文件优先于猜密码**：默认超密（`aDm8H%MdA` 等）被 TR069 随机化是常态，配置文件里才是真值。

## 安全与善后

1. **telnet 是双刃剑**：`telnetd -b 192.168.1.1 -p 23` 只绑 LAN，但明文协议 + 弱口令依然是风险。用完建议用 setObjs 把 `TelnetEnable` 写回 `"0"`。
2. **WebUI 别裸奔公网**：入站放开后，你的下一跳路由/宿主机上的 DNAT6 可能把 Web 管理端口也暴露出去（`ip6tables -t nat -S` 检查）。只留实际需要的端口，多余的 DNAT 手动删掉或加 ip6tables 规则屏蔽。
3. **TR069/RMS 会回滚配置**：运营商可远程下发配置。如果过几天发现防火墙等级变回"中"、telnet 自己关了，就是被 RMS 覆盖——重跑一遍脚本即可，别惊讶。
4. **防火墙等级的代价**：调"低"降低的是整机的 IPv4 防护（NAT 仍兜底）。DoS 防护建议保留。改完顺手检查自家其他暴露服务（Alist、PhotoPrism 等）是否也要收紧。
5. **光猫侧放开 ≠ 入站就通**：实测 UI 注释写着防火墙等级只管 IPv4，而 IPv6 会话安全本来就是关的——光猫可能根本不是拦截者。若外网测试仍不通，按顺序查：下级路由器的「IPv6 防火墙」开关 → 移动上游 ACL（换端口交叉验证）。
6. **善后清单**：改了什么记下来（本次典型：FirewallLevel 1→0、TelnetEnable 1、telnet 账号自设）。所有 Web 后台改动通过 hbus API 完成的都可用同样方式改回。

