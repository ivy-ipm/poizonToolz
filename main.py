import requests
import re

API = "https://api.slin.dev/grab/v1"

# 🔥 PUT FULL GRAB LINK HERE
USER_INPUT = "https://grabvr.quest/levels/viewer/?level=2bxbvcht0nsillans5exy:1771389229"


# ========================
# PARSE LINK (STRICT)
# ========================
def parse_level_id(link):
    link = link.strip()

    if "grabvr.quest" not in link:
        return None, None

    m = re.search(r"[?&]level=([^&\s]+)", link)
    if not m:
        return None, None

    raw = m.group(1)

    if ":" not in raw:
        return None, None

    id, ts = raw.split(":", 1)
    return id.strip(), ts.strip()


# ========================
# FETCH INFO
# ========================
def fetch_level_info(id, ts):
    try:
        r = requests.get(f"{API}/details/{id}/{ts}", timeout=10)
        if r.ok:
            data = r.json()
            if data.get("data_key"):
                return data
    except Exception as e:
        print("⚠ API error:", e)

    return None


# ========================
# BUILD DOWNLOAD URL
# ========================
def build_download_url(data_key):
    parts = data_key.split(":")
    if len(parts) == 4:
        return f"{API}/download/{parts[1]}/{parts[2]}/{parts[3]}"
    return None


# ========================
# FALLBACK PROBE (LIKE HTML)
# ========================
def probe_versions(id, ts):
    print("🔍 Probing versions...")
    for v in range(1, 15):  # 🔥 increased range
        url = f"{API}/download/{id}/{ts}/{v}"
        try:
            r = requests.head(url, timeout=5)
            print(f"Trying v{v} → {r.status_code}")
            if r.ok:
                print(f"✅ Found working version: {v}")
                return url
        except:
            pass
    return None


# ========================
# DOWNLOAD FILE
# ========================
def download_level(url, filename):
    print("⬇ Downloading...")
    r = requests.get(url, timeout=20)

    if not r.ok:
        print("❌ Download failed:", r.status_code)
        return

    safe_name = re.sub(r'[\\/*?:"<>|]', "_", filename)[:60]

    with open(safe_name + ".level", "wb") as f:
        f.write(r.content)

    print("✅ Saved:", safe_name + ".level")
    print("📦 Size:", len(r.content), "bytes")


# ========================
# MAIN
# ========================
def main():
    id, ts = parse_level_id(USER_INPUT)

    if not id or not ts:
        print("❌ INVALID LINK")
        print("✔ Example:")
        print("https://grabvr.quest/levels/viewer/?level=id:timestamp")
        return

    print(f"Parsed → id={id}, ts={ts}")

    info = fetch_level_info(id, ts)

    if info and info.get("data_key"):
        print("📌 Title:", info.get("title", "unknown"))
        print("👤 Creator:", ", ".join(info.get("creators", [])))

        dl_url = build_download_url(info["data_key"])

        if dl_url:
            download_level(dl_url, info.get("title", f"{id}_{ts}"))
            return

    # 🔥 fallback if API fails
    print("⚠ Using fallback method...")
    dl_url = probe_versions(id, ts)

    if dl_url:
        download_level(dl_url, f"{id}_{ts}")
    else:
        print("❌ Level not found")


main()