"""Password hashing + JWT token management for Compass Planning."""
import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 12  # 12h for v1 convenience


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])


def create_scoped_token(data: dict, ttl_min: int, ttype: str) -> str:
    payload = {
        **data, "type": ttype,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl_min),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


# ---------------- TOTP MFA ----------------
import io
import base64
import pyotp
import qrcode


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str, issuer: str = "Compass Planning") -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    try:
        return pyotp.TOTP(secret).verify(str(code).strip().replace(" ", ""), valid_window=1)
    except Exception:
        return False


def qr_data_url(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------- Security question ----------------

def hash_answer(answer: str) -> str:
    return hash_password(answer.strip().lower())


def verify_answer(answer: str, hashed: str) -> bool:
    return verify_password(answer.strip().lower(), hashed)
