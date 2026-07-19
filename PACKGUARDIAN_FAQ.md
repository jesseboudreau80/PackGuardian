# PackGuardian — Frequently Asked Questions

---

## Platform Basics

**What is PackGuardian?**
PackGuardian is an operational safety platform purpose-built for multi-location pet care businesses — kennels, daycares, grooming salons, boarding facilities, and veterinary boarding. It handles incident reporting, investigation tracking, OSHA documentation, and cross-location risk visibility in one system.

**Is this generic incident management software?**
No. PackGuardian is built specifically for how pet care operations work — field staff with wet hands, chaotic environments, and no EHS department. The incident types, workflows, terminology, and OSHA automation are all specific to the pet care industry.

**Does it require an IT department to set up?**
No. It runs in a web browser. There's nothing to install. A pilot is configured and ready within an hour.

**Does it require an app download?**
No. The mobile experience runs in any modern browser. Staff bookmark it to their phone's home screen — it behaves like an app without an app store download.

---

## Incident Reporting

**How fast can staff submit an incident report?**
Under 60 seconds from opening the app to submission. Voice entry is available for hands-free reporting in high-activity environments.

**What if there's no internet connection?**
Reports are saved locally when offline and sync automatically when connection is restored. Staff see a clear "Saved offline" confirmation so nothing is lost.

**Can staff report incidents without creating an account?**
No — all reports require a logged-in user for proper attribution and audit trail. However, staff logins can be set up in minutes.

**What information does the platform capture automatically?**
- Incident type (with intelligent suggestions)
- GPS location (if permitted)
- OSHA recordability determination
- Timestamp
- Follow-up questions based on incident type
- AI analysis of the description (when API key is configured)

---

## OSHA Compliance

**What OSHA forms does PackGuardian generate?**
- OSHA Form 300 (Log of Work-Related Injuries and Illnesses)
- OSHA Form 301 (Injury and Illness Incident Report)
- OSHA Form 300A (Annual Summary)

**Does PackGuardian determine OSHA recordability automatically?**
Yes. The system evaluates treatment type, days away from work, and restricted duty against 29 CFR 1904 criteria and makes a recordability determination automatically. Operators can review and override.

**How does finalization work?**
Once all OSHA fields are complete and verified, an authorized user finalizes the incident record. Finalized records are locked from further editing and included in retention tracking.

**What about the annual 300A posting requirement?**
PackGuardian tracks posting status and sends reminders. The 300A summary is generated from your incident data and can be reviewed before the February 1 posting requirement.

**How long are records retained?**
PackGuardian flags records for 5-year OSHA retention per 29 CFR 1904.33. Retention expiry dates are tracked per record.

---

## Safety Intelligence

**What are Safety Signals?**
Safety Signals are automatically detected operational patterns — recurring incident types at the same location, unusual incident bursts, repeated escalations. They appear in the Command Center and update when signals are refreshed.

**How does center health scoring work?**
Each location receives a health score (0–100) based on recent incident severity, open corrective actions, overdue follow-ups, escalated cases, and inspection history. A lower score means more operational attention is needed.

**What is the risk score on individual incidents?**
Each incident receives an operational risk score (0–100) with named contributors: severity, OSHA exposure, escalation level, overdue corrective actions, repeat incidents, and documentation gaps. This is for prioritization, not discipline.

**Does PackGuardian use AI?**
AI features (voice transcription, incident extraction, witness synthesis) are optional and require an Anthropic API key. Every AI feature has a rule-based fallback. The platform is fully functional without AI.

---

## Data and Security

**Where is data stored?**
US-based infrastructure. Data is tenant-isolated — one customer's data is never accessible to another.

**Can I export my data?**
Yes. OSHA forms can be exported. Full data export is available on request. We don't hold data hostage if you decide to stop using the platform.

**Who can see sensitive information like employee medical records?**
HR-only fields (medical treatment details, workers' comp documentation) are only visible to users with the HR role. Visibility controls are enforced at the API level, not just in the UI.

**Is PackGuardian HIPAA compliant?**
Medical information captured in PackGuardian (injury details, treatment type) is not PHI under HIPAA as defined for occupational health records under OSHA. Consult your legal team for specific compliance questions.

---

## Pilot and Pricing

**What does the pilot cost?**
The 90-day pilot is free. After the pilot, pricing is per location per month.

**What's the expected pricing after pilot?**
Under $50/location/month. At 10 locations, that's less than $500/month — less than the administrative cost of handling one workers' comp claim without a system.

**How long does onboarding take?**
Platform configured for your locations: under 1 hour. Team onboarding: 15-minute walkthrough. First real incident submitted: typically within 24 hours of setup.

**What if my staff doesn't adopt it?**
Voice entry eliminates the "too busy to type" objection. The mobile intake is simpler than any paper form. Adoption resistance typically signals a UX problem — we'll fix it.

**Can I cancel anytime?**
Yes. No long-term contracts during pilot. After pilot, month-to-month by default.

---

*PackGuardian — Operational Safety for Pet Care*
