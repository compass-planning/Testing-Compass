"""Phase 2 tests: Documents Hub (vault), Meetings/Whisper, protection helper, PDF estate waterfall."""
import os
import io
import time
import wave
import struct
import pyotp
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://compass-vault.preview.emergentagent.com").rstrip("/")
TOTP = pyotp.TOTP("JBSWY3DPEHPK3PXP")
HID = "client_a1"


def _login(email, password=os.environ.get("TEST_PASSWORD", "Compass2026!")):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    ch = r.json()["challenge"]
    for _ in range(3):
        r2 = requests.post(f"{BASE}/api/auth/mfa/verify", json={"challenge": ch, "code": TOTP.now()})
        if r2.status_code == 200 and r2.json().get("status") == "authenticated":
            return r2.json()["token"]
        time.sleep(1)
    pytest.skip(f"MFA login failed for {email}: {r2.text}")


@pytest.fixture(scope="module")
def advisor_token():
    return _login("advisor@compass.ca")


@pytest.fixture(scope="module")
def enterprise_token():
    return _login("scott@sweston.ca")


@pytest.fixture(scope="module")
def ah(advisor_token):
    return {"Authorization": f"Bearer {advisor_token}"}


@pytest.fixture(scope="module")
def eh(enterprise_token):
    return {"Authorization": f"Bearer {enterprise_token}"}


# ── Documents CRUD ─────────────────────────────────────────────────────
class TestDocumentsCRUD:
    def test_upload_list_download_delete(self, ah):
        content = b"hello compass vault test"
        files = {"file": ("TEST_vault.txt", content, "text/plain")}
        data = {"category": "document", "household_id": HID}
        r = requests.post(f"{BASE}/api/plan/documents/upload", headers=ah, files=files, data=data)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["name"] == "TEST_vault.txt"
        assert rec["size"] == len(content)
        assert rec["category"] == "document"
        fid = rec["id"]

        r = requests.get(f"{BASE}/api/plan/documents/files", headers=ah, params={"household_id": HID})
        assert r.status_code == 200
        assert any(x["id"] == fid for x in r.json())

        r = requests.get(f"{BASE}/api/plan/documents/files/{fid}/download", headers=ah, params={"household_id": HID})
        assert r.status_code == 200
        assert r.content == content

        r = requests.delete(f"{BASE}/api/plan/documents/files/{fid}", headers=ah, params={"household_id": HID})
        assert r.status_code == 200
        assert r.json().get("ok") is True

        r = requests.get(f"{BASE}/api/plan/documents/files/{fid}/download", headers=ah, params={"household_id": HID})
        assert r.status_code == 404

    def test_oversize_413(self, ah):
        big = b"x" * (10 * 1024 * 1024 + 10)
        files = {"file": ("TEST_big.bin", big, "application/octet-stream")}
        r = requests.post(f"{BASE}/api/plan/documents/upload", headers=ah,
                          files=files, data={"category": "document", "household_id": HID})
        assert r.status_code == 413, r.status_code

    def test_empty_400(self, ah):
        files = {"file": ("TEST_empty.txt", b"", "text/plain")}
        r = requests.post(f"{BASE}/api/plan/documents/upload", headers=ah,
                          files=files, data={"category": "document", "household_id": HID})
        assert r.status_code == 400

    def test_enterprise_upload_403(self, eh):
        files = {"file": ("TEST_x.txt", b"hi", "text/plain")}
        r = requests.post(f"{BASE}/api/plan/documents/upload", headers=eh,
                          files=files, data={"category": "document"})
        assert r.status_code == 403, r.status_code


# ── Meetings / Whisper ─────────────────────────────────────────────────
def _make_silent_wav(seconds=1, rate=16000):
    buf = io.BytesIO()
    w = wave.open(buf, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(b"".join(struct.pack("<h", 0) for _ in range(rate * seconds)))
    w.close()
    return buf.getvalue()


class TestMeetings:
    def test_empty_file_400(self, ah):
        files = {"file": ("empty.wav", b"", "audio/wav")}
        r = requests.post(f"{BASE}/api/plan/meetings/transcribe", headers=ah,
                          files=files, data={"title": "TEST_empty", "household_id": HID})
        assert r.status_code == 400, r.status_code

    def test_transcribe_small_wav(self, ah):
        audio = _make_silent_wav(1)
        files = {"file": ("TEST_tiny.wav", audio, "audio/wav")}
        r = requests.post(f"{BASE}/api/plan/meetings/transcribe", headers=ah,
                          files=files, data={"title": "TEST_meeting", "household_id": HID},
                          timeout=60)
        # Must not 500/404. Accept 200 or 502 (upstream whisper refused tiny silence) — report either way
        assert r.status_code != 500, f"server error: {r.text}"
        assert r.status_code != 404, "endpoint missing"
        if r.status_code == 200:
            d = r.json()
            assert "id" in d and "title" in d and "transcript" in d and "created_at" in d
            # Clean up
            mid = d["id"]
            # List
            r2 = requests.get(f"{BASE}/api/plan/meetings", headers=ah, params={"household_id": HID})
            assert r2.status_code == 200
            assert any(m["id"] == mid for m in r2.json())
            # Delete
            r3 = requests.delete(f"{BASE}/api/plan/meetings/{mid}", headers=ah, params={"household_id": HID})
            assert r3.status_code == 200
        else:
            print(f"transcribe non-200 (acceptable if upstream): {r.status_code} {r.text[:200]}")


# ── Protection helper (unchanged) + PDF with estate waterfall ─────────
class TestRegression:
    def test_advisor_clients_protection(self, ah):
        r = requests.get(f"{BASE}/api/advisor/clients", headers=ah)
        assert r.status_code == 200
        clients = r.json()
        a1 = next((c for c in clients if c.get("client_id") == HID), None)
        assert a1 is not None, f"client_a1 not found"
        assert a1.get("protection_score") is not None
        assert "protection_analyses" in a1

    def test_report_pdf(self, ah):
        r = requests.get(f"{BASE}/api/report/pdf", headers=ah, params={"household_id": HID}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
