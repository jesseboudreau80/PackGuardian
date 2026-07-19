"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface SafetyTip {
  id: string;
  category: string;
  title: string;
  body: string;
  icon: string;
  tags: string[];
  osha_relevant?: boolean;
}

// Curated safety tip library — pet care facility focused
const TIPS: SafetyTip[] = [
  // Heat & Summer Safety
  {
    id: "heat-01",
    category: "Heat Safety",
    icon: "☀️",
    title: "Recognize heat exhaustion in dogs early",
    body: "Early signs include excessive panting, drooling, and lethargy. If a dog is showing these signs, move them to a cool area immediately, offer water, and apply cool (not cold) wet towels to their paws and neck. Alert a supervisor and document the incident.",
    tags: ["summer", "dogs", "heat"],
  },
  {
    id: "heat-02",
    category: "Heat Safety",
    icon: "🌡️",
    title: "Never leave dogs in vehicles — even briefly",
    body: "On an 85°F day, a car interior can reach 102°F in just 10 minutes with the windows cracked. A dog left even briefly is at serious risk of heatstroke. This is both a safety incident and a potential liability event — report any such situation immediately.",
    tags: ["summer", "vehicles", "heat"],
    osha_relevant: true,
  },
  {
    id: "heat-03",
    category: "Heat Safety",
    icon: "💧",
    title: "Check water bowls every 2 hours on hot days",
    body: "Dogs in outdoor or warm kennel areas need fresh water more frequently in summer. Dehydration accelerates rapidly in heat. Document your checks — if a water access issue caused or contributed to a health event, those records are essential.",
    tags: ["summer", "hydration", "kennels"],
  },
  {
    id: "heat-04",
    category: "Heat Safety",
    icon: "🏃",
    title: "Limit dog play time when it's above 85°F",
    body: "High-energy play generates body heat that adds to ambient temperature stress. Brachycephalic breeds (bulldogs, pugs, boxers) are especially vulnerable and should be monitored closely. Short snouts impair their ability to cool themselves through panting.",
    tags: ["summer", "exercise", "breeds"],
  },

  // Slip & Fall Prevention
  {
    id: "slip-01",
    category: "Slip & Fall Prevention",
    icon: "💧",
    title: "Wet floors are the #1 OSHA recordable cause in pet care",
    body: "Dog wash areas, kennel runs, and outdoor play yards all create wet surfaces. Place anti-slip mats at transitions between wet and dry areas. Report any mat that is curling, torn, or not lying flat — it becomes a trip hazard and a recordable liability.",
    tags: ["floors", "osha", "daily"],
    osha_relevant: true,
  },
  {
    id: "slip-02",
    category: "Slip & Fall Prevention",
    icon: "🧹",
    title: "Clean up immediately — don't mark and walk past",
    body: "A wet floor cone is not a solution — it's a notice that a hazard exists. The hazard should be cleaned within minutes, not hours. If you don't have time to address it yourself, communicate it to the next person and confirm it gets resolved. Document it.",
    tags: ["floors", "housekeeping"],
  },
  {
    id: "slip-03",
    category: "Slip & Fall Prevention",
    icon: "👟",
    title: "Proper footwear reduces slip injuries by up to 60%",
    body: "Rubber-soled, closed-toe shoes with water resistance are the standard for pet care facilities. Sandals, clogs without backs, and smooth-soled shoes significantly increase slip risk on wet surfaces. Supervisors should address footwear concerns before a fall happens.",
    tags: ["footwear", "prevention"],
    osha_relevant: true,
  },

  // Dog Bite & Animal Handling
  {
    id: "bite-01",
    category: "Animal Handling",
    icon: "🐕",
    title: "Read body language before every interaction",
    body: "A stiff tail, pinned ears, whale eye (showing whites), or lip curl are warning signs before a bite. Never rush to comfort a stressed dog. Give space, speak softly, and involve a more experienced handler. Prevention prevents OSHA recordables.",
    tags: ["dogs", "body-language", "safety"],
  },
  {
    id: "bite-02",
    category: "Animal Handling",
    icon: "🩹",
    title: "Every bite must be reported — even minor ones",
    body: "A small puncture today may develop into an infection requiring medical treatment — which makes it OSHA recordable. Reporting immediately protects both you and the facility. PackGuardian captures bite details that are needed for OSHA Form 300 if required.",
    tags: ["bites", "osha", "reporting"],
    osha_relevant: true,
  },
  {
    id: "bite-03",
    category: "Animal Handling",
    icon: "🔒",
    title: "Two-person protocol for escalated dogs",
    body: "Any dog that has shown aggression — even once — should have a handling protocol. One person manages the dog, one maintains clear communication with the team. Never handle a flagged dog alone. Document the flag in the animal's record after each incident.",
    tags: ["aggression", "protocol", "teamwork"],
  },

  // Chemical Safety
  {
    id: "chem-01",
    category: "Chemical Safety",
    icon: "🧪",
    title: "Never mix bleach with any other cleaning product",
    body: "Mixing bleach with ammonia-based cleaners (many general-purpose products) releases chloramine gas. In a poorly ventilated kennel area, this can cause eye and respiratory injury within minutes. Always read labels and rinse surfaces before applying a different product.",
    tags: ["chemicals", "cleaning", "ventilation"],
    osha_relevant: true,
  },
  {
    id: "chem-02",
    category: "Chemical Safety",
    icon: "📋",
    title: "Know where your SDS sheets are right now",
    body: "OSHA requires Safety Data Sheets to be immediately accessible for every chemical on site. If you had an exposure right now, could you locate the SDS in under 2 minutes? If not, speak to your manager today about SDS station location and access.",
    tags: ["chemicals", "osha", "sds"],
    osha_relevant: true,
  },
  {
    id: "chem-03",
    category: "Chemical Safety",
    icon: "🥽",
    title: "PPE isn't optional when working with disinfectants",
    body: "Quaternary ammonium compounds (common in kennels) can cause skin sensitization over time with repeated unprotected contact. Gloves, eye protection, and good ventilation are required — not suggested. A pattern of skipping PPE is a corrective action waiting to happen.",
    tags: ["chemicals", "ppe", "daily"],
    osha_relevant: true,
  },

  // OSHA Awareness
  {
    id: "osha-01",
    category: "OSHA Compliance",
    icon: "📋",
    title: "What makes an injury OSHA recordable?",
    body: "An injury is OSHA recordable if it requires treatment beyond first aid (stitches, prescription medication, physical therapy), causes days away from work, results in restricted duty, or requires medical transfer. PackGuardian flags these automatically — but the final call requires human review.",
    tags: ["osha", "recordable", "awareness"],
    osha_relevant: true,
  },
  {
    id: "osha-02",
    category: "OSHA Compliance",
    icon: "📅",
    title: "OSHA Form 300A must be posted Feb 1 – April 30",
    body: "Every establishment with 10+ employees must post the OSHA 300A Annual Summary from February 1 through April 30 each year. It must be signed by a company executive. PackGuardian generates this automatically from your recorded incidents — verify your posting in the OSHA section.",
    tags: ["osha", "annual", "posting"],
    osha_relevant: true,
  },
  {
    id: "osha-03",
    category: "OSHA Compliance",
    icon: "⏱️",
    title: "Severe injuries must be reported to OSHA within 24 hours",
    body: "Hospitalization of any employee must be reported to OSHA within 24 hours. Amputations and loss of an eye must be reported within 24 hours. Fatalities must be reported within 8 hours. These are federal requirements — not optional. PackGuardian escalates these automatically.",
    tags: ["osha", "severe", "reporting"],
    osha_relevant: true,
  },

  // Ergonomics & Back Safety
  {
    id: "ergo-01",
    category: "Ergonomics",
    icon: "💪",
    title: "Lift with your legs — always, every time",
    body: "In pet care, you regularly lift dogs, bags of food, and equipment. Back injuries are the most common lost-time injury in the industry. Bend at the knees, keep the load close to your body, and never twist while lifting. If a dog is over 50 lbs, ask for help — every time.",
    tags: ["back", "lifting", "ergonomics"],
    osha_relevant: true,
  },
  {
    id: "ergo-02",
    category: "Ergonomics",
    icon: "🧘",
    title: "Report discomfort before it becomes an injury",
    body: "Repetitive motion and sustained awkward postures (leaning over a grooming table, crouching in kennel runs) cause injuries over time. If you're experiencing recurring soreness or stiffness, report it now — early reporting leads to early correction and prevents an OSHA recordable.",
    tags: ["ergonomics", "reporting", "prevention"],
  },

  // Vet & Animal Health Awareness
  {
    id: "vet-01",
    category: "Animal Health",
    icon: "🏥",
    title: "Know the signs of kennel cough",
    body: "A honking cough, nasal discharge, and lethargy are the hallmark signs. Kennel cough (Bordetella) spreads rapidly in group settings. An affected animal should be isolated immediately and the owner notified. Document the isolation and any animals exposed — this protects the facility.",
    tags: ["disease", "kennels", "isolation"],
  },
  {
    id: "vet-02",
    category: "Animal Health",
    icon: "🌡️",
    title: "Normal dog temperature: 101–102.5°F",
    body: "A temperature above 103°F is a fever. Above 104°F is a medical emergency. If a dog in your care seems lethargic, refuses water, or is shivering despite warm conditions, check for fever and contact a veterinarian. Document the observation and any actions taken immediately.",
    tags: ["health", "temperature", "emergency"],
  },
  {
    id: "vet-03",
    category: "Animal Health",
    icon: "👁️",
    title: "Discharge, redness, or squinting = eye concern",
    body: "Eye conditions in dogs can deteriorate rapidly. Any discharge (especially colored), redness, squinting, or pawing at the eye should trigger immediate isolation and owner notification. Corneal ulcers and other conditions can cause permanent damage if not treated within 24 hours.",
    tags: ["eyes", "health", "owners"],
  },

  // Emergency Preparedness
  {
    id: "emerg-01",
    category: "Emergency Preparedness",
    icon: "🚨",
    title: "Do you know your facility's emergency exits?",
    body: "In a fire or emergency evacuation, you may have seconds to make decisions. Know all exit routes from your current area. Know which dogs are in which kennels so accountability is possible. Know who the designated assembly point is. Review this now — not when sirens are sounding.",
    tags: ["emergency", "fire", "evacuation"],
  },
  {
    id: "emerg-02",
    category: "Emergency Preparedness",
    icon: "📞",
    title: "Keep emergency numbers visible",
    body: "Your nearest emergency vet, animal poison control (888-426-4435), and local emergency services numbers should be posted at every workstation. If you're handling a critical animal situation, you should not have to search for a phone number. Post them today if they aren't visible.",
    tags: ["emergency", "contacts", "poison"],
  },
];

const CATEGORIES = ["All", ...Array.from(new Set(TIPS.map((t) => t.category)))];

function getScheduledTipIndex(): number {
  // Rotate tips every 3 days based on current date
  const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const cycleDays = 3;
  return Math.floor(daysSinceEpoch / cycleDays) % TIPS.length;
}

function timeSinceLastVisit(): string {
  try {
    const last = localStorage.getItem("pg_tips_last_visit");
    if (!last) return "";
    const diff = Date.now() - Number(last);
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "";
    if (days === 1) return "New tip since yesterday";
    return `New tips since ${days} days ago`;
  } catch { return ""; }
}

export default function TipsPage() {
  const [category, setCategory] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sinceVisit, setSinceVisit] = useState("");

  const scheduledIndex = getScheduledTipIndex();
  const tipOfThePeriod = TIPS[scheduledIndex];

  useEffect(() => {
    setSinceVisit(timeSinceLastVisit());
    try { localStorage.setItem("pg_tips_last_visit", String(Date.now())); } catch { /* ignore */ }
    // Auto-expand the featured tip
    setExpanded(tipOfThePeriod.id);
  }, [tipOfThePeriod.id]);

  const filtered = category === "All" ? TIPS : TIPS.filter((t) => t.category === category);

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold" style={{ color: "var(--pg-navy)" }}>Safety Tips</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>
          Rotating safety awareness — updated every 3 days
          {sinceVisit && <span className="ml-2 font-medium" style={{ color: "var(--pg-steel)" }}>· {sinceVisit}</span>}
        </p>
      </div>

      {/* Featured tip of the period */}
      <div className="rounded-2xl p-5 text-white" style={{ background: "var(--gradient-navy)" }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-widest opacity-70">Featured This Period</span>
          {tipOfThePeriod.osha_relevant && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              OSHA
            </span>
          )}
        </div>
        <div className="flex items-start gap-3">
          <span className="text-3xl flex-shrink-0">{tipOfThePeriod.icon}</span>
          <div>
            <p className="font-bold text-base leading-snug">{tipOfThePeriod.title}</p>
            <p className="text-xs mt-0.5 opacity-70">{tipOfThePeriod.category}</p>
            <p className="text-sm mt-3 leading-relaxed opacity-90">{tipOfThePeriod.body}</p>
          </div>
        </div>
        <div className="mt-4 pt-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
          <p className="text-xs opacity-60">Updates every 3 days · {TIPS.length} tips in rotation</p>
          <Link href="/mobile/incident"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            Report Incident →
          </Link>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setCategory(cat)}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-all"
            style={{
              background: category === cat ? "var(--pg-navy)" : "var(--pg-surface)",
              color: category === cat ? "white" : "var(--pg-text-muted)",
              border: `1px solid ${category === cat ? "var(--pg-navy)" : "var(--pg-border)"}`,
            }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Tip list */}
      <div className="space-y-2">
        {filtered.map((tip) => {
          const isOpen = expanded === tip.id;
          const isFeatured = tip.id === tipOfThePeriod.id;
          return (
            <div key={tip.id}
              className="rounded-2xl overflow-hidden bg-white"
              style={{
                border: `1px solid ${isFeatured ? "var(--pg-steel)" : "var(--pg-border)"}`,
                boxShadow: isFeatured ? "var(--shadow-raised)" : "var(--shadow-card)",
              }}>
              <button
                onClick={() => setExpanded(isOpen ? null : tip.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="text-2xl flex-shrink-0">{tip.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold leading-snug" style={{ color: "var(--pg-text)" }}>
                      {tip.title}
                    </p>
                    {tip.osha_relevant && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                        style={{ background: "rgba(30,58,95,0.08)", color: "var(--pg-navy)" }}>
                        OSHA
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>{tip.category}</p>
                </div>
                <span className="text-lg flex-shrink-0" style={{ color: "var(--pg-text-muted)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  ›
                </span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-0" style={{ borderTop: "1px solid var(--pg-border-soft)" }}>
                  <p className="text-sm leading-relaxed mt-3" style={{ color: "var(--pg-text-sub)" }}>
                    {tip.body}
                  </p>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {tip.tags.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "var(--pg-surface)", color: "var(--pg-text-muted)", border: "1px solid var(--pg-border-soft)" }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-center pt-2" style={{ color: "var(--pg-text-muted)" }}>
        {TIPS.length} safety tips across {CATEGORIES.length - 1} categories · Updated regularly
      </p>
    </div>
  );
}
