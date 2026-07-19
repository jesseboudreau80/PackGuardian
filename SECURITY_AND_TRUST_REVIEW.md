# PackGuardian — Security & Trust Review
*Practical operational security review — not a pentest*
*Generated: 2026-05-20*

---

## What This Is

This is a safety-focused operational security review. It covers: what could go wrong during a real pilot, what could embarrass the platform in front of operators, and what needs to be fixed before real user data is stored. It is NOT a full penetration test or compliance audit.

---

## CRITICAL — Fix Before Any Real Users

### SEC-C1 — Default admin password is live

**What it is:** The API seeds `admin@packguardian.com` / `changeme` on first run if no users exist. This account still exists and is fully functional.

**Verified:** `curl -X POST .../auth/login -d '{"email":"admin@packguardian.com","password":"changeme"}'` returns a valid JWT.

**Risk:** Anyone who navigates to the login URL and knows the default can authenticate as admin. The login URL is publicly accessible via Cloudflare tunnel.

**Fix:** Change this password right now. It takes 30 seconds via the settings UI or a direct API call.

```bash
# Get a new admin token with the old password, then change it
TOKEN=$(curl -sf -X POST https://packguardian-api.jesseboudreau.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@packguardian.com","password":"changeme"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
# Then update password via the UI or a PATCH /users/{id} call
```

---

### SEC-C2 — `is_active` flag is ignored during authentication

**What it is:** The `users` table has an `is_active BOOLEAN NOT NULL DEFAULT true` column (added via migration). The `get_current_user` dependency and the login route never check it.

**Risk:** A terminated employee whose account is "deactivated" (if you ever deactivate one) can still authenticate with their old password and access all data.

**Fix:** Add two lines to `auth/dependencies.py`:
```python
if not user.is_active:
    raise credentials_error
```

**Complexity:** 2 minutes

---

### SEC-C3 — JWT secret has an insecure default in source code

**What it is:** `config.py` defaults `jwt_secret` to `"CHANGE-THIS-SECRET-IN-PRODUCTION"`. The `.env` file overrides this with a real secret. If the `.env` file is ever lost or absent (e.g., accidental delete, new deployment), the app starts with the known default secret — and all JWTs signed with the default are valid.

**Risk:** If someone knows the default secret (it's visible in the source), they can forge valid JWTs for any user ID/tenant.

**Fix:** Add a startup check that fails loudly if `settings.jwt_secret == "CHANGE-THIS-SECRET-IN-PRODUCTION"`:
```python
# In main.py, after config loads
if settings.jwt_secret == "CHANGE-THIS-SECRET-IN-PRODUCTION":
    logger.critical("[packguardian] JWT_SECRET is using the default value. "
                    "Set JWT_SECRET in api/.env before running.")
    sys.exit(1)
```

**Complexity:** 5 minutes

---

## High — Fix Before Pilot

### SEC-H1 — No rate limiting on authentication endpoint

**What it is:** `POST /auth/login` accepts unlimited requests. A simple script could try thousands of passwords per minute.

**Risk:** Brute force against any known email address (e.g., the admin email shown in the platform UI).

**Fix:** Add `slowapi`:
```python
# requirements.txt
slowapi==0.1.9

# main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# auth/routes.py
@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, ...):
```

**Complexity:** 1 hour

---

### SEC-H2 — Upload MIME type validation is client-controlled

**What it is:** `upload_evidence()` in `evidence/routes.py` validates `file.content_type`, which is the `Content-Type` header sent by the client. An attacker can upload a PHP file with `Content-Type: image/jpeg`.

**Risk:** On this deployment (static file serving, not PHP execution), this is low risk. But if the upload directory ever becomes web-accessible, arbitrary file execution becomes possible.

**Fix:** Add server-side magic byte validation using `python-magic`:
```python
import magic
detected_mime = magic.from_buffer(content[:2048], mime=True)
if detected_mime not in ALLOWED_MIME_TYPES:
    raise HTTPException(422, "File content doesn't match declared type")
```

Or: at minimum, validate file extension against MIME type.

**Complexity:** 2 hours

---

### SEC-H3 — No password complexity requirements

**What it is:** The login form and join/accept form only require passwords to be ≥ 8 characters. No complexity check.

**Risk:** Users set passwords like "12345678" or their name. Weak passwords are more likely to be guessed or appear in credential stuffing attacks.

**Fix:** Add a basic strength check: require at least one non-lowercase character (number, uppercase, or symbol). Enforce both client-side (for UX) and server-side (for security).

**Complexity:** 1 hour

---

### SEC-H4 — Evidence download endpoint doesn't validate file exists before streaming

**What it is:** `GET /evidence/files/{file_id}/download` checks `if not Path(ef.storage_path).exists()` and raises 404. This is correct. However, the `storage_path` is a filesystem path, and if an attacker could manipulate this (e.g., via a DB injection — not currently possible), they could read arbitrary files.

**Current status:** Tenant isolation prevents cross-tenant access. The storage_path is set server-side during upload. This is a theoretical risk, not an active one.

**Fix:** Verify that the resolved path starts with the `UPLOAD_DIR` prefix before serving:
```python
if not str(dest.resolve()).startswith(str(_storage_root().resolve())):
    raise HTTPException(403, "Access denied")
```

**Complexity:** 30 minutes

---

## Medium — Good Hygiene

### SEC-M1 — Session tokens stored in localStorage (not HttpOnly cookies)

**What it is:** `pg_token` and `pg_role` are stored in `localStorage`. This is the standard approach for SPAs, but it means XSS attacks can steal the token. HttpOnly cookies would mitigate this.

**Risk:** If any page is vulnerable to XSS (e.g., if user-supplied incident descriptions were rendered as HTML — they are currently rendered as text), tokens could be exfiltrated.

**Current mitigations:** All user content is rendered as `{variable}` text in React (escaped by default). No `dangerouslySetInnerHTML` is used. XSS risk is low.

**Fix:** Not required for pilot. Would require converting to cookie-based auth.

---

### SEC-M2 — No HTTPS enforcement at the application layer

**What it is:** The API doesn't enforce HTTPS — it relies entirely on Cloudflare tunnel. If the tunnel is bypassed (e.g., direct access to port 8105), traffic is unencrypted.

**Risk:** Low — port 8105 is only accessible within the server itself (not exposed externally without the tunnel). No direct external access path exists.

**Fix:** Bind uvicorn to `127.0.0.1` instead of `0.0.0.0` so it's only accessible via the tunnel:
```bash
--host 127.0.0.1  # instead of 0.0.0.0
```

**Complexity:** 1 minute (change in `start.sh`)

---

### SEC-M3 — Logs may contain sensitive data

**What it is:** The API logs include incident descriptions (from AI extraction logs), email addresses, and organization names. The log file at `$LOGS/api.log` is readable by any user with server access.

**Risk:** Low — only Jesse has server access. But in a multi-admin environment, log access exposes PII.

**Fix:** Add `"description"` and `"employee_name"` to a scrub list before logging incident details. Not critical for single-operator pilot.

---

### SEC-M4 — Default admin email is guessable

**What it is:** The seed admin is `admin@packguardian.com`. The domain `packguardian.com` is not Jesse's domain, but the pattern is predictable.

**Fix:** After changing the password, also change the email to Jesse's real email. Or better: seed with `jesse.boudreau.dev@gmail.com` as the default admin.

---

## Tenant Isolation Audit

**Result: PASS** — All queried tables filter by `tenant_id`. All routes use `get_current_user` which carries `tenant_id`. Spot-checked: incidents, cases, corrective actions, safety signals, evidence, QR codes — all scope to `current_user.tenant_id`. No cross-tenant data access path found.

---

## Auth Flow Summary

```
User submits email+password
→ POST /auth/login
→ User looked up by email
→ Password verified with bcrypt
→ JWT created with {sub, tenant_id, role, exp}
→ Token stored in localStorage
→ Axios interceptor attaches Bearer token to all requests
→ get_current_user validates JWT, looks up User in DB
→ On 401 response → redirect to /login?reason=session_expired
```

**What's missing from this flow:**
- `is_active` check (GAP-H1)
- Rate limiting (GAP-H2)
- Token refresh (24h expiry means daily re-login required)

---

## Trust Assessment for Operators

**Can operators trust that their data is private from other tenants?** YES — tenant isolation is correctly implemented.

**Can operators trust that their data won't be accidentally deleted?** NO — the demo reset endpoint has no guard, and files in /tmp are lost on reboot.

**Can operators trust that their submitted reports are saved?** MOSTLY — online submissions save to the DB immediately. Photos may fail silently. Offline submissions sync when connectivity returns.

**Can operators trust that only authorized people see their data?** YES with caveats — the default admin password is a live backdoor. Fix this first.

---

*PackGuardian — Security & Trust Review*
