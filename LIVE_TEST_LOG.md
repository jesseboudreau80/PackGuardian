# PackGuardian — Live Test Log
*Real issues found during operational testing, in the order discovered*

---

## Session 1 — Initial Code Review Pass

### BUG-01 — Photo upload silently fails
| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **Impact** | Users add photos, receive no error, but photos are never uploaded |
| **File** | `web/app/mobile/incident/page.tsx` lines 434–442 |
| **Root cause** | FormData is built but the `axios.post()` call was never written — the block ends with a comment "Evidence upload endpoint — best-effort" and an empty catch |
| **Fix** | Backend: added `incident_id` query filter to `GET /cases`. Frontend: capture incident_id from POST response, query case, upload each photo to `/evidence/cases/{case_id}/upload` one-by-one |
| **Remaining concern** | Upload is still best-effort (non-fatal) so a failed photo upload doesn't show an error. Added a `photoUploadStatus` state to show "Photos saved" confirmation on the success screen. |
| **Follow-up** | Consider a persistent "Photos saved ✓" note in the case evidence tab |

---

### BUG-02 — Voice recognition reads stale transcript state
| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Impact** | When voice recognition ends, AI extraction may fire with an empty string — no extraction happens despite voice input |
| **File** | `web/app/mobile/incident/page.tsx` line 351 |
| **Root cause** | `recog.onend` captures `transcript` from React state in closure, but React state updates are async — by the time `onend` fires, the state reference in the closure still holds the old (pre-speech) value |
| **Fix** | Added `transcriptRef` that mirrors the `transcript` state, updated in parallel with `setTranscript`. The `onend` handler reads `transcriptRef.current` instead of the stale state variable |
| **Remaining concern** | None — refs are synchronously updated |

---

### TRUST-01 — "Escalation Level / L2" language
| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Impact** | Staff who see "Escalation Level 2" think disciplinary action is happening — destroys human trust, causes underreporting |
| **File** | `web/app/cases/page.tsx` lines 487–608 |
| **Root cause** | Language borrowed from corporate complaint management, not safety culture |
| **Fix** | Renamed "Escalation Level" → "Review Stage". Dropdown options changed: 0→Normal, 1→Supervisor Review, 2→Safety Director Review, 3→Executive Review. Badge shows named stage, not "⬆ Level N". Command Center "L1/L2" labels → "SR1/SD2/EX3" |
| **Remaining concern** | WebSocket broadcast labels still say "CASE_ESCALATED" internally — acceptable, that's internal only |

---

### TRUST-02 — "Connection issue" dot has no tooltip
| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Impact** | Operators see a red dot and panic — no explanation of what it means or what to do |
| **File** | `web/app/components/AppHeader.tsx` lines 97–106 |
| **Root cause** | Health indicator was added without explanatory text |
| **Fix** | Added `title` attribute to the pill: "Unable to reach the PackGuardian server. Reports submitted on mobile are saved locally and will sync when reconnected." |
| **Remaining concern** | Mobile users can't see this indicator (hidden sm:flex) — acceptable, mobile has offline queue feedback |

---

### UX-01 — Cases list shows UUID instead of incident type
| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Impact** | Supervisor scanning the case list sees "a1b2c3d4…" instead of "Dog Bite" — forces opening every case to identify it |
| **File** | `api/app/modules/cases/routes.py`, `api/app/modules/cases/schemas.py`, `web/app/cases/page.tsx` |
| **Root cause** | `CaseRead` schema doesn't include incident metadata — only case management fields |
| **Fix** | Added `incident_type: str | None` and `center_id: str | None` to `CaseRead`. `list_cases` route joins with `Incident` to populate these fields. Case list item now shows `incident_type.replace(/_/g," ")` as primary label, UUID moved to subtle secondary |
| **Remaining concern** | The join adds slight query overhead — acceptable at pilot scale |

---

### UX-02 — Cases page subtitle says "Enterprise incident lifecycle..."
| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Impact** | Operators don't identify with "Enterprise" framing — creates mental distance from the tool |
| **File** | `web/app/cases/page.tsx` line 312 |
| **Root cause** | Placeholder description left over from early development |
| **Fix** | Changed to "Open investigations, corrective actions, and follow-up tracking" |
| **Remaining concern** | None |

---

---

## Session 2 — Production Hardening Pass (2026-05-20)

### BUG-03 — demo.py shift incident seeding crashes with `updated_at` TypeError
| Field | Value |
|-------|-------|
| **Severity** | HIGH (blocked demo reset) |
| **Impact** | `POST /provision/reset-demo` returned 500; demo data couldn't be seeded |
| **File** | `api/app/modules/provision/demo.py` line 1808 |
| **Root cause** | Phase 24 shift incident seeding passed `updated_at=created_at` to `Incident()`, but `Incident` model has no `updated_at` column |
| **Fix** | Removed `updated_at` from the `Incident` constructor call in the shift incidents seeding block |
| **Remaining concern** | None — demo reset now works and produces 49 incidents as expected |

---

### BUG-04 — Diagnostics reports `active_signals: -1` (double bug)
| Field | Value |
|-------|-------|
| **Severity** | MEDIUM (support tool unreliable) |
| **Impact** | `GET /provision/diagnostics` showed -1 active signals despite 6 existing; `last_signal_refresh` was always null |
| **File** | `api/app/modules/provision/routes.py` lines 614-621 |
| **Root cause 1** | Filter used `SafetySignal.is_active == True` but the model field is `dismissed` not `is_active` |
| **Root cause 2** | Timestamp query used `SafetySignal.updated_at` but the model field is `detected_at` not `updated_at` — both exceptions were silently caught, returning -1 |
| **Fix** | Changed to `dismissed == False` and `detected_at` throughout |
| **Remaining concern** | None |

---

### SEC-01 — JWT default secret guard added to startup
| Field | Value |
|-------|-------|
| **Severity** | HIGH (infrastructure protection) |
| **Impact** | If `.env` is lost, the API would start with a known-default JWT secret that anyone can forge |
| **File** | `api/main.py` |
| **Fix** | Added `sys.exit(1)` if `settings.jwt_secret == "CHANGE-THIS-SECRET-IN-PRODUCTION"` — API now refuses to start with an insecure default |

---

### SEC-02 — `is_active` check added to authentication
| Field | Value |
|-------|-------|
| **Severity** | HIGH (auth gap) |
| **Impact** | Deactivated users could still authenticate with their old credentials |
| **File** | `api/app/modules/auth/dependencies.py` |
| **Fix** | Added `if not user.is_active: raise credentials_error` after the user lookup |

---

### SEC-03 — Demo reset tenant guard added
| Field | Value |
|-------|-------|
| **Severity** | HIGH (operational safety) |
| **Impact** | `POST /provision/reset-demo` could wipe any tenant's data |
| **File** | `api/app/modules/provision/routes.py` |
| **Fix** | Added tenant_id check against `settings.demo_tenant_id`; returns 403 if the authenticated user is not on the demo tenant |

---

### INFRA-01 — Upload directory moved to persistent path
| Field | Value |
|-------|-------|
| **Severity** | CRITICAL (data persistence) |
| **Impact** | All uploaded evidence photos were lost on every server reboot |
| **Fix** | Changed `UPLOAD_DIR` in `.env` from `/tmp/packguardian_uploads` to `/home/jesse/infra/apps/packguardian/uploads`; directory created |

---

### INFRA-02 — CORS now includes localhost:3005
| Field | Value |
|-------|-------|
| **Severity** | MEDIUM (developer experience) |
| **Impact** | Local web server on :3005 could not call local API on :8105 due to CORS policy |
| **Fix** | Added `http://localhost:3005` to `cors_origins` in `config.py` |

---

*PackGuardian — Live Testing Mode*
