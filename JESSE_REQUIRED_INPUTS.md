# PackGuardian — Required Inputs from Jesse
*High-impact decisions only. No vague questions.*
*Generated: 2026-05-20*

---

## Immediate (Block pilot until answered)

### Q1 — What is the admin password?

The default `admin@packguardian.com` / `changeme` is live. What should the new password be? 

If Jesse's account will be used for demos: set it to something secure and store it. If the demo account should be a separate named user, say so.

**What to do:** Either update the password through the UI or via the API. Once done, note it somewhere secure.

---

### Q2 — Where should uploaded files be stored?

**Current state:** `/tmp/packguardian_uploads` — files are lost on server reboot.

**Options:**
- A. **Persistent local path** (e.g., `/home/jesse/infra/apps/packguardian/uploads/`): 10-minute fix. Files survive restarts but not disk failure. No additional cost.
- B. **Cloudflare R2**: S3-compatible object storage, free up to 10GB. ~1 day of engineering to integrate.
- C. **Amazon S3**: same as R2, slightly more setup. Costs ~$0.02/month for pilot scale.

**Decision needed:** Which option? For pilot purposes, A is sufficient and takes 10 minutes.

---

### Q3 — Should the platform send email notifications?

**Current state:** "Your supervisor has been notified" appears on the success screen, but no email is sent.

**Options:**
- A. **Yes, basic email notifications**: integrate Resend (free tier, simple API). Send one email to all admin users when an incident is created. ~4–8 hours to implement.
- B. **Yes, but later**: change the success screen copy to "A case has been opened. Check the dashboard for updates." — sets honest expectations.
- C. **No**: omit email for pilot, train operators to check the dashboard.

**Decision needed:** Which option? If B or C, no code change needed. If A, it becomes a sprint item.

---

### Q4 — Who is the first pilot customer?

This determines:
- How many user accounts to create before launch
- Whether the demo tenant should be replaced with their real data
- What their center codes are (affects QR code setup)
- Whether OSHA recordability matters to them (some states have different thresholds)

**Decision needed:** Company name, number of locations, number of staff who will use the platform, and their IT comfort level.

---

### Q5 — Will a real pilot operator use the existing demo tenant, or get a fresh tenant?

**Current state:** One tenant with demo data (Happy Tails, 20 demo locations, 39 demo incidents).

**Options:**
- A. **Wipe demo data, use same tenant**: run `POST /provision/reset-demo` without re-seeding, then give the operator real credentials. Simple.
- B. **Create a new tenant**: run `POST /provision/onboard` for the pilot company. The demo tenant remains for product demos.
- C. **Keep demo, have pilot company also use demo tenant**: confusing, not recommended.

**Decision needed:** A or B. B requires 30 minutes to set up a second tenant.

---

## High Priority (Before or shortly after pilot launch)

### Q6 — What is Jesse's preferred escalation language?

Current choices: "Supervisor Review / Safety Director Review / Executive Review"

Does this match the pilot customer's organizational vocabulary? Pet care companies may use: "Manager Review / Safety Coordinator Review / Owner Review." What are the actual titles at the pilot company?

**Decision needed:** Confirm or revise the three escalation stage names.

---

### Q7 — Should field staff have a login, or submit anonymously?

**Current state:** The mobile incident form requires authentication (JWT token). Field staff must log in.

**Options:**
- A. **Require login (current)**: Every kennel tech needs an account. More friction, but reports are attributed.
- B. **QR-code anonymous**: Scanning a center QR code allows incident submission without login. Reports are attributed to the center, not the person.

**Decision needed:** A or B. Option B requires adding an anonymous submission endpoint (~4 hours).

---

### Q8 — What should happen when a corrective action due date passes?

**Current state:** Overdue CAs show a red "⚑ Follow-up needed" label. Nothing else happens automatically.

**Options:**
- A. **Notification only (current)**: No action taken automatically.
- B. **Auto-escalate the parent case**: When a CA is 3 days overdue, automatically increment the case's Review Stage.
- C. **Email alert**: Send an email to the case assignee when their CA is overdue.

**Decision needed:** Which behavior fits the pilot customer's expectation?

---

### Q9 — What center codes does the pilot customer use?

Center codes are the identifiers staff type when filing reports (e.g., "FL-MIA", "NY-BRK"). These are also embedded in QR codes.

**Decision needed:** A list of the actual center identifiers the pilot customer uses. Without these, staff will file reports under "unknown" center codes, creating data quality problems from day one.

---

### Q10 — What is the OSHA coverage determination?

**Current state:** PackGuardian uses federal OSHA recordability rules. Some states have their own standards (California, Washington, etc.).

**Decision needed:** What state(s) will the pilot customer operate in? Are they covered by federal OSHA or a state plan?

---

## Medium Priority (First 30 days after launch)

### Q11 — Should there be a "supervisor only" role for case assignment?

**Current state:** Any user with any role can be assigned to a case. There's no role-based restriction on who can be assigned to what.

**Decision needed:** Should case assignment be restricted to users with specific roles? If so, what roles?

---

### Q12 — How long should records be retained?

**Current state:** Records are retained indefinitely. No auto-deletion exists.

**OSHA requirement:** Records must be retained 5 years from the end of the year they were created.

**Decision needed:** Should the platform enforce retention policy? If so, should it block deletion, or just warn? At pilot scale, retention is not a technical problem — but the policy should be documented.

---

### Q13 — Who owns a corrective action after the original assignee leaves?

**Current state:** CAs are assigned by name string (not user ID for field staff). If a staff member leaves, their CA is still attributed to their name but has no user account to notify.

**Decision needed:** Should CAs be re-assignable by managers? Should there be a mechanism to reassign all of a departed user's open CAs?

---

### Q14 — Should the platform have a "report without incident type" path?

**Current state:** The mobile form requires selecting an incident type. "Other / Not Listed" is available.

**Decision needed:** Is "Other / Not Listed" sufficient for the pilot? Some operators want a simpler "quick report" mode that requires only a description + center code.

---

### Q15 — What branding should appear in the UI for the pilot customer?

**Current state:** The platform shows "PackGuardian" (or the tenant name set during onboarding).

**Decision needed:** Should the pilot customer see their own company name and logo in the header? If yes, their logo file and preferred name are needed. This is a 30-minute configuration, not a code change.

---

*PackGuardian — Required Inputs from Jesse*
*Each question above is high-impact. Answering all 15 takes approximately 2 hours.*
