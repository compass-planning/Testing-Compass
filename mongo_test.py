import requests, pyotp, re

base = re.search(r'REACT_APP_BACKEND_URL=(.*)', open('/app/frontend/.env').read()).group(1).strip()
api = base + "/api"
S = requests.Session()

def login(email, pw="Compass2026!"):
    r = S.post(f"{api}/auth/login", json={"email": email, "password": pw}).json()
    ch = r["challenge"]
    if r["status"] == "mfa_setup":
        secret = r["secret"]
        v = S.post(f"{api}/auth/mfa/verify", json={"challenge": ch, "code": pyotp.TOTP(secret).now()}).json()
        if v.get("status") == "security_required":
            v = S.post(f"{api}/auth/security-question", json={"setup_token": v["setup_token"], "question": v["questions"][0], "answer": "toronto"}).json()
        return v["token"], "setup"
    else:
        # already enrolled -> cannot compute code without secret; just confirm status
        return None, "enrolled"

tok, state = login("advisor@compass.ca")
print("advisor login state:", state)
assert tok, "expected first-login setup on fresh Mongo seed"
H = {"Authorization": f"Bearer {tok}"}
me = S.get(f"{api}/auth/me", headers=H).json()
print("me:", me["email"], "mfa_enabled:", me["mfa_enabled"])
assert me["mfa_enabled"] is True, "MFA enrollment should now persist in Mongo"

# verify enrolled user now hits mfa_required (persisted)
r2 = requests.post(f"{api}/auth/login", json={"email": "advisor@compass.ca", "password": "Compass2026!"}).json()
print("second login status:", r2["status"])
assert r2["status"] == "mfa_required", "secret must persist across logins (and restarts) in Mongo"

# verify networth data still scoped / readable for household
hid = "client_a1"
rows = S.get(f"{api}/plan/networth", headers=H, params={"household_id": hid}).json()
print("networth rows for client_a1:", len(rows))
print("PASS - Mongo persistence + MFA enrollment working")
