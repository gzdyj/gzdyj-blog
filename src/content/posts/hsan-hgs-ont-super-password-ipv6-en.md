---
title: "Tianyi TEWA-7500V ONT: Super Password & IPv6 Firewall"
published: 2026-08-30
description: "China Mobile Tianyi TEWA-7500V (HiSilicon hsan + HGS new firmware): challenge-response login, hidden TELNET page, setObjs for telnet, read lastgood.xml for super password, hbus API to loosen IPv6 ingress — full reproducible guide."
tags: [ONT, Networking, IPv6, Reverse Engineering, Home Lab]
category: Networking
lang: "en"
---

> Tested & verified on 2026-08-30. For personal home-network tuning only. Do not use for illegal purposes; obtaining root-level access carries risks — evaluate on your own (ISP may throttle or suspend your line, you've been warned).

---

# Part 1: Reproducible Walkthrough

## 0. Confirm You Have the Same Firmware

This guide targets **China Mobile ONTs running the HiSilicon hsan platform + HGS new Web firmware**. Quick verification:

| Check | Command / Method | Typical Result |
|---|---|---|
| Web homepage size | `curl -s http://192.168.1.1/ | wc -c` | ~266KB single page (easyui SPA, everything embedded) |
| Config dict exists | `curl -s http://192.168.1.1/json/config.json | wc -c` | Present, ~128KB |
| Old firmware backdoors | `getpage.gch` / `cgi-bin/telnetenable.cgi` | All 404 (old guides on the web do NOT apply) |
| telnet banner | `telnet 192.168.1.1` after enabling | `hsan login:` (HiSilicon banner, **no** `load_cli factory`) |

Applicable devices: **Tianyi TEWA-7500V** (10G XG-PON ONT, HiSilicon hsan platform). Other TEWA-700 / 7500 series HiSilicon ONTs from China Mobile can likely follow the same path (Broadcom variants use `load_cli factory` — not covered here).

Prerequisites:
- **Normal user credentials** printed on the ONT label (usually `user / <8-char alphanumeric>`)
- A Linux box on the same LAN that can reach `192.168.1.1`, with Python 3 (use `docker exec <container> python3` if no host interpreter)
- The ONT HTTP stack is very brittle (see caveats below) — **every request must be wrapped in retries**

## 1. Normal-User Login (Challenge-Response)

Login uses challenge-response: fetch a challenge first, then reply with `md5(challenge:password)`. **No cookies required** — the server tracks sessions by source IP.

```python
import urllib.request, urllib.parse, hashlib, json

BASE = "http://192.168.1.1"
USER = "user"
PWD  = "the normal-user password on your ONT label"

op = urllib.request.build_opener()
op.addheaders = [("User-Agent", "Mozilla/5.0"), ("Referer", BASE + "/")]

d = json.loads(op.open(BASE + "/getChallengeStr", timeout=10).read().decode())
# returns: {"challenge": "...", "session": "..."}
resp = hashlib.md5((d["challenge"] + ":" + PWD).encode()).hexdigest()
url = (BASE + "/lgDevice?userName=" + urllib.parse.quote(USER)
       + "&responseChallenge=" + resp
       + "&session=" + urllib.parse.quote(str(d.get("session", ""))))
r = json.loads(op.open(url, timeout=10).read().decode())
# r["errorCode"] == 0 means login OK
```

Gotcha: the response is **tab-indented pretty JSON** (`"errorCode":\t0`). Never string-match `'errorCode": 0'` — always use `json.loads`.

## 2. Find the Hidden TELNET Page

The TELNET toggle is actually present in the main page HTML, just hidden by a CSS class:

```bash
curl -s http://192.168.1.1/ -o index.html
grep -o 'FEATURE_TELNET[^>]*' index.html
grep -o 'hgs_key="Telnet[A-Za-z]*"' index.html
# You'll see: TelnetEnable / TelnetWANEnable / TelnetUserName / TelnetPassword
```

Pull the config dictionary to confirm the object name and R/W paths:

```bash
curl -s http://192.168.1.1/json/config.json -o config.json
grep -A 20 'HGS_TELNET_CFG' config.json
```

Key info (`/json/config.json` + `/json/tableCfg.json` are the authoritative dictionaries for every object / path):

- Object: `HGS_TELNET_CFG`, lives under `InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage.`
- `customerCheckout` msgType=220 (`POST /getObjs`), `customerCheckin` msgType=221 (`POST /setObjs`)

## 3. Call the API to Enable Telnet

Read the current state first (endpoint on **port 80**, not 8080):

```python
full = "InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage."
body = [{"fullPath": full}]
POST("http://192.168.1.1/getObjs?waitTimeoutMs=5000", body)
```

Typical factory response:

```json
[{"fullPath": "InternetGatewayDevice.DeviceInfo.X_CMCC_ServiceManage.",
  "TelnetEnable": "0", "TelnetWANEnable": "0",
  "TelnetUserName": "CMCCAdmin", "TelnetPassword": "aDm8H%MdA",
  "TelnetPort": "23", "SSHEnable": "0", ...}]
```

Write to enable telnet (**all values are strings**; set your own credentials):

```python
body = [{"fullPath": full,
         "TelnetEnable": "1",
         "TelnetWANEnable": "0",
         "TelnetUserName": "your-telnet-username",
         "TelnetPassword": "your-strong-password"}]
POST("http://192.168.1.1/setObjs?waitTimeoutMs=5000", body)
# Returns [0] on success, telnetd starts immediately
```

> The generic `cgi-bin/telnetenable.cgi?telnetenable=1&key=MAC` trick returns 404 on new firmware. The `Fh@+last6ofMAC` default telnet password belongs to older / other firmwares. Set your own on the new HGS builds.

Verify with `nc -zv 192.168.1.1 23`, then `telnet` in.

## 4. Telnet In & Read the Super Password from Config

```bash
telnet 192.168.1.1
# login: <your-telnet-username>   Password: <your-telnet-password>
```

You land in HiSilicon hsan busybox ash (prompt `/ $`). There is **no** `load_cli factory`, `cfg_cmd`, `qoecmd`, or `cli`, and `su`'s password can't be computed with Broadcom-style algorithms. Don't waste time — just read the raw config file:

```bash
cat /config/work/lastgood.xml
```

This is the **plaintext running config XML** (~166KB). Note that busybox grep doesn't support `\{0,400\}` range regexes. The most reliable approach is to cat the whole file into your terminal log, copy it back locally, then grep:

```bash
grep -n 'SYSMNG_ACCOUNT_ATTR_TAB' -A 10 lastgood.log
```

You'll hit the account table:

```xml
<Dir Name="SYSMNG_ACCOUNT_ATTR_TAB">
  <Value Name="ucTeleAccountEnable" Value="1"/>
  <Value Name="aucTeleAccountName" Value="CMCCAdmin"/>
  <Value Name="aucTeleAccountPassword" Value="SUPER_PASSWORD_HERE"/>   ← super-admin password
  <Value Name="aucUserAccountName" Value="user"/>
  <Value Name="aucUserAccountPassword" Value="matches_your_ONT_label"/>   ← sanity check
</Dir>
```

> The super password is very often randomized by TR069 (if the defaults like `aDm8H%MdA` don't work, that's exactly what happened). Always read the file for the real value; never guess.

## 5. Log Into the Web Backend as Super Admin

Use the same challenge-response login from step 1, but swap `userName` to `CMCCAdmin` and the password to the one you just extracted. Then open `http://192.168.1.1` in your browser — all hidden menus (Security, Telnet, WAN, etc.) are now visible.

## 6. Read & Modify Security Config (Loosen IPv6 Ingress)

Security config lives at the `hbus://mdm/InternetGatewayDevice.X_CMCC_Security.` node via the hbus protocol (**append the path as-is to the URL, do NOT urlencode it**):

```python
HBUS = "hbus://mdm/InternetGatewayDevice.X_CMCC_Security."

# Read (msgType=211)
GET(f"http://192.168.1.1/getHbusData?path={HBUS}&msgType=211")

# Write (msgType=212, method=set, body carries path+para)
body = {"path": HBUS, "para": {"FirewallLevel": "0"}}
POST(f"http://192.168.1.1/setHbusData?path={HBUS}&method=set&msgType=212", body)
```

All fields and reference values:

| Field | Meaning | Factory Value | Recommendation |
|---|---|---|---|
| FirewallEnable | Global firewall toggle | 1 | 1 (keep it on) |
| FirewallLevel | Level: 0=Low / 1=Medium / 2=High | 1 (Medium) | **0 (Low)** (loosens IPv4 ingress filter) |
| DoSEnable | DoS protection | 1 | 1 (keep it on) |
| PortScanEnable | Port-scan protection | 0 | 0 |
| **IPv6SessionSecurityEnable** | **IPv6 session security (v6 ingress filter)** | 0 | 0 (already off; leave alone) |
| IPFilterIn/OutEnable, UrlFilter, MacFilter | Various filters | 0 | 0 |
| LockNetEnable | ISP line lock | 0 | 0 |

Read back to confirm `FirewallLevel` is `"0"`, then test ingress from outside (disconnect from WiFi, use mobile data).

---

# Part 2: Caveats & Lessons Learned

## Stability Pitfalls (Scripts Must Handle These)

1. **Brittle HTTP stack.** Large downloads and rapid requests hit `ConnectionReset` constantly — even a dozen consecutive failures is normal. Wrap every request in retries (15 attempts × 2s interval worked for me). A single `curl -s` is a coin flip.
2. **Response format.** JSON is tab-indented pretty-print. Use `json.loads` to check success, never string matching.
3. **No cookies / tokens.** Session is bound to source IP. Complete the whole "login → action" chain in one script; never switch your egress IP mid-flight (Docker container, host, and mobile hotspot all have different ones).
4. **Login rate-limiting.** 3 wrong passwords per minute → 60s lockout (`lgErrCnt` counter). `/lgDevice?task=logout` counts toward your quota — **never use it**. Use a 65s wait in retry loops.
5. **Stale session lock.** If another device is already logged into the Web UI, `getChallengeStr` returns errorCode 1 ("another device is logged in"). Ask household members to close the ONT admin page before running.
6. **Connection contention.** Telnet and Web sessions generally don't interfere, but after toggling telnet repeatedly, wait a couple seconds before hitting port 23 again.

## Methodological Pitfalls

7. **Identify your firmware before copying guides.** The online classics — `telnetenable.cgi`, `load_cli factory`, `Fh@+last6ofMAC`, Tianyi Broadcom SU-password generators — **all fail** on HiSilicon hsan + HGS new firmware. The path in this guide (hidden page → setObjs → read lastgood.xml) is the current general-purpose approach.
8. **Busybox tools are castrated.** Grep has no range regex support; `2>/dev/null` redirection can error with `can't create /dev/null: Permission denied` in the restricted shell (the command still runs though). Don't rely on shell tricks — just cat the file back to your local machine and analyze there.
9. **`/json/config.json` is the master key.** With it, you know exactly which object, which hbus path, and which msgType to use for every feature. Anything the Web UI can do, you can API-ize.
10. **Reading the file beats guessing passwords.** TR069 randomizing the default super password (`aDm8H%MdA` etc.) is the norm. The file always holds the truth.

## Security & Cleanup

11. **Telnet cuts both ways.** `telnetd -b 192.168.1.1 -p 23` only binds to LAN, but plaintext + weak creds is still a risk. When done, flip `TelnetEnable` back to `"0"` via setObjs.
12. **Don't expose your Web UI.** After loosening ingress, downstream DNAT6 rules on your router/host may accidentally forward admin ports too — check with `ip6tables -t nat -S`. Keep only the ports you actually need; delete or block the rest.
13. **TR069 / RMS will roll you back.** The ISP can push configs remotely. If a few days later your firewall level reverts to "Medium" or telnet turns off by itself, that's RMS overwriting — just re-run your script, it's normal.
14. **Cost of lowering firewall level.** Setting to "Low" reduces the ONT's IPv4 protection (NAT still saves you, mostly). Keep DoS enabled. Audit other exposed services (Alist, PhotoPrism, etc.) after the change.
15. **ONT-side loosen ≠ ingress works.** The Web UI comments say firewall level only controls IPv4, and `IPv6SessionSecurityEnable` is already off — so the ONT itself might not be your blocker. If external tests still fail, check in order: your downstream router's "IPv6 firewall" toggle → upstream ISP ACL (cross-validate by swapping ports).
16. **Write down your changes.** Typical set: FirewallLevel 1→0, TelnetEnable 1, custom telnet credentials. Anything you did via hbus API can be reverted the same way.
