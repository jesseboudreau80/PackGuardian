"""
Enterprise demo seeder — "Happy Tails Pet Resorts".

Populates a full 20-center enterprise tenant with realistic operational data:
incidents, cases, tasks, OSHA records, inspections, evidence, automation events,
and notifications. Pure DB writes, no network I/O.

    seed_demo_data(db, tenant_id, actor_id)         → add all demo data
    purge_demo_data(db, tenant_id, keep_user_id)    → wipe tenant data (preserve one user)
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session


# ── Time helpers ──────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _ago(days: int, hours: int = 9) -> datetime:
    return _now() - timedelta(days=days, hours=hours)

def _date_ago(days: int) -> date:
    return (_now() - timedelta(days=days)).date()


# ── Geographic constants ──────────────────────────────────────────────────────
# (code, name, lat, lng, address, city, state)

_CENTERS = [
    # Southeast > Florida District
    ("FL-MIA", "Miami Beach Resort",     25.7617, -80.1918, "3200 Collins Ave",    "Miami Beach",  "FL"),
    ("FL-ORL", "Orlando Lakes",          28.5383, -81.3792, "5500 Lake Shore Dr",  "Orlando",      "FL"),
    ("FL-TPA", "Tampa Bay Resort",       27.9506, -82.4572, "1800 Bayshore Blvd",  "Tampa",        "FL"),
    ("FL-JAX", "Jacksonville Meadows",   30.3322, -81.6557, "910 Riverside Ave",   "Jacksonville", "FL"),
    # Southeast > Georgia District
    ("GA-ATL", "Atlanta Midtown",        33.7490, -84.3880, "1200 Peachtree St",   "Atlanta",      "GA"),
    ("GA-SAV", "Savannah Historic",      32.0835, -81.0998, "400 Broughton St",    "Savannah",     "GA"),
    ("GA-AUG", "Augusta Riverwalk",      33.4735, -82.0105, "700 Broad St",        "Augusta",      "GA"),
    # Northeast > New York District
    ("NY-MAN", "Manhattan Upper West",   40.7831, -73.9712, "255 W 84th St",       "New York",     "NY"),
    ("NY-BRK", "Brooklyn Park Slope",    40.6782, -73.9442, "680 Union St",        "Brooklyn",     "NY"),
    ("NY-QNS", "Queens Forest Hills",    40.7282, -73.7949, "108-20 72nd Ave",     "Forest Hills", "NY"),
    ("NY-LIS", "Long Island Huntington", 40.8687, -73.4257, "40 New St",           "Huntington",   "NY"),
    # Northeast > Pennsylvania District
    ("PA-PHL", "Philadelphia Society Hill", 39.9526, -75.1652, "305 Chestnut St",  "Philadelphia", "PA"),
    ("PA-PIT", "Pittsburgh Shadyside",   40.4406, -79.9959, "5520 Walnut St",      "Pittsburgh",   "PA"),
    ("PA-ALL", "Allentown Center City",  40.6084, -75.4902, "840 Hamilton St",     "Allentown",    "PA"),
    ("PA-REA", "Reading Penn Square",    40.3356, -75.9269, "600 Penn St",         "Reading",      "PA"),
    # Northeast > New England District
    ("NE-BOS", "Boston Back Bay",        42.3601, -71.0589, "201 Newbury St",      "Boston",       "MA"),
    ("NE-PRV", "Providence College Hill",41.8240, -71.4128, "150 Benefit St",      "Providence",   "RI"),
    ("NE-HRT", "Hartford Asylum Hill",   41.7637, -72.6851, "85 Farmington Ave",   "Hartford",     "CT"),
    ("NE-WOR", "Worcester Elm Park",     42.2626, -71.8023, "400 Park Ave",        "Worcester",    "MA"),
    ("NE-MAN", "Manchester Millyard",    42.9956, -71.4548, "670 Commercial St",   "Manchester",   "NH"),
]

# (district_name, area_idx, center_indices)
_DISTRICTS = [
    ("Florida District",     0, [0, 1, 2, 3]),
    ("Georgia District",     0, [4, 5, 6]),
    ("New York District",    1, [7, 8, 9, 10]),
    ("Pennsylvania District",1, [11, 12, 13, 14]),
    ("New England District", 1, [15, 16, 17, 18, 19]),
]

# ── User templates ────────────────────────────────────────────────────────────
# (email, system_role)

_USERS = [
    ("sarah.chen@happytails.com",       "manager"),  # 0 → safety
    ("michael.rodriguez@happytails.com","manager"),  # 1 → hr
    ("jennifer.kim@happytails.com",     "manager"),  # 2 → area_manager Southeast
    ("david.patel@happytails.com",      "manager"),  # 3 → area_manager Northeast
    ("marcus.johnson@happytails.com",   "manager"),  # 4 → district_manager FL
    ("lisa.thompson@happytails.com",    "manager"),  # 5 → district_manager GA
    ("robert.garcia@happytails.com",    "manager"),  # 6 → district_manager NY
    ("emily.wong@happytails.com",       "manager"),  # 7 → district_manager PA
    ("james.davis@happytails.com",      "manager"),  # 8 → district_manager NE
    ("patricia.hall@happytails.com",    "manager"),  # 9 → center_manager FL-MIA/ORL
    ("carlos.brown@happytails.com",     "manager"),  # 10 → center_manager FL-TPA/JAX + GA-ATL
    ("nancy.wilson@happytails.com",     "manager"),  # 11 → center_manager GA-SAV/AUG + NY-MAN
    ("thomas.lee@happytails.com",       "manager"),  # 12 → center_manager NY-BRK/QNS/LIS + PA-PHL
    ("linda.martin@happytails.com",     "manager"),  # 13 → center_manager PA-PIT/ALL/REA + NE-BOS
    ("kevin.white@happytails.com",      "manager"),  # 14 → center_manager NE-PRV/HRT/WOR/MAN
    ("alex.torres@happytails.com",      "manager"),  # 15 → field_staff (no org assignments)
]

# ── Incident templates ────────────────────────────────────────────────────────
# Fields: incident_type, center_code, description, reported_severity, status,
#         days_ago, [employee fields], [osha fields]

_INCIDENTS = [
    # ── Recordable Employee Injuries (8) ──────────────────────────────────────
    {
        "incident_type": "employee_injury",
        "center_code": "FL-MIA",
        "description": "Kennel technician Rosa Chen was bitten on the right forearm by a 45-lb German Shepherd mix during morning feeding. Wound required 8 stitches at urgent care. Vaccination records for the dog are current. Employee remained off work 4 days and returned to restricted duty.",
        "reported_severity": "high",
        "status": "closed",
        "days_ago": 84,
        "employee_name": "Rosa Chen",
        "job_title": "Kennel Technician",
        "treatment_type": "emergency_room",
        "days_away": 4,
        "restricted_days": 7,
        "recordable": True,
        "is_finalized": True,
        "osha_class": "days_away",
    },
    {
        "incident_type": "employee_injury",
        "center_code": "FL-JAX",
        "description": "Shift supervisor Derek Norris slipped on standing water near the outdoor wash bay and fell, landing on his left wrist. X-ray confirmed a non-displaced radial fracture. Employee was placed in a cast for 6 weeks and returned to modified duty. Wet floor warning signage was not in place.",
        "reported_severity": "high",
        "status": "closed",
        "days_ago": 71,
        "employee_name": "Derek Norris",
        "job_title": "Shift Supervisor",
        "treatment_type": "emergency_room",
        "days_away": 2,
        "restricted_days": 28,
        "recordable": True,
        "is_finalized": True,
        "osha_class": "restricted",
    },
    {
        "incident_type": "employee_injury",
        "center_code": "GA-ATL",
        "description": "Groomer Priya Nair inadvertently mixed two cleaning concentrates, creating fumes that caused respiratory irritation. She was hospitalized overnight for observation. Air quality monitoring found chloramine levels above safe thresholds in the grooming bay. Chemical storage SOPs were not followed.",
        "reported_severity": "critical",
        "status": "closed",
        "days_ago": 58,
        "employee_name": "Priya Nair",
        "job_title": "Dog Groomer",
        "treatment_type": "hospitalization",
        "days_away": 1,
        "restricted_days": 3,
        "recordable": True,
        "is_finalized": True,
        "osha_class": "days_away",
    },
    {
        "incident_type": "employee_injury",
        "center_code": "NY-MAN",
        "description": "Kennel attendant Jordan Bailey suffered a deep laceration to the left hand while cleaning a broken stainless steel food bowl with a cracked edge. Wound required 4 stitches and medical treatment. Employee returned to restricted duty (no wet work) for 10 days.",
        "reported_severity": "medium",
        "status": "closed",
        "days_ago": 45,
        "employee_name": "Jordan Bailey",
        "job_title": "Kennel Attendant",
        "treatment_type": "medical",
        "days_away": 0,
        "restricted_days": 10,
        "recordable": True,
        "is_finalized": True,
        "osha_class": "restricted",
    },
    {
        "incident_type": "employee_injury",
        "center_code": "PA-PHL",
        "description": "Kennel technician Marcus Wright strained his lower back while lifting a large dog breed (estimated 90 lbs) onto a grooming table without mechanical assistance. Reports pain rated 7/10 with limited range of motion. Employee saw an occupational medicine physician and was placed on restricted duty.",
        "reported_severity": "medium",
        "status": "investigating",
        "days_ago": 35,
        "employee_name": "Marcus Wright",
        "job_title": "Kennel Technician",
        "treatment_type": "medical",
        "days_away": 0,
        "restricted_days": 14,
        "recordable": True,
        "is_finalized": False,
        "osha_class": "restricted",
    },
    {
        "incident_type": "employee_injury",
        "center_code": "NE-BOS",
        "description": "Day care coordinator Alicia Torres was bitten on the right hand by a 30-lb Dachshund mix during a group play session. Two puncture wounds required ER evaluation and follow-up. Dog had a prior bite notation that was not flagged in the intake system. Escalated to area safety director.",
        "reported_severity": "high",
        "status": "investigating",
        "days_ago": 22,
        "employee_name": "Alicia Torres",
        "job_title": "Day Care Coordinator",
        "treatment_type": "emergency_room",
        "days_away": 0,
        "restricted_days": 5,
        "recordable": True,
        "is_finalized": False,
        "osha_class": "restricted",
    },
    {
        "incident_type": "employee_injury",
        "center_code": "NY-BRK",
        "description": "Kennel technician Sam Park slipped on an icy walkway at the rear entrance while carrying a supply crate. Fell and landed on his hip. Imaging showed a hip contusion with no fracture. Employee placed on restricted duty for 14 days. Salt application on walkways was delayed that morning.",
        "reported_severity": "high",
        "status": "assigned",
        "days_ago": 15,
        "employee_name": "Sam Park",
        "job_title": "Kennel Technician",
        "treatment_type": "emergency_room",
        "days_away": 0,
        "restricted_days": 14,
        "recordable": True,
        "is_finalized": False,
        "osha_class": "restricted",
    },
    {
        "incident_type": "employee_injury",
        "center_code": "FL-TPA",
        "description": "Maintenance technician Victor Reyes sustained a hand laceration while repairing a kennel gate latch with an unguarded cutting tool. Four-inch cut across palm required medical treatment and 5 stitches. Employee was not wearing cut-resistant gloves per SOP.",
        "reported_severity": "high",
        "status": "new",
        "days_ago": 8,
        "employee_name": "Victor Reyes",
        "job_title": "Maintenance Technician",
        "treatment_type": "medical",
        "days_away": 0,
        "restricted_days": 7,
        "recordable": True,
        "is_finalized": False,
        "osha_class": "restricted",
    },
    # ── Non-recordable employee injuries (4) ──────────────────────────────────
    {
        "incident_type": "employee_injury",
        "center_code": "FL-ORL",
        "description": "Kennel staff Kim Lopez received a minor bite on the finger from a small terrier during nail trim. Wound was cleaned and bandaged on site. No medical treatment required. Employee returned immediately to full duty.",
        "reported_severity": "low",
        "status": "closed",
        "days_ago": 76,
        "employee_name": "Kim Lopez",
        "job_title": "Kennel Staff",
        "treatment_type": "first_aid",
        "days_away": 0,
        "restricted_days": 0,
        "recordable": False,
        "is_finalized": True,
        "osha_class": None,
    },
    {
        "incident_type": "employee_injury",
        "center_code": "GA-SAV",
        "description": "Groomer Tanya Hicks received a superficial scratch on the forearm from a cat during a grooming session. Wound cleaned and bandaged; first aid only. No loss of work time.",
        "reported_severity": "low",
        "status": "closed",
        "days_ago": 52,
        "employee_name": "Tanya Hicks",
        "job_title": "Groomer",
        "treatment_type": "first_aid",
        "days_away": 0,
        "restricted_days": 0,
        "recordable": False,
        "is_finalized": True,
        "osha_class": None,
    },
    {
        "incident_type": "employee_injury",
        "center_code": "PA-PIT",
        "description": "Staff member Ryan Cross slipped on wet floor in the laundry area. Caught himself on a shelf and did not fall. Reports minor shoulder soreness. Ice applied on site; no medical treatment sought.",
        "reported_severity": "low",
        "status": "closed",
        "days_ago": 30,
        "employee_name": "Ryan Cross",
        "job_title": "Kennel Staff",
        "treatment_type": "first_aid",
        "days_away": 0,
        "restricted_days": 0,
        "recordable": False,
        "is_finalized": True,
        "osha_class": None,
    },
    {
        "incident_type": "employee_injury",
        "center_code": "NE-PRV",
        "description": "Kennel technician Dana Fields reports upper back strain after repeated bending during kennel cleaning. First aid applied; ibuprofen provided from on-site kit. Employee continued full duty. Follow-up with occupational health scheduled.",
        "reported_severity": "low",
        "status": "open",
        "days_ago": 10,
        "employee_name": "Dana Fields",
        "job_title": "Kennel Technician",
        "treatment_type": "first_aid",
        "days_away": 0,
        "restricted_days": 0,
        "recordable": False,
        "is_finalized": False,
        "osha_class": None,
    },
    # ── Dog fights (4) ───────────────────────────────────────────────────────
    {
        "incident_type": "dog_fight",
        "center_code": "FL-MIA",
        "description": "Two labs in group play area D engaged in a fight. Staff intervened using standard protocol within 30 seconds. Minor lacerations on the smaller dog (Cooper, 55 lbs). Wound cleaned and owner notified. Both dogs separated into individual runs.",
        "reported_severity": "medium",
        "status": "closed",
        "days_ago": 80,
    },
    {
        "incident_type": "dog_fight",
        "center_code": "NY-QNS",
        "description": "Three-dog altercation in large dog daycare room. Dominant husky mix initiated aggression with two other dogs. Staff separated within 45 seconds. Minor puncture wounds on one dog (Biscuit, 40 lbs). Owner notified and dog behavior report filed.",
        "reported_severity": "medium",
        "status": "closed",
        "days_ago": 62,
    },
    {
        "incident_type": "dog_fight",
        "center_code": "GA-ATL",
        "description": "Severe dog fight in overnight boarding area during feeding. A 70-lb pit bull terrier broke through a kennel divider and attacked an adjacent golden retriever. Both dogs required veterinary treatment. Second incident involving the same dog this month. Escalated to district manager and area safety director.",
        "reported_severity": "critical",
        "status": "investigating",
        "days_ago": 40,
    },
    {
        "incident_type": "dog_fight",
        "center_code": "PA-ALL",
        "description": "Escalation between two medium-breed dogs in the play yard resulted in minor puncture wounds to both animals. Staff intervened appropriately. Incident log updated. Owner notification completed within 1 hour.",
        "reported_severity": "medium",
        "status": "open",
        "days_ago": 25,
    },
    # ── Pet injuries (3) ─────────────────────────────────────────────────────
    {
        "incident_type": "pet_injury",
        "center_code": "FL-ORL",
        "description": "Labrador retriever (Sunny, 5 yrs) developed acute limping in right rear leg during group play. Removed from play, examined by staff; no visible wound or swelling. Owner notified; veterinary evaluation recommended. Dog collected by owner same day.",
        "reported_severity": "low",
        "status": "closed",
        "days_ago": 68,
    },
    {
        "incident_type": "pet_injury",
        "center_code": "NE-BOS",
        "description": "Miniature schnauzer (Pepper, 2 yrs) ingested an unknown substance in the outdoor play yard. Dog began vomiting and showing signs of distress. Emergency veterinary transport arranged. Owner notified immediately. Yard inspected; no foreign substances found post-incident.",
        "reported_severity": "high",
        "status": "open",
        "days_ago": 35,
    },
    {
        "incident_type": "pet_injury",
        "center_code": "NY-LIS",
        "description": "Overheating incident: French bulldog (Meatball, 3 yrs) showed signs of heat distress during outdoor play on a high-temperature afternoon. Cooled with water and moved to air-conditioned area; owner notified. Dog recovered fully. Outdoor temperature at time of incident was 91°F.",
        "reported_severity": "medium",
        "status": "resolved",
        "days_ago": 18,
    },
    # ── Escapes (2) ─────────────────────────────────────────────────────────
    {
        "incident_type": "escape",
        "center_code": "FL-JAX",
        "description": "A 35-lb terrier mix named Benny escaped through an unsecured gate in the medium dog yard. Found in adjacent parking lot within 8 minutes. Staff immediately initiated escape protocol. Gate latch found to be worn and not properly engaging. Latch replaced same day.",
        "reported_severity": "high",
        "status": "closed",
        "days_ago": 50,
    },
    {
        "incident_type": "escape",
        "center_code": "NY-LIS",
        "description": "Border collie (Dash, 1.5 yrs) squeezed under a play area fence panel where ground erosion had created a gap. Dog located in adjacent yard within 15 minutes. Fence panel repaired and ground graded.",
        "reported_severity": "high",
        "status": "resolved",
        "days_ago": 18,
    },
    # ── Sanitation (5) ───────────────────────────────────────────────────────
    {
        "incident_type": "sanitation",
        "center_code": "FL-TPA",
        "description": "Routine audit found bleach solution in kennel cleaning bucket at 10x the recommended concentration (1:3 instead of 1:32). One dog showed skin irritation after kennel wash. Veterinary evaluation performed; no lasting harm. Staff member had misread the dilution label.",
        "reported_severity": "medium",
        "status": "closed",
        "days_ago": 75,
    },
    {
        "incident_type": "sanitation",
        "center_code": "GA-AUG",
        "description": "Third consecutive week with failed sanitation spot checks in the cat boarding wing. Disinfection log shows incomplete entries on 6 of 14 days. Odor complaints from two clients. Manager identified scheduling gap causing cleaning duties to go unassigned during shift transitions.",
        "reported_severity": "medium",
        "status": "investigating",
        "days_ago": 55,
    },
    {
        "incident_type": "sanitation",
        "center_code": "NY-BRK",
        "description": "Kennel staff discovered that biohazard waste (dog feces) had been placed in the general trash bin on two separate mornings by a new employee. Proper disposal procedure re-trained immediately. Bins relabeled.",
        "reported_severity": "low",
        "status": "closed",
        "days_ago": 42,
    },
    {
        "incident_type": "sanitation",
        "center_code": "PA-PHL",
        "description": "Food contamination incident: dry kibble storage bin found to have moisture damage and possible mold growth. Entire bin contents discarded. 12 dogs fed from this supply in the prior 48 hours; owners notified. No illness reported. Root cause: bin stored on floor near exterior drain.",
        "reported_severity": "high",
        "status": "investigating",
        "days_ago": 28,
    },
    {
        "incident_type": "sanitation",
        "center_code": "NE-HRT",
        "description": "Staff observed a cleaning product container (floor degreaser) stored directly above an open food prep surface. Label states 'keep away from food contact areas.' Immediately corrected. Storage area reorganized per hazard communication SOP.",
        "reported_severity": "medium",
        "status": "open",
        "days_ago": 12,
    },
    # ── Equipment / Facility (5) ─────────────────────────────────────────────
    {
        "incident_type": "equipment_failure",
        "center_code": "FL-MIA",
        "description": "Kennel run gate in building B lost its self-locking mechanism. Staff discovered gate standing open with no dog inside; potential containment failure. Gate removed from service; 3 dogs relocated to alternative kennels. Maintenance work order issued for latch replacement.",
        "reported_severity": "high",
        "status": "resolved",
        "days_ago": 60,
    },
    {
        "incident_type": "equipment_failure",
        "center_code": "GA-ATL",
        "description": "Electric grooming table failed to hold position mid-session; table dropped suddenly while a 70-lb dog was on it. Dog startled but uninjured. Groomer's hand caught briefly under the table edge — no laceration but contusion noted. Table taken out of service immediately.",
        "reported_severity": "medium",
        "status": "closed",
        "days_ago": 48,
    },
    {
        "incident_type": "equipment_failure",
        "center_code": "NY-MAN",
        "description": "HVAC unit serving the main boarding wing failed during high-temperature day. Ambient temperature in kennel area rose to 83°F over 3 hours. Dogs moved to climate-controlled grooming rooms. No heat-related illness reported. Emergency HVAC repair dispatched.",
        "reported_severity": "critical",
        "status": "investigating",
        "days_ago": 33,
    },
    {
        "incident_type": "equipment_failure",
        "center_code": "PA-PIT",
        "description": "Grooming dryer blower housing cracked, exposing heating element. Near-miss: element did not contact any dog or staff. Dryer removed from service. Inspection of remaining two dryer units revealed one additional unit with worn housing.",
        "reported_severity": "high",
        "status": "open",
        "days_ago": 20,
    },
    {
        "incident_type": "equipment_failure",
        "center_code": "NE-WOR",
        "description": "Floor drain in kennel C-4 is backing up, causing standing water on walkway. Slip risk identified. Warning signage placed immediately. Drain cleared by maintenance within 2 hours. Root cause: hair accumulation in trap. Drain maintenance schedule under review.",
        "reported_severity": "medium",
        "status": "new",
        "days_ago": 6,
    },
]


# ── Narrative Scenarios ────────────────────────────────────────────────────────
# Interconnected story arcs that create signals, recurrence patterns, and
# investigation depth. Each scenario has incidents close together in time
# so the pattern detector fires.

_NARRATIVE_INCIDENTS = [
    # ═══════════════════════════════════════════════════════════════════════════
    # ARC 1 — FL-JAX "Rear Drain Trap"
    # Three slip/fall incidents near the same rear floor drain within 12 days.
    # The corrective action from Derek Norris's earlier case was created but
    # the drain was never properly repaired — leading to two more incidents.
    # Triggers: temporal_cluster + repeat_incident_type at FL-JAX
    # ═══════════════════════════════════════════════════════════════════════════
    {
        "incident_type": "slip_fall",
        "center_code": "FL-JAX",
        "description": "Kennel attendant Tanya Howard slipped on standing water near the rear floor drain in the kennel corridor during afternoon cleaning. She caught herself on the wall but twisted her right ankle. Applied ice on site. Tanya returned to work with a slight limp. The drain has been backing up intermittently for three weeks — a work order was submitted last month but maintenance hasn't completed the repair. Wet floor cone was not in place at time of incident.",
        "reported_severity": "medium",
        "status": "open",
        "days_ago": 11,
        "employee_name": "Tanya Howard",
        "job_title": "Kennel Attendant",
        "treatment_type": "first_aid",
        "days_away": 0,
        "restricted_days": 0,
        "recordable": False,
        "is_finalized": False,
    },
    {
        "incident_type": "slip_fall",
        "center_code": "FL-JAX",
        "description": "Near-miss: shift supervisor Jamie Reyes was walking through the rear corridor when her foot slipped on a wet patch near the floor drain. Did not fall — caught herself on a kennel door handle. No injury. This is the third slip incident near this drain in two weeks. Drain continues to back up despite reported work order. Verbal warning to maintenance issued. Emergency drain service scheduled for tomorrow.",
        "reported_severity": "low",
        "status": "open",
        "days_ago": 3,
        "employee_name": "Jamie Reyes",
        "job_title": "Shift Supervisor",
        "treatment_type": "first_aid",
        "days_away": 0,
        "restricted_days": 0,
        "recordable": False,
        "is_finalized": False,
    },
    {
        "incident_type": "equipment_failure",
        "center_code": "FL-JAX",
        "description": "Floor drain in rear kennel corridor confirmed blocked. Emergency plumber dispatched and identified a clog compounded by improper drain trap installation. Water had been pooling under the rubber mat for weeks without staff awareness. Root cause of three recent slip incidents confirmed. Drain replaced; corridor closed for 24 hours. This event documents the equipment failure underlying the slip pattern.",
        "reported_severity": "medium",
        "status": "investigating",
        "days_ago": 1,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # ARC 2 — GA-ATL "Zeus Problem"
    # A 90-lb Cane Corso named Zeus has been involved in two separate fights
    # at GA-ATL within 25 days. The dog was supposedly removed from group play
    # after the first incident, but returned with owner pushback.
    # Triggers: repeat_incident_type (dog_fight) at GA-ATL + dog_name recurrence
    # ═══════════════════════════════════════════════════════════════════════════
    {
        "incident_type": "aggressive_behavior",
        "center_code": "GA-ATL",
        "description": "90-lb Cane Corso named Zeus engaged in sustained mounting behavior targeting a 40-lb Labradoodle in play yard B. Zeus repeatedly ignored redirection commands. Staff separated dogs after 4 minutes. No injuries. Zeus has an aggressive behavior note from a prior stay flagging resource guarding near feeding areas — this behavior is different in character. Owner notified; Zeus moved to solo play yard for remainder of stay. Behavior flag updated.",
        "reported_severity": "medium",
        "status": "investigating",
        "days_ago": 22,
    },
    {
        "incident_type": "dog_fight",
        "center_code": "GA-ATL",
        "description": "Zeus (Cane Corso, 90 lbs) attacked a border collie mix in play yard B during group play. Staff intervened within 90 seconds using standard protocol. Border collie sustained puncture wounds to left rear haunch. Owner of border collie notified; vet evaluation arranged. Zeus has now been involved in two separate incidents at this location in 25 days. Owner was notified after the first incident (aggressive behavior, 3 weeks ago) but declined to remove Zeus from group play. Safety director recommending permanent ban from group play pending behavior eval.",
        "reported_severity": "high",
        "status": "investigating",
        "days_ago": 8,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # ARC 3 — PA-PIT "Dryer Room"
    # Two equipment failures involving grooming dryers within 18 days.
    # The first cracked housing was repaired; this is a second unit with the
    # same issue — suggesting systemic equipment aging across the grooming room.
    # Triggers: repeat_incident_type (equipment_failure) + temporal_cluster at PA-PIT
    # ═══════════════════════════════════════════════════════════════════════════
    {
        "incident_type": "equipment_failure",
        "center_code": "PA-PIT",
        "description": "Second grooming dryer incident at PA-PIT this month. Dryer unit #2 in grooming room B developed a burning smell and automatic shutoff triggered during a standard grooming session. Groomer Carla Santos immediately removed the dog (uninjured golden retriever) and unplugged the unit. Inspection revealed the heating element housing had cracked — same failure mode as unit #1 two weeks ago. Both units are the same model and purchase year. All three remaining grooming dryers in the facility are now under inspection. Regional safety director notified.",
        "reported_severity": "high",
        "status": "investigating",
        "days_ago": 4,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # ARC 4 — NY-BRK "Closing Shift Pattern"
    # Recurring sanitation failures and a near-miss during closing shift.
    # Suggests understaffing or protocol breakdown during closing.
    # Triggers: repeat_incident_type (sanitation) at NY-BRK
    # ═══════════════════════════════════════════════════════════════════════════
    {
        "incident_type": "sanitation",
        "center_code": "NY-BRK",
        "description": "Second sanitation compliance gap at NY-BRK in 3 weeks. Evening closing staff documented incomplete kennel disinfection log — 4 of 12 kennel runs show no entry for the nightly deep-clean cycle. Supervisor review found that the closing crew on Tuesdays and Thursdays consists of only 2 staff members for a 48-run facility. This is below the minimum staffing standard for full sanitation compliance. Root cause: recent resignation left Tuesday/Thursday closing understaffed. Temporary coverage not arranged. Affected runs re-cleaned immediately.",
        "reported_severity": "medium",
        "status": "open",
        "days_ago": 7,
    },
    {
        "incident_type": "near_miss",
        "center_code": "NY-BRK",
        "description": "Near-miss: staff member Devon Clarke discovered an unsecured kennel latch on run #18 during morning rounds. The kennel contained a 65-lb German Shepherd. The latch pin was not fully engaged — dog could have pushed the door open. No escape occurred. Root cause under investigation: run #18 was in the section of the facility assigned to Thursday closing crew (understaffed). The latch has a worn spring that was noted in a maintenance log 6 weeks ago but not yet repaired. Latch replaced same day.",
        "reported_severity": "high",
        "status": "open",
        "days_ago": 2,
    },
]


# ── Narrative CA templates for story arcs ─────────────────────────────────────
# (narrative_incident_index, title, root_cause, status, due_offset_days, notes)
_NARRATIVE_CAS = [
    # FL-JAX arc
    (0, "Complete emergency floor drain repair — rear corridor",
        "facility", "in_progress", 3,
        "Emergency plumber engaged. Drain replacement confirmed for tomorrow. Corridor has wet floor barriers in place."),
    (0, "Audit all floor drains across facility for blockage and trap integrity",
        "process_gap", "open", 10, None),
    (0, "Implement pre-shift wet surface walkaround checklist for all corridors",
        "process_gap", "open", 7, None),
    # GA-ATL Zeus arc
    (3, "Issue permanent group-play suspension for Zeus pending behavioral evaluation",
        "animal_behavior", "completed", -6,
        "Zeus moved to solo play only. Owner notified via written communication. Behavior eval appointment set."),
    (4, "Initiate liability documentation for Zeus bite — owner contact and vet bills",
        "process_gap", "in_progress", 5,
        "Owner contacted. Vet bill received from border collie owner. Insurance notified."),
    (4, "Review group play admission criteria — add mandatory behavioral screening for large breed dogs",
        "process_gap", "open", 14, None),
    # PA-PIT dryer arc
    (6, "Remove all dryers of this model from service pending manufacturer inspection",
        "equipment", "completed", -3,
        "All 4 dryers of same model removed from service. Loaner units arranged from district warehouse."),
    (6, "Obtain manufacturer inspection report and determine repair/replace decision",
        "equipment", "in_progress", 10,
        "Manufacturer contacted. On-site inspection scheduled for next week."),
    # NY-BRK closing arc
    (7, "Hire temporary staff to cover Tuesday/Thursday closing shift",
        "staffing", "in_progress", 5,
        "Two temp agency candidates interviewed. Start date pending background check."),
    (7, "Audit all facility latches for worn springs and mechanical integrity",
        "facility", "open", 7, None),
    (8, "Repair kennel run #18 latch spring — inspect all runs in closing crew section",
        "facility", "completed", -1,
        "Run #18 latch replaced. Full inspection of runs 15–24 completed. 2 additional worn latches found and replaced."),
]

# Witness statements for narrative incidents
_NARRATIVE_WITNESSES = [
    # FL-JAX Tanya Howard slip (incident index 0 in narrative)
    (0, "Carlos Mendez", "Kennel Technician", "afternoon",
     True, True,
     "I saw Tanya go down. She was carrying a mop bucket and the floor was wet near the drain again. I've slipped in that same spot twice myself in the past two weeks but didn't report it because I didn't fall. I grabbed her arm before she went all the way down. The drain has been an issue since at least early last month — water doesn't drain properly and pools under the mat.",
     11),
    # GA-ATL Zeus second fight (incident index 4 in narrative — dog fight)
    (4, "Marcus Webb", "Kennel Attendant", "morning",
     True, True,
     "I saw Zeus target the border collie from across the yard — it was a purposeful approach, not play. I started moving toward them immediately but he was fast. I got the border collie out with the break stick while my co-worker occupied Zeus. The whole thing was maybe 90 seconds. I want to note: Zeus had a prior incident flag in the system, but group play was continued at the owner's request. I don't think Zeus should be in group play with any dog under 60 lbs.",
     8),
    # PA-PIT second dryer incident (index 5 in narrative)
    (5, "Carla Santos", "Groomer", "morning",
     True, True,
     "The burning smell was immediate and strong — I've smelled that before from the dryer housing. I turned it off right away and moved the dog. The housing looked exactly like the crack we had on unit #1 two weeks ago. These dryers are old. I've been saying for months that we need replacements. The manufacturer's recommended service life is 7 years and ours are 9 years old. I kept a copy of the service manual.",
     4),
]


# ── Shift-based realistic incidents (imperfect human reporting) ────────────────
# These simulate a real operational day: morning checks, midday rush, closing
# shift fatigue. Descriptions are intentionally imperfect — rushed, vague,
# incomplete — to model real staff behavior rather than polished demo data.
#
# Format: (center_code, incident_type, severity, status, days_ago, shift_hour, description, employee_name)
#   shift_hour = UTC hour offset used to vary timestamp within the day
#   employee_name = None means staff didn't fill it in

_SHIFT_INCIDENTS = [
    # ── Morning opening incidents (7–9am) ─────────────────────────────────────
    ("GA-SAV", "pet_injury", "low", "open", 3, 16,
     "Overnight boarding dog not eating breakfast. Lethargic. Monitoring.",
     None),
    ("FL-MIA", "equipment_failure", "low", "open", 4, 15,
     "Grooming table hydraulic lift stuck — can't raise table. "
     "Using block to prop. Maintenance called.",
     None),
    ("NY-MAN", "aggressive_behavior", "low", "closed", 6, 15,
     "Yorkie snapped at groomer during nail trim. No skin contact. "
     "Muzzled for rest of appointment. Owner notified.",
     None),

    # ── Midday rush incidents (11am–2pm) ──────────────────────────────────────
    ("NY-MAN", "dog_bite", "medium", "open", 2, 12,
     "Staff bitten right hand during midday playgroup rotation. "
     "Minor. First aid applied, returned to work.",
     None),  # no employee name — rushed report
    ("NE-BOS", "escape", "medium", "open", 1, 11,
     "Husky mix pushed through play gate during afternoon rotation. "
     "Staff caught in lobby immediately. No property escape. Latch inspected.",
     "Darius Wolfe"),
    ("PA-PHL", "chemical", "low", "closed", 5, 12,
     "Disinfectant concentrate spilled during mop bucket refill. "
     "Area cleared, diluted. Staff with minor skin contact washed hands, no irritation. "
     "Incident logged per chemical SOP.",
     "Keisha Brown"),

    # ── Closing shift incidents (6–9pm) ───────────────────────────────────────
    ("FL-TPA", "slip_fall", "low", "open", 1, 2,
     "Slip near washing station. No injury.",
     None),  # extremely short — realistic closing report
    ("GA-AUG", "sanitation", "low", "open", 2, 2,
     "Sanitation log incomplete end of shift. 3 runs not checked. "
     "Short staffed tonight.",
     None),
    ("NY-QNS", "employee_injury", "low", "open", 3, 3,
     "Back pain from lifting. Will check in tomorrow with GM.",
     None),  # vague — this is the operational debt problem

    # ── Same-day / recent ─────────────────────────────────────────────────────
    ("NY-BRK", "pet_injury", "medium", "investigating", 3, 8,
     "Customer reports dog has scratch on nose not documented by overnight staff. "
     "Investigating which shift was responsible.",
     None),
]

# ── CA fatigue data (overdue corrective actions from shift incidents) ─────────
# (shift_incident_index, title, root_cause, due_offset_days, notes)
# All statuses are "open" — these are the unresolved operational debt
_SHIFT_FATIGUE_CAS = [
    (3, "Follow up with injured staff member — confirm medical evaluation not needed",
     "process_gap", -5, None),   # 5 days overdue — no one followed up on the bite
    (6, "Complete incident detail report for FL-TPA slip",
     "process_gap", -3, None),   # 3 days overdue — minimal report never updated
    (8, "GM to confirm back pain status with NY-QNS staff member — occupational health referral if needed",
     "process_gap", -2, None),   # 2 days overdue — no one checked back
    (9, "Identify overnight shift responsible for undocumented pet injury at NY-BRK",
     "process_gap", -4, None),   # 4 days overdue — accountability gap
]


# ── Purge ─────────────────────────────────────────────────────────────────────

def purge_demo_data(
    db: Session,
    tenant_id: uuid.UUID,
    keep_user_id: uuid.UUID,
) -> None:
    """
    Delete all operational data for a tenant, preserving one user (the caller).
    Safe to call repeatedly; order respects FK constraints.
    """
    from app.modules.automation.models import AutomationEvent, WorkflowConfig, WorkflowDelivery
    from app.modules.cases.models import CaseTimeline, IncidentCase, IncidentComment, IncidentTask
    from app.modules.corrective_actions.models import CorrectiveAction
    from app.modules.evidence.models import EvidenceFile, EvidenceNote
    from app.modules.inspections.models import Inspection, InspectionItem
    from app.modules.integrations.models import IntegrationRef, IntegrationWebhook
    from app.modules.map.models import Center
    from app.modules.notifications.models import Notification
    from app.modules.organizations.models import OrgAuditLog, Organization, OrganizationMember
    from app.modules.osha.models import Incident, IncidentAuditLog, OshaLog
    from app.modules.qr.models import QRCode
    from app.modules.safety.models import OSHAPosting, OSHARetentionRecord
    from app.modules.signals.models import SafetySignal
    from app.modules.witness.models import WitnessStatement

    tid = tenant_id
    syn = False  # synchronize_session off — faster, safe here

    # Evidence notes reference evidence files by FK
    ev_file_ids = [r for (r,) in db.query(EvidenceFile.id).filter(EvidenceFile.tenant_id == tid)]
    if ev_file_ids:
        db.query(EvidenceNote).filter(EvidenceNote.evidence_file_id.in_(ev_file_ids)).delete(syn)
    db.query(EvidenceFile).filter(EvidenceFile.tenant_id == tid).delete(syn)

    # Corrective actions + witness statements
    db.query(CorrectiveAction).filter(CorrectiveAction.tenant_id == tid).delete(syn)
    db.query(WitnessStatement).filter(WitnessStatement.tenant_id == tid).delete(syn)
    db.query(SafetySignal).filter(SafetySignal.tenant_id == tid).delete(syn)

    # Case children
    db.query(CaseTimeline).filter(CaseTimeline.tenant_id == tid).delete(syn)
    db.query(IncidentComment).filter(IncidentComment.tenant_id == tid).delete(syn)
    db.query(IncidentTask).filter(IncidentTask.tenant_id == tid).delete(syn)
    db.query(IncidentCase).filter(IncidentCase.tenant_id == tid).delete(syn)

    # OSHA children — audit log has FK to incidents
    inc_ids = [r for (r,) in db.query(Incident.id).filter(Incident.tenant_id == tid)]
    if inc_ids:
        db.query(IncidentAuditLog).filter(IncidentAuditLog.incident_id.in_(inc_ids)).delete(syn)
    db.query(OshaLog).filter(OshaLog.tenant_id == tid).delete(syn)
    db.query(OSHARetentionRecord).filter(OSHARetentionRecord.tenant_id == tid).delete(syn)
    db.query(OSHAPosting).filter(OSHAPosting.tenant_id == tid).delete(syn)

    # Inspections
    insp_ids = [r for (r,) in db.query(Inspection.id).filter(Inspection.tenant_id == tid)]
    if insp_ids:
        db.query(InspectionItem).filter(InspectionItem.inspection_id.in_(insp_ids)).delete(syn)
    db.query(Inspection).filter(Inspection.tenant_id == tid).delete(syn)

    # Automation
    db.query(WorkflowDelivery).filter(WorkflowDelivery.tenant_id == tid).delete(syn)
    db.query(WorkflowConfig).filter(WorkflowConfig.tenant_id == tid).delete(syn)
    db.query(AutomationEvent).filter(AutomationEvent.tenant_id == tid).delete(syn)

    # Integrations + QR
    db.query(IntegrationRef).filter(IntegrationRef.tenant_id == tid).delete(syn)
    db.query(IntegrationWebhook).filter(IntegrationWebhook.tenant_id == tid).delete(syn)
    db.query(QRCode).filter(QRCode.tenant_id == tid).delete(syn)

    # Org hierarchy
    from app.modules.auth.models import User as _User
    db.query(OrgAuditLog).filter(OrgAuditLog.tenant_id == tid).delete(syn)
    tenant_user_ids = [r for (r,) in db.query(_User.id).filter(_User.tenant_id == tid)]
    if tenant_user_ids:
        db.query(OrganizationMember).filter(
            OrganizationMember.user_id.in_(tenant_user_ids)
        ).delete(syn)
    db.query(Organization).filter(Organization.tenant_id == tid).delete(syn)

    # Core data
    db.query(Incident).filter(Incident.tenant_id == tid).delete(syn)
    db.query(Center).filter(Center.tenant_id == tid).delete(syn)
    db.query(Notification).filter(Notification.tenant_id == tid).delete(syn)

    # Users — keep the admin who triggered the reset
    from app.modules.auth.models import User
    db.query(User).filter(
        User.tenant_id == tid,
        User.id != keep_user_id,
    ).delete(syn)

    db.flush()


# ── Seed ─────────────────────────────────────────────────────────────────────

def seed_demo_data(
    db: Session,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> dict:
    """
    Populate a full enterprise demo: Happy Tails Pet Resorts.
    Returns counts of all created objects.
    """
    tid = tenant_id
    counts: dict[str, int] = {}

    # ── Phase 1: Org hierarchy ────────────────────────────────────────────────
    from app.modules.organizations.models import Organization, OrganizationMember

    enterprise = Organization(tenant_id=tid, name="Happy Tails Pet Resorts", org_type="enterprise")
    db.add(enterprise)
    db.flush()

    areas: list[Organization] = []
    for area_name in ["Southeast Region", "Northeast Region"]:
        a = Organization(tenant_id=tid, name=area_name, org_type="area", parent_id=enterprise.id)
        db.add(a)
        areas.append(a)
    db.flush()

    districts: list[Organization] = []
    center_orgs: list[Organization] = []   # indexed same as _CENTERS
    center_orgs_by_code: dict[str, Organization] = {}

    # Build districts first, flush so their IDs are populated, then attach centers
    district_meta: list[tuple[Organization, list[int]]] = []
    for dist_name, area_idx, c_indices in _DISTRICTS:
        dist = Organization(tenant_id=tid, name=dist_name, org_type="district", parent_id=areas[area_idx].id)
        db.add(dist)
        districts.append(dist)
        district_meta.append((dist, c_indices))
    db.flush()  # flush districts so dist.id is populated before center refs

    _center_org_placeholders = [None] * len(_CENTERS)
    for dist, c_indices in district_meta:
        for c_idx in c_indices:
            cc, cn, *_ = _CENTERS[c_idx]
            co = Organization(tenant_id=tid, name=cn, org_type="center", parent_id=dist.id)
            db.add(co)
            _center_org_placeholders[c_idx] = co
            center_orgs_by_code[cc] = co

    db.flush()
    center_orgs = _center_org_placeholders  # type: ignore[assignment]

    counts["organizations"] = 1 + len(areas) + len(districts) + len(_CENTERS)

    # ── Phase 2: Centers (map) ────────────────────────────────────────────────
    from app.modules.map.models import Center

    centers_by_code: dict[str, Center] = {}
    for cc, cn, lat, lng, addr, city, state in _CENTERS:
        c = Center(tenant_id=tid, center_code=cc, name=cn, latitude=lat,
                   longitude=lng, address=addr, city=city, state=state)
        db.add(c)
        centers_by_code[cc] = c
    db.flush()
    counts["centers"] = len(_CENTERS)

    # ── Phase 3: Users + org memberships ─────────────────────────────────────
    from app.modules.auth.models import User
    from app.modules.auth.security import hash_password

    pw = hash_password("HappyTails2024!")
    users: list[User] = []
    for email, sys_role in _USERS:
        u = User(email=email, password_hash=pw, tenant_id=tid, role=sys_role, is_active=True)
        db.add(u)
        users.append(u)
    db.flush()

    def _member(user_idx: int, org: Organization, role: str) -> None:
        db.add(OrganizationMember(user_id=users[user_idx].id, organization_id=org.id, role=role))

    # Enterprise-level roles
    _member(0, enterprise, "safety")           # Sarah Chen — Safety Director
    _member(1, enterprise, "hr")               # Michael Rodriguez — HR Manager
    # Area managers
    _member(2, areas[0], "area_manager")       # Jennifer Kim — Southeast
    _member(3, areas[1], "area_manager")       # David Patel — Northeast
    # District managers
    _member(4, districts[0], "district_manager")  # Marcus Johnson — FL
    _member(5, districts[1], "district_manager")  # Lisa Thompson — GA
    _member(6, districts[2], "district_manager")  # Robert Garcia — NY
    _member(7, districts[3], "district_manager")  # Emily Wong — PA
    _member(8, districts[4], "district_manager")  # James Davis — NE
    # Center managers — each covers a cluster of centers
    for c_idx in [0, 1]:           # FL-MIA, FL-ORL
        _member(9, center_orgs[c_idx], "center_manager")
    for c_idx in [2, 3, 4]:       # FL-TPA, FL-JAX, GA-ATL
        _member(10, center_orgs[c_idx], "center_manager")
    for c_idx in [5, 6, 7]:       # GA-SAV, GA-AUG, NY-MAN
        _member(11, center_orgs[c_idx], "center_manager")
    for c_idx in [8, 9, 10, 11]:  # NY-BRK, NY-QNS, NY-LIS, PA-PHL
        _member(12, center_orgs[c_idx], "center_manager")
    for c_idx in [12, 13, 14, 15]:# PA-PIT, PA-ALL, PA-REA, NE-BOS
        _member(13, center_orgs[c_idx], "center_manager")
    for c_idx in [16, 17, 18, 19]:# NE-PRV, NE-HRT, NE-WOR, NE-MAN
        _member(14, center_orgs[c_idx], "center_manager")

    db.flush()
    counts["users"] = len(users)

    # Convenience references
    safety_user = users[0]
    hr_user = users[1]
    area_mgr_se = users[2]
    area_mgr_ne = users[3]
    dist_mgr_fl = users[4]
    center_mgr_mia = users[9]
    center_mgr_ny = users[12]
    center_mgr_ne = users[13]

    # ── Phase 4: Incidents ────────────────────────────────────────────────────
    from app.modules.osha.intelligence import analyze
    from app.modules.osha.models import Incident

    incidents: list[Incident] = []
    for tmpl in _INCIDENTS:
        cc = tmpl["center_code"]
        sev = tmpl["reported_severity"]
        itype = tmpl["incident_type"]
        desc = tmpl["description"]
        intel = analyze(itype, desc, sev)
        adj = intel.adjusted_severity if intel.adjusted_severity != sev else None
        days = tmpl.get("days_ago", 30)
        org_id = center_orgs_by_code[cc].id if cc in center_orgs_by_code else None

        inc = Incident(
            tenant_id=tid,
            center_id=cc,
            incident_type=itype,
            description=desc,
            reported_severity=sev,
            status=tmpl.get("status", "open"),
            organization_id=org_id,
            category=intel.category,
            risk_score=intel.risk_score,
            recommendations=intel.recommendations,
            adjusted_severity=adj,
            explanation=intel.explanation,
            explanation_meta=intel.explanation_meta,
            employee_name=tmpl.get("employee_name"),
            job_title=tmpl.get("job_title"),
            date_of_injury=_date_ago(days) if tmpl.get("employee_name") else None,
            treatment_type=tmpl.get("treatment_type"),
            days_away=tmpl.get("days_away"),
            restricted_days=tmpl.get("restricted_days"),
            recordable=tmpl.get("recordable"),
            is_finalized=tmpl.get("is_finalized", False),
            created_at=_ago(days),
        )
        db.add(inc)
        incidents.append(inc)

    db.flush()
    counts["incidents"] = len(incidents)

    # ── Phase 5: Cases ────────────────────────────────────────────────────────
    from app.modules.cases.models import CaseTimeline, IncidentCase, IncidentComment, IncidentTask

    def _timeline_entry(case: IncidentCase, event_type: str, actor: User, details: dict | None = None) -> None:
        db.add(CaseTimeline(
            case_id=case.id, tenant_id=tid, actor_id=actor.id,
            event_type=event_type, details=details,
            created_at=case.created_at + timedelta(minutes=5),
        ))

    _SEV_PRIORITY = {"low": "low", "medium": "medium", "high": "high", "critical": "critical"}

    # Auto-create a case for every incident
    cases: list[IncidentCase] = []
    for inc in incidents:
        eff_sev = inc.adjusted_severity or inc.reported_severity
        priority = _SEV_PRIORITY.get(eff_sev, "medium")
        case = IncidentCase(
            incident_id=inc.id, tenant_id=tid, organization_id=inc.organization_id,
            status="new", priority=priority, escalation_level=0,
            created_at=inc.created_at + timedelta(minutes=2),
            updated_at=inc.created_at + timedelta(minutes=2),
        )
        db.add(case)
        cases.append(case)
    db.flush()

    # Write timeline case_created entry for every case
    for i, case in enumerate(cases):
        inc = incidents[i]
        db.add(CaseTimeline(
            case_id=case.id, tenant_id=tid, actor_id=actor_id,
            event_type="case_created",
            details={"incident_id": str(inc.id), "center_id": inc.center_id, "priority": case.priority},
            created_at=case.created_at,
        ))

    db.flush()

    # Enrich specific cases with assignments, tasks, comments, and escalations.
    # Index matches _INCIDENTS list order (0-29).

    def _assign(case: IncidentCase, assignee: User, role: str, new_status: str = "assigned") -> None:
        case.assigned_to_user_id = assignee.id
        case.assigned_role = role
        case.status = new_status
        db.add(CaseTimeline(
            case_id=case.id, tenant_id=tid, actor_id=actor_id,
            event_type="assigned",
            details={"assigned_to": str(assignee.id), "role": role, "new_status": new_status},
            created_at=case.created_at + timedelta(hours=1),
        ))

    def _add_task(case: IncidentCase, title: str, assignee: User,
                  due_days_from_now: int, completed: bool = False) -> IncidentTask:
        due = _now() + timedelta(days=due_days_from_now)
        t = IncidentTask(
            case_id=case.id, tenant_id=tid, title=title,
            assigned_to_user_id=assignee.id,
            completed=completed,
            completed_at=_now() - timedelta(days=1) if completed else None,
            due_date=due,
            created_at=case.created_at + timedelta(hours=2),
        )
        db.add(t)
        return t

    def _add_comment(case: IncidentCase, user: User, message: str,
                     visibility: str = "all", days_ago: int = 0) -> None:
        db.add(IncidentComment(
            case_id=case.id, tenant_id=tid, user_id=user.id,
            message=message, visibility=visibility,
            created_at=_ago(days_ago),
        ))

    def _escalate(case: IncidentCase, level: int, actor: User) -> None:
        case.escalation_level = level
        case.priority = "critical" if level >= 2 else "high"
        db.add(CaseTimeline(
            case_id=case.id, tenant_id=tid, actor_id=actor.id,
            event_type="escalated",
            details={"old_level": 0, "new_level": level},
            created_at=case.created_at + timedelta(hours=3),
        ))

    # Case 0 — Rosa Chen bite (closed, finalized)
    c = cases[0]
    _assign(c, center_mgr_mia, "center_manager", "resolved")
    _add_task(c, "Review dog behavior history and flag for behavior assessment", center_mgr_mia, -5, completed=True)
    _add_task(c, "Submit OSHA 300 log entry for bite injury", safety_user, -10, completed=True)
    _add_task(c, "Conduct all-staff refresher on animal handling protocols", center_mgr_mia, -2, completed=True)
    _add_comment(c, center_mgr_mia, "Incident fully documented. Rosa returned to full duty on day 12. Bite dog flagged for mandatory behavior evaluation before re-admission.", days_ago=78)
    _add_comment(c, safety_user, "OSHA 300 log updated. Incident classified as days away from work. No further regulatory action required.", visibility="management_only", days_ago=75)
    c.status = "closed"

    # Case 1 — Derek Norris slip/fall wrist fracture
    c = cases[1]
    _assign(c, dist_mgr_fl, "district_manager", "investigating")
    _add_task(c, "Install wet floor signage protocol at all wash bay entrances", center_mgr_mia, -30, completed=True)
    _add_task(c, "Conduct slip/fall hazard walk for all FL locations", dist_mgr_fl, -25, completed=True)
    _add_task(c, "Update return-to-duty timeline with HR", hr_user, -20, completed=True)
    _add_comment(c, dist_mgr_fl, "Root cause confirmed: no wet floor sign was placed before wash bay cleaning. Updated SOP to require signage before any wet operation begins.", days_ago=65)
    _add_comment(c, hr_user, "Workers comp claim filed. Return to work plan reviewed with employee and occupational health. Full release expected in 6 weeks.", visibility="hr_only", days_ago=60)
    c.status = "closed"

    # Case 2 — Priya Nair chemical exposure (critical, closed)
    c = cases[2]
    _assign(c, safety_user, "safety", "investigating")
    _escalate(c, 2, area_mgr_se)
    _add_task(c, "Replace all unlabeled chemical containers facility-wide", center_mgr_mia, -40, completed=True)
    _add_task(c, "Conduct hazmat training for all grooming staff", safety_user, -35, completed=True)
    _add_task(c, "Install secondary containment in chemical storage room", center_mgr_mia, -30, completed=True)
    _add_task(c, "Document SDS review with all affected staff", safety_user, -25, completed=True)
    _add_comment(c, safety_user, "Air quality test completed. Chloramine levels confirmed above safe threshold. Root cause: two incompatible products mixed without reading labels.", days_ago=53)
    _add_comment(c, area_mgr_se, "This is the second chemical incident in the southeast region this quarter. Mandating hazmat refresher for all groomers across FL and GA. Safety Director to lead.", days_ago=50)
    _add_comment(c, hr_user, "Employee stable. Hospitalization expense covered under workers comp. Priya returned to full duty.", visibility="hr_only", days_ago=48)
    c.status = "closed"

    # Case 4 — Marcus Wright back strain (recordable, investigating)
    c = cases[4]
    _assign(c, hr_user, "hr", "investigating")
    _add_task(c, "Assess mechanical lift availability at all PA locations", safety_user, 5)
    _add_task(c, "Schedule ergonomics training for kennel staff", safety_user, 7)
    _add_task(c, "Obtain occupational medicine clearance for restricted duty return", hr_user, 3)
    _add_comment(c, hr_user, "Occupational medicine evaluation completed. Employee on restricted duty — no lifting over 20 lbs. Estimated full release in 2 weeks.", visibility="hr_only", days_ago=30)
    _add_comment(c, safety_user, "No mechanical lift available at PA-PHL. Interim protocol: two-person lift required for dogs over 50 lbs. Mechanical lift purchase request submitted.", days_ago=28)

    # Case 5 — Alicia Torres bite (escalated)
    c = cases[5]
    _assign(c, safety_user, "safety", "investigating")
    _escalate(c, 1, area_mgr_ne)
    _add_task(c, "Audit intake system bite history flagging for all NE locations", safety_user, 3)
    _add_task(c, "Implement mandatory bite history review in check-in protocol", center_mgr_ne, 7)
    _add_task(c, "File OSHA restricted work activity record", safety_user, 2)
    _add_comment(c, safety_user, "Investigation confirmed: dog had a prior bite notation from a previous visit but the flag did not appear at check-in. IT ticket opened to fix data display in intake screen.", days_ago=18)
    _add_comment(c, area_mgr_ne, "Escalated to safety director for region-wide review of intake protocol. This is a system-level gap, not an individual error.", days_ago=16)

    # Case 6 — Sam Park slip on icy walkway (escalated, assigned)
    c = cases[6]
    _assign(c, center_mgr_ny, "center_manager", "assigned")
    _escalate(c, 1, dist_mgr_fl)
    _add_task(c, "Audit all exterior walkways for ice mitigation compliance", center_mgr_ny, -3, completed=True)
    _add_task(c, "Install outdoor thermometer at rear entrance for staff awareness", center_mgr_ny, 5)
    _add_task(c, "Update winter preparedness SOP with ice treatment schedule", safety_user, 10)
    _add_comment(c, center_mgr_ny, "Rear entrance de-iced and treated. Morning checklist updated to include ice check before opening.", days_ago=12)

    # Case 7 — Victor Reyes hand laceration (new, just submitted)
    c = cases[7]
    _assign(c, center_mgr_mia, "center_manager", "assigned")
    _add_task(c, "Audit maintenance tooling inventory for PPE compliance", center_mgr_mia, 3)
    _add_task(c, "Ensure cut-resistant gloves are available at all maintenance stations", center_mgr_mia, 2)
    _add_task(c, "Review lockout/tagout procedures for gate repair work", safety_user, 5)

    # Case 14 — GA-ATL severe dog fight (critical, escalated)
    c = cases[14]
    _assign(c, safety_user, "safety", "investigating")
    _escalate(c, 2, area_mgr_se)
    _add_task(c, "Ban pit bull from facility pending behavior evaluation", center_mgr_mia, -25, completed=True)
    _add_task(c, "Inspect and reinforce all kennel divider panels at GA-ATL", center_mgr_mia, -20, completed=True)
    _add_task(c, "Review breed restriction and temperament screening policy", safety_user, -10, completed=True)
    _add_task(c, "Submit veterinary bills for owner liability claim", hr_user, 2)
    _add_comment(c, safety_user, "Both dogs received veterinary treatment. The pit bull is banned from the facility. Kennel divider panels in building A reinforced with additional hardware.", days_ago=35)
    _add_comment(c, area_mgr_se, "This is the second fight involving this dog. We are reviewing breed acceptance policy with legal. Tenant liability questions flagged to counsel.", visibility="legal_only", days_ago=33)

    # Case 27 — NY-MAN HVAC failure (critical, escalated)
    c = cases[27]
    _assign(c, safety_user, "safety", "investigating")
    _escalate(c, 1, area_mgr_ne)
    _add_task(c, "Obtain HVAC inspection report and service history", center_mgr_ne, -20, completed=True)
    _add_task(c, "Establish heat emergency protocol for all NY locations", safety_user, 5)
    _add_task(c, "Install backup cooling plan (portable units on standby) for summer", center_mgr_ne, 14)
    _add_comment(c, center_mgr_ne, "HVAC unit replaced under maintenance contract. Portable unit on standby for this summer. Service contract updated to include quarterly inspections.", days_ago=26)

    # Case 21 — GA-AUG sanitation (investigating)
    c = cases[21]
    _assign(c, dist_mgr_fl, "district_manager", "investigating")
    _add_task(c, "Implement daily sanitation checklist sign-off for cat wing", center_mgr_mia, 3)
    _add_task(c, "Audit staffing schedule to eliminate cleaning gaps", dist_mgr_fl, 5)
    _add_comment(c, dist_mgr_fl, "Root cause: shift transitions were not handing off cleaning responsibilities clearly. Duty roster updated with explicit cleaning ownership per shift.", days_ago=48)

    # Case 23 — PA-PHL food contamination (investigating)
    c = cases[23]
    _assign(c, safety_user, "safety", "investigating")
    _add_task(c, "Inspect all food storage areas for moisture and elevation compliance", safety_user, 2)
    _add_task(c, "Replace all floor-level food storage bins with elevated shelving", center_mgr_ne, 7)
    _add_comment(c, safety_user, "12 dog owners notified. No illness reports received. Mold contamination confirmed by visual inspection. Root cause: bin stored below drain level. All remaining storage reviewed.", days_ago=22)

    db.flush()
    counts["cases"] = len(cases)

    # ── Phase 5.5: Backfill operational risk scores ───────────────────────────
    try:
        from app.modules.signals.risk_scoring import apply_risk_score
        for inc in incidents:
            apply_risk_score(db, inc.id, tid)
        db.flush()
    except Exception:
        pass  # Non-fatal — risk scores are best-effort in seed

    # ── Phase 6: OSHA data ────────────────────────────────────────────────────
    from app.modules.osha.audit import initial_audit_entries, write_audit_entries
    from app.modules.osha.models import IncidentAuditLog, OshaLog
    from app.modules.safety.models import OSHAPosting, OSHARetentionRecord

    # Write audit entries for all recordable incidents
    osha_case_num = 1
    for i, tmpl in enumerate(_INCIDENTS):
        inc = incidents[i]
        if not tmpl.get("recordable"):
            continue
        audited_changes = initial_audit_entries(inc)
        if audited_changes:
            write_audit_entries(db, inc.id, audited_changes, changed_by="demo-seed")

    # Create OshaLog entries for recordable incidents
    osha_class_map = {
        "days_away": "days_away",
        "restricted": "restricted",
        "other": "other",
    }
    year = _now().year
    for i, tmpl in enumerate(_INCIDENTS):
        if not tmpl.get("recordable"):
            continue
        inc = incidents[i]
        osha_class = osha_class_map.get(tmpl.get("osha_class", "other"), "other")
        db.add(OshaLog(
            incident_id=inc.id,
            center_id=inc.center_id,
            year=year if tmpl.get("days_ago", 0) < 180 else year - 1,
            case_number=osha_case_num,
            classification=osha_class,
            days_away=inc.days_away or 0,
            restricted_days=inc.restricted_days or 0,
            tenant_id=tid,
            created_at=inc.created_at + timedelta(hours=4),
        ))
        osha_case_num += 1

    # OSHA retention records for finalized incidents
    for i, tmpl in enumerate(_INCIDENTS):
        if not tmpl.get("is_finalized"):
            continue
        inc = incidents[i]
        for form_type in ("301", "300"):
            from app.modules.safety.models import _retention_expires
            db.add(OSHARetentionRecord(
                tenant_id=tid,
                incident_id=inc.id,
                osha_form_type=form_type,
                calendar_year=year,
                finalized_at=inc.created_at + timedelta(days=7),
                retention_expires_at=_retention_expires(year),
            ))

    # OSHA Postings — prior year posted, current year pending
    prior_year = year - 1
    db.add(OSHAPosting(
        tenant_id=tid,
        year=prior_year,
        generated_at=datetime(prior_year, 12, 20, tzinfo=timezone.utc),
        posted_at=datetime(prior_year + 1, 2, 1, tzinfo=timezone.utc),
        posted_by_user_id=safety_user.id,
        acknowledgement_notes="Posted in all facilities per 29 CFR 1904.32 requirement.",
        form_300a_snapshot={
            "year": prior_year,
            "total_recordable": 6,
            "days_away_cases": 3,
            "restricted_cases": 2,
            "other_cases": 1,
            "total_days_away": 14,
            "total_restricted_days": 68,
        },
    ))
    db.add(OSHAPosting(
        tenant_id=tid,
        year=year,
        generated_at=_now() - timedelta(days=5),
        posted_at=None,
        posted_by_user_id=None,
        acknowledgement_notes=None,
        form_300a_snapshot=None,
    ))

    db.flush()
    counts["osha_logs"] = osha_case_num - 1
    counts["osha_postings"] = 2

    # ── Phase 7: Inspections ──────────────────────────────────────────────────
    from app.modules.inspections.models import (
        INSPECTION_TEMPLATES, SEVERITY_DEDUCTION, Inspection, InspectionItem,
    )

    _INSPECTION_SCENARIOS = [
        # (center_code, itype, days_ago, pass_pattern, title)
        # pass_pattern: list of (item_idx, result) overrides; default is "pass"
        ("FL-MIA", "general",    72, [(4, "fail")],             "Monthly Safety Walk — Building A"),
        ("FL-ORL", "kennel",     65, [],                         "Weekly Kennel Check"),
        ("FL-TPA", "sanitation", 60, [(1, "fail"), (3, "fail")], "Sanitation Compliance Audit"),
        ("GA-ATL", "safety",     55, [(0, "fail"), (2, "fail"), (5, "fail")], "Post-Incident Safety Review"),
        ("NY-MAN", "equipment",  48, [(0, "fail")],             "Equipment Inspection Q2"),
        ("PA-PHL", "general",    40, [],                         "Quarterly Safety Walk"),
        ("NE-BOS", "kennel",     33, [(2, "fail")],             "Kennel Standards Audit"),
        ("GA-SAV", "sanitation", 27, [],                         "Monthly Sanitation Check"),
        ("NY-BRK", "general",    18, [(4, "fail"), (7, "fail")], "Surprise Spot Inspection"),
        ("FL-JAX", "safety",     10, [],                         "Weekly Safety Check"),
    ]

    inspections: list[Inspection] = []
    for cc, itype, days, overrides, title in _INSPECTION_SCENARIOS:
        template_items = INSPECTION_TEMPLATES[itype]
        override_map = dict(overrides)
        score = 100
        for idx, (_, sev) in enumerate(template_items):
            if idx in override_map:
                result = override_map[idx]
                if result == "fail":
                    score -= SEVERITY_DEDUCTION.get(sev, 5)

        status = "passed" if score >= 70 else "failed"
        insp = Inspection(
            tenant_id=tid,
            center_code=cc,
            created_by_user_id=actor_id,
            title=title,
            inspection_type=itype,
            status=status,
            score=score,
            completed_at=_ago(days),
            created_at=_ago(days, hours=11),
        )
        db.add(insp)
        inspections.append(insp)
        db.flush()

        for idx, (label, sev) in enumerate(template_items):
            result = override_map.get(idx, "pass")
            notes = "Deficiency noted — corrective action required." if result == "fail" else None
            db.add(InspectionItem(
                inspection_id=insp.id, tenant_id=tid, sort_order=idx,
                label=label, severity=sev, result=result, notes=notes,
                created_at=_ago(days, hours=10),
            ))

    db.flush()
    counts["inspections"] = len(inspections)

    # ── Phase 8: Evidence ─────────────────────────────────────────────────────
    from app.modules.evidence.models import EvidenceFile, EvidenceNote

    _EVIDENCE = [
        # (case_idx, file_name, category, visibility, mime_type, size_kb, ai_summary, tags, signals_key)
        (0,  "rosa_chen_bite_photo.jpg",         "injury_photo",      "management_only", "image/jpeg",       245, "Photographic documentation of bite wound on right forearm, consistent with reported canine bite. Wound appears approximately 3 cm in length with jagged edges.", ["Injury Photo", "Photo", "High Priority"], "injury_photo"),
        (0,  "canine_vaccination_records.pdf",   "osha_form",         "all",             "application/pdf",  180, "PDF document containing vaccination records for the implicated dog. Rabies vaccination current. No prior bite history documented in this file.", ["OSHA Form", "PDF", "Vaccination"], "osha_form"),
        (2,  "chemical_incident_sds_review.pdf", "osha_form",         "all",             "application/pdf",  420, "Safety Data Sheet review document for the two chemicals involved in the mixing incident. SDS confirms chemical incompatibility when mixed. OSHA reference citations included.", ["OSHA Form", "PDF", "Chemical"], "osha_form"),
        (2,  "priya_nair_witness_statement.pdf", "witness_statement",  "hr_only",        "application/pdf",  95,  "Written witness statement from co-worker who observed the chemical mixing event. States the employee did not read the product labels before combining solutions. Consistent with investigation findings.", ["Witness Statement", "PDF", "HR Sensitive"], "witness_statement"),
        (4,  "marcus_wright_medical_eval.pdf",   "hr_document",       "hr_only",         "application/pdf",  310, "Occupational medicine evaluation report for Marcus Wright. Confirms L4-L5 strain with restricted duty recommendation. Return to full duty estimated in 14 days pending symptom resolution.", ["HR Document", "PDF", "Medical"], "hr_document"),
        (5,  "bite_history_intake_screenshot.jpg","inspection_report", "management_only", "image/jpeg",      88,  "Screenshot of the intake management system showing the dog profile at time of check-in. The prior bite flag is visible in the record history but was not surfaced in the active check-in screen — confirmed UI bug.", ["Inspection Report", "Photo", "System Issue"], "inspection_report"),
        (14, "dog_fight_kennel_damage.jpg",      "injury_photo",      "all",             "image/jpeg",       512, "Photograph showing broken kennel divider panel in Building A following the dog fight. Panel hardware completely failed at the hinge point. Consistent with a force-impact breach.", ["Injury Photo", "Photo", "Structural Damage"], "injury_photo"),
        (14, "veterinary_report_both_dogs.pdf",  "workers_comp",      "hr_only",         "application/pdf",  380, "Veterinary treatment report for both dogs involved in the altercation. One dog required wound closure (5 stitches). Second dog treated for contusions. Owner liability exposure documented.", ["Workers Comp", "PDF", "Veterinary"], "workers_comp"),
        (27, "hvac_failure_report.pdf",          "inspection_report", "all",             "application/pdf",  220, "HVAC service company diagnostic report. Compressor failure identified as root cause. Unit had not received scheduled maintenance in 18 months despite facility contract. All 20 center units to be re-inspected.", ["Inspection Report", "PDF", "Equipment"], "inspection_report"),
        (6,  "icy_walkway_photo.jpg",            "injury_photo",      "all",             "image/jpeg",       198, "Photo of rear entrance walkway taken after the incident. Ice and snow visible on concrete surface. No warning signage or de-icing material visible in the frame.", ["Injury Photo", "Photo", "Slip Hazard"], "injury_photo"),
        (21, "sanitation_audit_log.pdf",         "inspection_report", "all",             "application/pdf",  155, "14-day sanitation log for the cat boarding wing at GA-AUG. Six days show incomplete sign-off entries. Cross-referenced with scheduling records confirms understaffing during evening shift transitions.", ["Inspection Report", "PDF", "Compliance Gap"], "inspection_report"),
        (23, "food_storage_photo.jpg",           "injury_photo",      "all",             "image/jpeg",       302, "Photo of contaminated food storage bin location showing position on floor directly adjacent to exterior floor drain. Moisture seepage visible on bottom corner of bin. Mold confirmed visually.", ["Photo", "Contamination", "Evidence"], "general"),
    ]

    _SIGNALS = {
        "injury_photo":      [{"signal": "visual_evidence",   "severity": "high",     "description": "Photographic evidence of injury — OSHA recordability likely"}],
        "osha_form":         [{"signal": "osha_documentation","severity": "high",     "description": "OSHA form or regulatory document — ensure 300 log updated"}, {"signal": "regulatory_obligation", "severity": "high", "description": "Regulatory filing obligation — verify deadlines"}],
        "witness_statement": [{"signal": "witness_account",   "severity": "medium",   "description": "Witness testimony recorded — preserve chain of custody"}],
        "hr_document":       [{"signal": "hr_involvement",    "severity": "medium",   "description": "HR documentation — handle with appropriate confidentiality"}],
        "workers_comp":      [{"signal": "workers_comp_claim","severity": "high",     "description": "Workers compensation documentation attached"}],
        "inspection_report": [{"signal": "compliance_gap",   "severity": "medium",   "description": "Inspection record may indicate compliance requirements"}],
        "general":           [{"signal": "evidence_attached", "severity": "low",      "description": "Supplementary evidence attached to incident record"}],
    }

    for ev_tuple in _EVIDENCE:
        c_idx, fname, category, visibility, mime, size_kb, summary, tags, sig_key = ev_tuple
        case = cases[c_idx]
        ef = EvidenceFile(
            tenant_id=tid,
            case_id=case.id,
            incident_id=incidents[c_idx].id,
            uploaded_by_user_id=actor_id,
            file_name=fname,
            file_type=mime,
            storage_path=f"/demo/evidence/{fname}",
            file_size=size_kb * 1024,
            category=category,
            visibility=visibility,
            ai_processed=True,
            uploaded_at=case.created_at + timedelta(hours=6),
        )
        db.add(ef)
        db.flush()
        db.add(EvidenceNote(
            evidence_file_id=ef.id,
            extracted_text=f"[Demo extracted text for {fname}]",
            ai_summary=summary,
            ai_tags=tags,
            ai_risk_signals=_SIGNALS.get(sig_key, _SIGNALS["general"]),
            created_at=case.created_at + timedelta(hours=7),
        ))

    db.flush()
    counts["evidence_files"] = len(_EVIDENCE)

    # ── Phase 9: Automation events ────────────────────────────────────────────
    from app.modules.automation.models import AutomationEvent

    _AUTO_EVENTS = [
        ("incident_created",    "critical", incidents[2].center_id, {"incident_id": str(incidents[2].id), "trigger": "critical severity at intake"}),
        ("case_escalated",      "critical", incidents[14].center_id,{"case_id": str(cases[14].id), "escalation_level": 2, "trigger": "second fight incident same dog"}),
        ("osha_recordable",     "high",     incidents[0].center_id, {"incident_id": str(incidents[0].id), "classification": "days_away", "trigger": "auto-classified recordable"}),
        ("osha_recordable",     "high",     incidents[1].center_id, {"incident_id": str(incidents[1].id), "classification": "restricted", "trigger": "auto-classified recordable"}),
        ("osha_recordable",     "high",     incidents[3].center_id, {"incident_id": str(incidents[3].id), "classification": "restricted", "trigger": "auto-classified recordable"}),
        ("case_escalated",      "high",     incidents[5].center_id, {"case_id": str(cases[5].id), "escalation_level": 1, "trigger": "prior bite history gap"}),
        ("incident_created",    "high",     incidents[27].center_id,{"incident_id": str(incidents[27].id), "trigger": "critical HVAC failure"}),
        ("task_overdue",        "medium",   incidents[4].center_id, {"case_id": str(cases[4].id), "task": "Assess mechanical lift availability", "trigger": "due date passed"}),
        ("inspection_failed",   "high",     "GA-ATL",               {"inspection_title": "Post-Incident Safety Review", "score": 40, "trigger": "3 critical fails"}),
        ("osha_posting_due",    "medium",   None,                   {"year": year, "due_date": f"{year}-02-01", "trigger": "annual posting reminder"}),
    ]

    for i, (event_type, severity, center_id, payload) in enumerate(_AUTO_EVENTS):
        db.add(AutomationEvent(
            tenant_id=tid,
            event_type=event_type,
            severity=severity,
            payload={**payload, "center_id": center_id},
            created_at=_ago(80 - i * 6),
            processed_at=_ago(80 - i * 6, hours=-1) if i < 7 else None,
        ))

    db.flush()
    counts["automation_events"] = len(_AUTO_EVENTS)

    # ── Phase 10: Notifications ───────────────────────────────────────────────
    from app.modules.notifications.models import Notification

    _NOTIFS = [
        (safety_user,     "escalated",     "Escalation: Critical Dog Fight at GA-ATL",       "A severity-2 escalation requires your immediate attention. Two dogs hospitalized.", str(cases[14].id)),
        (area_mgr_se,     "escalated",     "Escalation Requires Area Manager Review",         "Case escalated to area level. Dog fight at GA-ATL — please review and coordinate response.", str(cases[14].id)),
        (hr_user,         "case_assigned", "New OSHA Recordable — Priya Nair",                "A critical chemical exposure incident has been assigned to HR for workers comp coordination.", str(cases[2].id)),
        (safety_user,     "case_assigned", "OSHA Investigation: Marcus Wright Back Strain",   "Restricted-duty incident assigned to Safety for OSHA review and documentation.", str(cases[4].id)),
        (center_mgr_ne,   "case_assigned", "New Case: Sam Park Slip & Fall",                  "Incident at NY-BRK assigned for investigation. Employee on restricted duty.", str(cases[6].id)),
        (safety_user,     "escalated",     "Escalation: Bite Incident — Alicia Torres",       "Prior bite history gap identified. Intake system issue flagged. Case escalated.", str(cases[5].id)),
        (area_mgr_ne,     "case_updated",  "HVAC Failure Case Updated — NY-MAN",              "HVAC replacement confirmed. Backup cooling plan created. Case progressing.", str(cases[27].id)),
        (safety_user,     "overdue",       "Overdue: OSHA 300 Posting for Current Year",      "Annual Form 300A posting is scheduled. Ensure all facilities are compliant by Feb 1.", None),
        (hr_user,         "case_assigned", "Workers Comp: Dog Fight Veterinary Claim",        "Owner liability claim documentation attached. Legal review recommended.", str(cases[14].id)),
        (dist_mgr_fl,     "case_updated",  "Sanitation Audit Case Updated — GA-AUG",          "Root cause confirmed: shift transition gap. Duty roster updated. Case under review.", str(cases[21].id)),
        (safety_user,     "case_assigned", "New Case: Victor Reyes Hand Laceration",          "Recordable injury at FL-TPA. OSHA documentation required within 7 days.", str(cases[7].id)),
        (center_mgr_mia,  "task_assigned", "Task: Audit Maintenance PPE Inventory",           "New task assigned: ensure cut-resistant gloves available at all maintenance stations.", None),
        (safety_user,     "case_updated",  "Case Closed: Rosa Chen Bite — FL-MIA",            "Incident fully resolved. OSHA 300 log updated. Dog flagged for behavior assessment.", str(cases[0].id)),
        (hr_user,         "case_updated",  "Case Closed: Derek Norris Fracture — FL-JAX",     "Employee returned to full duty. Wet floor protocol updated enterprise-wide.", str(cases[1].id)),
        (area_mgr_ne,     "escalated",     "Escalation: Sam Park Slip — NY-BRK",              "Ice walkway incident escalated. Regional winter preparedness SOP review recommended.", str(cases[6].id)),
    ]

    for i, (user, ntype, title, message, resource_id) in enumerate(_NOTIFS):
        db.add(Notification(
            tenant_id=tid,
            user_id=user.id,
            notification_type=ntype,
            title=title,
            message=message,
            resource_type="case" if resource_id else None,
            resource_id=uuid.UUID(resource_id) if resource_id else None,
            is_read=i < 7,   # first 7 are read; last 8 are unread for demo freshness
            created_at=_ago(max(0, 60 - i * 3)),
        ))

    db.flush()
    counts["notifications"] = len(_NOTIFS)

    # ── Phase 10.5: Corrective Actions ───────────────────────────────────────
    from app.modules.corrective_actions.models import CorrectiveAction

    _CA_DATA = [
        # (case_idx, title, root_cause, assignee, status, due_offset_days, notes)
        # Case 0 — Rosa Chen bite (closed, all completed)
        (0, "Flag dog's aggression history in intake profile system",
            "process_gap", safety_user, "completed", -70,
            "Bite dog's profile updated with mandatory behavior flag. Pre-admission behavioral evaluation required."),
        (0, "All-staff refresher on safe animal handling and bite prevention",
            "training", center_mgr_mia, "completed", -65,
            "14 FL-MIA staff completed refresher. Sign-off sheet filed with HR and safety director."),
        # Case 2 — Priya Nair chemical (2 completed, 1 needs_verification)
        (2, "Replace all unlabeled chemical containers and verify SDS binder completeness",
            "process_gap", safety_user, "completed", -42,
            "All 38 chemical containers replaced and labeled. SDS binder audited and updated for all products."),
        (2, "Mandatory hazmat handling and chemical incompatibility training for grooming staff",
            "training", safety_user, "completed", -30,
            "13 grooming staff trained across FL and GA. Training records filed. Annual re-certification scheduled."),
        (2, "Install secondary containment shelving in chemical storage room",
            "facility", center_mgr_mia, "needs_verification",  -3,
            "Shelving installed. Awaiting final safety inspection from area director before closing."),
        # Case 4 — Marcus Wright back strain
        (4, "Source and install mechanical lift assist equipment at PA-PHL",
            "equipment", center_mgr_ne, "in_progress", 14,
            "Purchase order approved. Two-person lift protocol enforced in interim for dogs over 50 lbs."),
        (4, "Ergonomics and safe lifting training for all kennel staff",
            "training", safety_user, "open", 21, None),
        # Case 5 — Alicia Torres bite (intake system gap)
        (5, "Fix intake check-in UI to surface prior bite history flags prominently",
            "process_gap", safety_user, "in_progress", 7,
            "IT ticket opened. Developer confirmed fix in next sprint. Interim: staff manually check notes tab."),
        (5, "Audit bite history data completeness across all NE locations",
            "process_gap", area_mgr_ne, "open", 10, None),
        # Case 6 — Sam Park slip
        (6, "Install outdoor thermometer at rear entrance with cold-weather alert protocol",
            "process_gap", center_mgr_ny, "completed", -10,
            "Thermometer installed. Morning safety checklist updated to include ice check. Posted at rear entrance."),
        (6, "Update enterprise winter preparedness SOP with de-icing schedule and salt stock levels",
            "process_gap", safety_user, "open", 10, None),
        # Case 14 — GA-ATL dog fight
        (14, "Inspect and reinforce all kennel divider panels at GA-ATL",
             "facility", center_mgr_mia, "completed", -22,
             "All 48 divider panels inspected. 3 additional panels reinforced. Structural integrity confirmed."),
        (14, "Revise breed acceptance and temperament screening policy enterprise-wide",
             "process_gap", safety_user, "completed", -12,
             "Updated policy published. Breed watch list now requires certified temperament evaluation at intake."),
        (14, "Obtain and process veterinary liability claim documentation from dog owner",
             "process_gap", hr_user, "in_progress", 3,
             "Vet bills received from both owners. Legal review initiated. Expected settlement estimate this week."),
        # Case 27 — HVAC failure
        (27, "Establish heat emergency protocol with minimum cooling thresholds for all centers",
             "process_gap", safety_user, "completed", -18,
             "Emergency protocol documented. Threshold set at 78°F ambient. Protocol distributed to all 20 centers."),
        (27, "Implement portable cooling unit standby program for summer operations",
             "equipment", center_mgr_ne, "in_progress", 21,
             "3 portable units ordered for NY district. Deployment plan under review by operations."),
    ]

    ca_list: list[CorrectiveAction] = []
    for c_idx, title, root_cause, assignee, ca_status, due_offset, notes in _CA_DATA:
        case = cases[c_idx]
        due_dt = _now() + timedelta(days=due_offset) if due_offset is not None else None
        completed_dt = (_now() + timedelta(days=due_offset - 3)) if ca_status == "completed" and due_offset else None
        ca = CorrectiveAction(
            tenant_id=tid,
            case_id=case.id,
            incident_id=incidents[c_idx].id,
            title=title,
            root_cause=root_cause,
            assigned_to_user_id=assignee.id,
            assigned_to_name=assignee.email.split("@")[0].replace(".", " ").title(),
            status=ca_status,
            due_date=due_dt,
            completed_at=completed_dt,
            notes=notes,
            created_by_user_id=safety_user.id,
            created_at=case.created_at + timedelta(hours=8),
            updated_at=case.created_at + timedelta(hours=8),
        )
        db.add(ca)
        ca_list.append(ca)
        db.add(CaseTimeline(
            case_id=case.id, tenant_id=tid, actor_id=safety_user.id,
            event_type="corrective_action_added",
            details={"title": title, "root_cause": root_cause},
            created_at=case.created_at + timedelta(hours=9),
        ))
        if ca_status in ("completed", "needs_verification"):
            db.add(CaseTimeline(
                case_id=case.id, tenant_id=tid, actor_id=assignee.id,
                event_type="corrective_action_completed",
                details={"title": title},
                created_at=_now() + timedelta(days=due_offset - 1) if due_offset else _now() - timedelta(days=5),
            ))

    db.flush()
    counts["corrective_actions"] = len(ca_list)

    # ── Phase 10.6: Witness Statements ────────────────────────────────────────
    from app.modules.witness.models import WitnessStatement

    _WITNESS_DATA = [
        # (case_idx, name, role, shift, observed, intervened, statement, days_ago)
        # Case 2 — Priya Nair chemical exposure
        (2, "David Huang", "Dog Groomer", "morning", True, False,
         "I was at the grooming station next to Priya when it happened. She was cleaning the dryers and had two spray bottles out. I didn't see her read the labels before combining them. Within about two minutes there was a sharp chemical odor and she began coughing heavily. I called out to the manager and helped her get outside immediately.", 57),
        (2, "Carmen Reyes", "Shift Supervisor", "morning", False, True,
         "I received David's call and arrived within two minutes. Priya was already outside and showing signs of respiratory distress — watering eyes, persistent cough. I called 911 immediately and ensured the grooming bay was evacuated. I did not witness the initial mixing, only the aftermath.", 57),
        # Case 5 — Alicia Torres bite
        (5, "Marcus Webb", "Kennel Attendant", "afternoon", True, True,
         "I was supervising the group play session when the bite happened. Alicia was separating two dogs that had bumped into each other, and the dachshund redirected and bit her right hand. I called for help immediately and applied pressure to the wound with a clean towel while waiting for the manager. The dog had been calm throughout the session until that moment.", 21),
        (5, "Jordan Cole", "Day Care Coordinator", "afternoon", True, False,
         "I was at the far end of the play yard. I saw the dachshund become agitated after the collision with the other dog — it was a sudden shift. I was walking toward them but Alicia was closer and reached the dogs first. The bite occurred within seconds of the initial contact. Alicia responded quickly and didn't panic.", 21),
        # Case 14 — GA-ATL dog fight
        (14, "Leon Matthews", "Overnight Boarding Staff", "overnight", True, True,
         "I was doing kennel rounds when I heard the panel crack. The pit bull had pushed through the divider and attacked the adjacent golden retriever. I used the break stick per protocol and separated them within about 30 seconds. Both dogs had visible wounds. I called the manager immediately and kept the dogs contained while waiting.", 39),
        (14, "Stephanie Cruz", "Shift Supervisor", "overnight", True, False,
         "I was in the office when Leon called. I arrived within two minutes. Leon had the situation contained but both dogs were clearly injured. The kennel panel was completely displaced — it looked like the mount hardware had already been weakened. I coordinated emergency vet transport and owner notification. This was the second fight we've had in that dog's second stay.", 39),
        # Case 6 — Sam Park slip
        (6, "Tony Barros", "Kennel Technician", "morning", True, False,
         "I saw Sam slip as he came in through the rear entrance. He was carrying a supply crate and didn't see the ice patch along the wall. He went down hard on his left side. I called for the manager and stayed with him until medical could evaluate him. The ice had been there since the previous night — we had run out of de-icing salt the afternoon before.", 14),
    ]

    ws_list: list[WitnessStatement] = []
    for c_idx, wname, wrole, shift, observed, intervened, statement, days_ago in _WITNESS_DATA:
        case = cases[c_idx]
        ws = WitnessStatement(
            tenant_id=tid,
            case_id=case.id,
            incident_id=incidents[c_idx].id,
            witness_name=wname,
            witness_role=wrole,
            shift_at_time=shift,
            observed_directly=observed,
            intervention_attempted=intervened,
            statement=statement,
            statement_timestamp=_ago(days_ago),
            recorded_by_user_id=safety_user.id,
            created_at=_ago(days_ago, hours=-2),
        )
        db.add(ws)
        ws_list.append(ws)
        db.add(CaseTimeline(
            case_id=case.id, tenant_id=tid, actor_id=safety_user.id,
            event_type="witness_statement_added",
            details={"witness_name": wname, "observed_directly": observed},
            created_at=_ago(days_ago, hours=-2),
        ))

    db.flush()
    counts["witness_statements"] = len(ws_list)

    # ── Phase 10.7: Narrative Scenario Incidents ──────────────────────────────
    # Interconnected story arcs that activate pattern detection signals.
    # These incidents have timestamps close together so the signal detector fires.

    from app.modules.osha.intelligence import analyze as _analyze

    narrative_incidents: list[Incident] = []
    narrative_cases: list[IncidentCase] = []

    for tmpl in _NARRATIVE_INCIDENTS:
        cc = tmpl["center_code"]
        sev = tmpl["reported_severity"]
        itype = tmpl["incident_type"]
        desc = tmpl["description"]
        intel = _analyze(itype, desc, sev)
        adj = intel.adjusted_severity if intel.adjusted_severity != sev else None
        days = tmpl.get("days_ago", 7)
        org_id = center_orgs_by_code[cc].id if cc in center_orgs_by_code else None

        ninc = Incident(
            tenant_id=tid,
            center_id=cc,
            incident_type=itype,
            description=desc,
            reported_severity=sev,
            status=tmpl.get("status", "open"),
            organization_id=org_id,
            category=intel.category,
            risk_score=intel.risk_score,
            recommendations=intel.recommendations,
            adjusted_severity=adj,
            explanation=intel.explanation,
            explanation_meta=intel.explanation_meta,
            employee_name=tmpl.get("employee_name"),
            job_title=tmpl.get("job_title"),
            date_of_injury=_date_ago(days) if tmpl.get("employee_name") else None,
            treatment_type=tmpl.get("treatment_type"),
            days_away=tmpl.get("days_away"),
            restricted_days=tmpl.get("restricted_days"),
            recordable=tmpl.get("recordable"),
            is_finalized=tmpl.get("is_finalized", False),
            created_at=_ago(days),
        )
        db.add(ninc)
        narrative_incidents.append(ninc)

    db.flush()

    # Risk score backfill for narrative incidents
    try:
        from app.modules.signals.risk_scoring import apply_risk_score as _ars
        for ninc in narrative_incidents:
            _ars(db, ninc.id, tid)
        db.flush()
    except Exception:
        pass

    # Auto-create cases for narrative incidents — flush first to get IDs
    for ninc in narrative_incidents:
        eff_sev = ninc.adjusted_severity or ninc.reported_severity
        priority = _SEV_PRIORITY.get(eff_sev, "medium")
        ncase = IncidentCase(
            incident_id=ninc.id, tenant_id=tid, organization_id=ninc.organization_id,
            status="new", priority=priority, escalation_level=0,
            created_at=ninc.created_at + timedelta(minutes=2),
            updated_at=ninc.created_at + timedelta(minutes=2),
        )
        db.add(ncase)
        narrative_cases.append(ncase)

    db.flush()  # flush before accessing ncase.id for timeline entries

    for i, (ncase, ninc) in enumerate(zip(narrative_cases, narrative_incidents)):
        eff_sev = ninc.adjusted_severity or ninc.reported_severity
        priority = _SEV_PRIORITY.get(eff_sev, "medium")
        db.add(CaseTimeline(
            case_id=ncase.id, tenant_id=tid, actor_id=safety_user.id,
            event_type="case_created",
            details={"incident_id": str(ninc.id), "center_id": ninc.center_id, "priority": priority},
            created_at=ncase.created_at,
        ))

    # Narrative incident indices: 0-2=FL-JAX, 3-4=GA-ATL, 5=PA-PIT, 6=NY-BRK san, 7=NY-BRK near-miss
    _NARRATIVE_CASE_ASSIGNS = [
        (0, dist_mgr_fl, "district_manager", "investigating"),   # FL-JAX slip 1
        (1, dist_mgr_fl, "district_manager", "investigating"),   # FL-JAX slip 2
        (2, dist_mgr_fl, "district_manager", "assigned"),        # FL-JAX drain failure
        (3, safety_user, "safety", "investigating"),              # GA-ATL Zeus aggression
        (4, safety_user, "safety", "investigating"),              # GA-ATL Zeus fight
        (5, area_mgr_ne, "area_manager", "investigating"),        # PA-PIT dryer 2
        (6, center_mgr_ny, "center_manager", "assigned"),         # NY-BRK sanitation
        (7, center_mgr_ny, "center_manager", "assigned"),         # NY-BRK near-miss
    ]
    for nc_idx, assignee, role, new_status in _NARRATIVE_CASE_ASSIGNS:
        if nc_idx < len(narrative_cases):
            nc = narrative_cases[nc_idx]
            nc.assigned_to_user_id = assignee.id
            nc.assigned_role = role
            nc.status = new_status
            db.add(CaseTimeline(
                case_id=nc.id, tenant_id=tid, actor_id=assignee.id,
                event_type="assigned",
                details={"role": role, "new_status": new_status},
                created_at=nc.created_at + timedelta(hours=1),
            ))

    # Escalate the GA-ATL Zeus fight case to level 2
    if len(narrative_cases) > 4:
        zeus_case = narrative_cases[4]
        zeus_case.escalation_level = 2
        zeus_case.priority = "critical"
        db.add(CaseTimeline(
            case_id=zeus_case.id, tenant_id=tid, actor_id=safety_user.id,
            event_type="escalated",
            details={"old_level": 0, "new_level": 2, "reason": "Second Zeus incident in 25 days — owner refused removal after first incident"},
            created_at=zeus_case.created_at + timedelta(hours=2),
        ))

    db.flush()

    # Narrative corrective actions
    # _NARRATIVE_CAS format: (inc_idx, title, root_cause, status, due_offset_days, notes) — 6 fields
    # Remap indices so PA-PIT (was 6) → 5, NY-BRK (was 7/8) → 6/7
    _REMAP = {6: 5, 7: 6, 8: 7}
    narrative_ca_list: list[CorrectiveAction] = []
    for raw in _NARRATIVE_CAS:
        orig_idx, title, root_cause, ca_status, due_offset, notes = raw
        nc_idx = _REMAP.get(orig_idx, orig_idx)
        if nc_idx >= len(narrative_cases):
            continue
        nc = narrative_cases[nc_idx]
        ninc = narrative_incidents[nc_idx]
        assignee = safety_user  # narrative CAs assigned to safety user by default
        due_dt = _now() + timedelta(days=due_offset) if due_offset is not None else None
        completed_dt = (_now() + timedelta(days=due_offset - 2)) if ca_status == "completed" and due_offset else None
        ca = CorrectiveAction(
            tenant_id=tid,
            case_id=nc.id,
            incident_id=ninc.id,
            title=title,
            root_cause=root_cause,
            assigned_to_user_id=assignee.id,
            assigned_to_name=assignee.email.split("@")[0].replace(".", " ").title(),
            status=ca_status,
            due_date=due_dt,
            completed_at=completed_dt,
            notes=notes,
            created_by_user_id=safety_user.id,
            created_at=nc.created_at + timedelta(hours=3),
            updated_at=nc.created_at + timedelta(hours=3),
        )
        db.add(ca)
        narrative_ca_list.append(ca)
        db.add(CaseTimeline(
            case_id=nc.id, tenant_id=tid, actor_id=safety_user.id,
            event_type="corrective_action_added",
            details={"title": title, "root_cause": root_cause},
            created_at=nc.created_at + timedelta(hours=4),
        ))
        if ca_status == "completed":
            db.add(CaseTimeline(
                case_id=nc.id, tenant_id=tid, actor_id=assignee.id,
                event_type="corrective_action_completed",
                details={"title": title},
                created_at=_now() + timedelta(days=due_offset - 1) if due_offset else _now() - timedelta(days=2),
            ))

    db.flush()

    # Narrative witness statements
    narrative_ws_list: list[WitnessStatement] = []
    for nc_idx, wname, wrole, shift, observed, intervened, statement, days_ago in _NARRATIVE_WITNESSES:
        if nc_idx >= len(narrative_cases):
            continue
        nc = narrative_cases[nc_idx]
        ninc = narrative_incidents[nc_idx]
        ws = WitnessStatement(
            tenant_id=tid,
            case_id=nc.id,
            incident_id=ninc.id,
            witness_name=wname,
            witness_role=wrole,
            shift_at_time=shift,
            observed_directly=observed,
            intervention_attempted=intervened,
            statement=statement,
            statement_timestamp=_ago(days_ago),
            recorded_by_user_id=safety_user.id,
            created_at=_ago(days_ago, hours=-1),
        )
        db.add(ws)
        narrative_ws_list.append(ws)
        db.add(CaseTimeline(
            case_id=nc.id, tenant_id=tid, actor_id=safety_user.id,
            event_type="witness_statement_added",
            details={"witness_name": wname, "observed_directly": observed},
            created_at=_ago(days_ago, hours=-1),
        ))

    db.flush()
    counts["narrative_incidents"] = len(narrative_incidents)
    counts["narrative_corrective_actions"] = len(narrative_ca_list)
    counts["narrative_witness_statements"] = len(narrative_ws_list)

    # ── Phase 10.8: Shift-based realistic incidents ───────────────────────────
    # Imperfect human reporting: rushed descriptions, missing fields, CA fatigue.

    shift_incidents: list[Incident] = []
    shift_cases: list[IncidentCase] = []

    for (center_code, inc_type, severity, status, days_ago, shift_hour,
         description, employee_name) in _SHIFT_INCIDENTS:
        center_id = next((c[0] for c in _CENTERS if c[0] == center_code), center_code)
        created_at = _ago(days_ago, hours=shift_hour)
        sinc = Incident(
            tenant_id=tid,
            center_id=center_id,
            incident_type=inc_type,
            reported_severity=severity,
            status=status,
            description=description,
            employee_name=employee_name,
            created_at=created_at,
        )
        db.add(sinc)
        shift_incidents.append(sinc)

    db.flush()

    for sinc in shift_incidents:
        sc = IncidentCase(
            tenant_id=tid,
            incident_id=sinc.id,
            status="open",
            priority="medium",
            escalation_level=0,
            created_at=sinc.created_at + timedelta(minutes=2),
            updated_at=sinc.created_at + timedelta(minutes=2),
        )
        db.add(sc)
        shift_cases.append(sc)

    db.flush()  # flush so sc.id is populated before timeline entries

    for sinc, sc in zip(shift_incidents, shift_cases):
        db.add(CaseTimeline(
            case_id=sc.id,
            tenant_id=tid,
            actor_id=actor_id,
            event_type="incident_reported",
            details={"incident_type": sinc.incident_type, "severity": sinc.reported_severity},
            created_at=sinc.created_at + timedelta(minutes=2),
        ))

    db.flush()

    # CA fatigue — overdue CAs that nobody has resolved
    for s_idx, title, root_cause, due_offset, notes in _SHIFT_FATIGUE_CAS:
        if s_idx >= len(shift_cases):
            continue
        sc = shift_cases[s_idx]
        sinc = shift_incidents[s_idx]
        due_dt = _now() + timedelta(days=due_offset)
        fca = CorrectiveAction(
            tenant_id=tid,
            case_id=sc.id,
            incident_id=sinc.id,
            title=title,
            root_cause=root_cause,
            assigned_to_user_id=safety_user.id,
            assigned_to_name=safety_user.email.split("@")[0].replace(".", " ").title(),
            status="open",
            due_date=due_dt,
            notes=notes,
            created_by_user_id=safety_user.id,
            created_at=sinc.created_at + timedelta(hours=2),
            updated_at=sinc.created_at + timedelta(hours=2),
        )
        db.add(fca)

    db.flush()
    counts["shift_incidents"] = len(shift_incidents)

    # Mark onboarding complete so the dashboard loads cleanly
    from app.modules.provision.models import TenantSettings
    ts = db.query(TenantSettings).filter(TenantSettings.tenant_id == tid).first()
    if ts:
        ts.onboarding_step = 5
        ts.onboarding_completed = True
    else:
        ts = TenantSettings(tenant_id=tid, onboarding_step=5, onboarding_completed=True)
        db.add(ts)
    db.flush()

    return counts
