// ADEP — The AI Decision Council
// Ported to the Replit monorepo. All AI provider calls route through the
// backend proxy (/api/ai/chat) so API keys never touch the browser.
// Persistence uses localStorage in place of the original window.storage.

import { useState, useEffect, useRef } from "react";

/* ================= THEME ================= */
const C = {
  bg0: "#0A0C11", bg1: "#0F1219", bg2: "#151924", bg3: "#1C2130",
  line: "#232A3A", line2: "#2E3750",
  ink: "#EAE7E0", dim: "#9AA2B4", faint: "#646D83",
  brass: "#C9A35C", brassHi: "#E9C983", brassDim: "rgba(201,163,92,0.13)",
  good: "#5FB98A", bad: "#E06C5F", info: "#6E9CD9", warn: "#D9A44C", viol: "#9C8CD9",
};
const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const KIND: Record<string, { c: string; l: string }> = {
  challenge: { c: "#E06C5F", l: "challenges" },
  support: { c: "#5FB98A", l: "supports" },
  question: { c: "#6E9CD9", l: "questions" },
  evidence: { c: "#9C8CD9", l: "cites evidence" },
  concession: { c: "#D9A44C", l: "concedes" },
  clarify: { c: "#9AA2B4", l: "clarifies" },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#0A0C11}
::selection{background:rgba(201,163,92,.35)}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-thumb{background:#242A3A;border-radius:99px}
button{cursor:pointer;font-family:inherit;border:none;background:none;color:inherit;padding:0}
textarea{font-family:inherit}
textarea:focus{outline:none}
input:focus{outline:none}
button:focus-visible{outline:2px solid rgba(201,163,92,.55);outline-offset:2px;border-radius:8px}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fu{animation:fadeUp .45s cubic-bezier(.2,.8,.2,1) both}
@keyframes pulseDot{0%,100%{opacity:.3}50%{opacity:1}}
.thinkdot{animation:pulseDot 1.1s ease-in-out infinite}
@keyframes glowPulse{0%,100%{opacity:.15}50%{opacity:.8}}
.glowp{animation:glowPulse 1.5s ease-in-out infinite}
@keyframes linkFade{0%{opacity:.85}70%{opacity:.45}100%{opacity:0}}
.lk{animation:linkFade 3s ease-out forwards}
@keyframes growBar{from{width:0}}
.gb{animation:growBar .9s cubic-bezier(.2,.8,.2,1) both}
.rowscroll{scrollbar-width:none}
.rowscroll::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/* ================= THE ROSTER ================= */
const EXPERT_REGISTRY = [
  // ---- process roles ----
  { id: "moderator", n: "Vale", r: "The Chair", m: "VA", h: 40, exp: "Facilitation, synthesis, decision hygiene, running effective meetings", bias: "Process over ego; protects dissent", style: "Measured, brief, impartial", domain: "process" },
  { id: "devil", n: "Ash", r: "Devil's Advocate", m: "DA", h: 0, exp: "Steel-manning opposition, finding blindspots, stress-testing consensus", bias: "Attacks the emerging consensus regardless of personal opinion", style: "Combative, relentless", domain: "process" },
  { id: "fact", n: "Vera", r: "Fact Checker", m: "FC", h: 200, exp: "Claim verification, source quality, evidence standards", bias: "Trusts peer-reviewed sources over authority", style: "Precise, citation-first", domain: "process" },

  // ---- strategy / leadership ----
  { id: "ceo", n: "Okafor", r: "CEO", m: "OK", exp: "Strategic trade-offs, resource allocation, long-term bets", bias: "Prioritizes market position over short-term costs", style: "Decisive, big-picture", domain: "business" },
  { id: "cto", n: "Reyes", r: "CTO", m: "RY", exp: "Technical feasibility, architecture, engineering trade-offs", bias: "Prefers battle-tested over cutting-edge", style: "Systematic, detail-oriented", domain: "technology" },
  { id: "cfo", n: "Dahl", r: "CFO", m: "DA", exp: "Unit economics, runway, financial modeling", bias: "Prioritizes cash flow over growth narrative", style: "Skeptical, numbers-first", domain: "finance" },
  { id: "scientist", n: "Chen", r: "Research Scientist", m: "CH", exp: "Empirical methods, hypothesis testing, literature review", bias: "Demands reproducible evidence", style: "Rigorous, hedged", domain: "science" },
  { id: "economist", n: "Arora", r: "Economist", m: "AR", exp: "Incentives, market dynamics, second-order effects", bias: "Looks for unintended consequences", style: "Analytical, counterintuitive", domain: "economics" },
  { id: "psych", n: "Laurent", r: "Psychologist", m: "PS", exp: "Human behavior, cognitive biases, decision-making", bias: "Assumes people are not as rational as they think", style: "Empathetic, pattern-seeking", domain: "psychology" },
  { id: "lawyer", n: "Torres", r: "Counsel", m: "LW", exp: "Legal risk, contracts, regulatory exposure", bias: "Identifies worst-case liability first", style: "Cautious, precise", domain: "law" },
  { id: "ethicist", n: "Mbeki", r: "Ethicist", m: "MB", h: 100, exp: "Externalities, fairness, long-term harm", bias: "Weights harms over convenience", style: "Principled, reflective", domain: "philosophy" },
  { id: "risk", n: "Novak", r: "Risk Analyst", m: "NO", h: 12, exp: "Downside scenarios, tail risk, mitigation", bias: "Plans for the 5% case", style: "Sober, structured", domain: "finance" },
  { id: "finance", n: "Grant", r: "Financial Advisor", m: "GR", h: 75, exp: "Personal finance, cashflow, runway", bias: "Liquidity first; compounding always", style: "Prudent, concrete", domain: "finance" },
  { id: "negotiator", n: "Barzani", r: "Negotiator", m: "BA", h: 25, exp: "Leverage, BATNA, deal design", bias: "Everything is negotiable", style: "Strategic, calm", domain: "business" },
  { id: "historian", n: "Aldana", r: "Historian", m: "AL", h: 55, exp: "Precedent, patterns across eras", bias: "Nothing is truly new", style: "Narrative, contextual", domain: "history" },
  { id: "futurist", n: "Sato", r: "Futurist", m: "SA", h: 250, exp: "Trend trajectories, scenario planning", bias: "Overweights the long game", style: "Speculative, structured", domain: "business" },
  { id: "ops", n: "Muller", r: "Operations", m: "MU", h: 130, exp: "Execution, logistics, reliability", bias: "Plans die without owners and dates", style: "Direct, checklists", domain: "business" },
  { id: "marketing", n: "Duarte", r: "Marketing", m: "DU", h: 350, exp: "Positioning, narrative, demand", bias: "Perception shapes reality", style: "Persuasive, vivid", domain: "business" },

  // ---- medicine ----
  { id: "physician", n: "Adeyemi", r: "Internal Medicine Physician", m: "AD", exp: "Diagnosis, differential reasoning, whole-patient care", bias: "Treats the patient in front of them, not the textbook case", style: "Careful, methodical, plain-spoken", domain: "medicine" },
  { id: "surgeon", n: "Castellanos", r: "Surgeon", m: "CA", exp: "Procedural risk, operative judgment, complication management", bias: "Trusts hands and outcomes over theory", style: "Decisive, blunt, time-pressured", domain: "medicine" },
  { id: "psychiatrist", n: "Lindqvist", r: "Psychiatrist", m: "LI", exp: "Mental health treatment, medication management, risk assessment", bias: "Weighs quality of life alongside symptom reduction", style: "Careful, non-judgmental, precise", domain: "medicine" },
  { id: "epidemiologist", n: "Osei", r: "Epidemiologist", m: "OS", exp: "Disease spread, population health, study design", bias: "Distrusts small samples and anecdote", style: "Statistical, cautious, public-health-minded", domain: "medicine" },
  { id: "pediatrician", n: "Haddad", r: "Pediatrician", m: "HA", exp: "Child development, family-centered care, growth milestones", bias: "Defaults to the most conservative option for a child", style: "Warm, patient, protective", domain: "medicine" },
  { id: "pharmacologist", n: "Voss", r: "Clinical Pharmacologist", m: "VO", exp: "Drug interactions, dosing, mechanism of action", bias: "Assumes interactions until ruled out", style: "Exact, cautious, technical", domain: "medicine" },
  { id: "nurse", n: "Falcone", r: "Public Health Nurse", m: "FA", exp: "Frontline care, patient education, care coordination", bias: "Centers what patients will actually do, not just what is ideal", style: "Practical, direct, compassionate", domain: "medicine" },
  { id: "nutritionist", n: "Bhatt", r: "Nutrition Scientist", m: "BH", exp: "Diet, metabolic health, evidence-based nutrition", bias: "Skeptical of fad claims; wants the study behind it", style: "Measured, evidence-first", domain: "medicine" },
  { id: "vet", n: "Solberg", r: "Veterinarian", m: "SO", exp: "Animal health, husbandry, cross-species diagnosis", bias: "Weighs welfare heavily, cost second", style: "Grounded, kind, practical", domain: "medicine" },
  { id: "addictionmed", n: "Bekele", r: "Addiction Medicine Specialist", m: "BK", exp: "Substance use treatment, harm reduction, relapse patterns", bias: "Weighs sustainable recovery over quick fixes", style: "Nonjudgmental, direct", domain: "medicine" },

  // ---- cybersecurity ----
  { id: "redteam", n: "Kowalski", r: "Red Team Lead", m: "KO", exp: "Penetration testing, adversarial thinking, exploit chains", bias: "Assumes every system is already breached", style: "Paranoid by profession, precise", domain: "cybersecurity", pref: "groq" },
  { id: "blueteam", n: "Nakamura", r: "Incident Response Lead", m: "NA", exp: "Detection, containment, forensics, breach response", bias: "Assumes the incident is worse than first reported", style: "Calm under pressure, procedural", domain: "cybersecurity", pref: "groq" },
  { id: "cryptography", n: "Elhassan", r: "Cryptographer", m: "EL", exp: "Encryption, key management, protocol security", bias: "Distrusts anything not independently peer-reviewed", style: "Rigorous, skeptical of shortcuts", domain: "cybersecurity" },
  { id: "privacy", n: "Renner", r: "Privacy & Compliance Officer", m: "RN", exp: "Data protection law, regulatory exposure, audits", bias: "Assumes regulators read the worst-case interpretation", style: "Careful, documentation-minded", domain: "cybersecurity" },
  { id: "ciso", n: "Abubakar", r: "CISO", m: "AB", exp: "Security posture, threat modeling, budget trade-offs", bias: "Weighs likelihood over worst-case fear", style: "Strategic, calm, board-ready", domain: "cybersecurity", pref: "groq" },

  // ---- law ----
  { id: "conlaw", n: "Whitfield", r: "Constitutional Law Scholar", m: "WH", exp: "Constitutional interpretation, civil rights, judicial review", bias: "Weighs precedent heavily over novel theory", style: "Formal, precise, historically grounded", domain: "law" },
  { id: "iplaw", n: "Nakashima", r: "IP & Patent Attorney", m: "NK", exp: "Patents, trademarks, trade secrets, licensing", bias: "Assumes ideas are worth protecting until proven otherwise", style: "Detail-obsessed, procedural", domain: "law" },
  { id: "crimlaw", n: "Delgado", r: "Criminal Defense Attorney", m: "DE", exp: "Due process, evidentiary standards, plea strategy", bias: "Presumes innocence and distrusts the state's version first", style: "Combative, protective of rights", domain: "law" },
  { id: "taxlaw", n: "Sorensen", r: "Tax Attorney", m: "SR", exp: "Tax structuring, compliance, cross-border exposure", bias: "Assumes the aggressive position gets audited", style: "Exact, cautious, numbers-fluent", domain: "law" },
  { id: "intllaw", n: "Adeyinka", r: "International Law Counsel", m: "AY", exp: "Treaties, human rights, cross-border disputes", bias: "Weighs global norms over local convenience", style: "Principled, diplomatic", domain: "law" },
  { id: "emplaw", n: "Brennan", r: "Employment Attorney", m: "BR", exp: "Labor law, workplace disputes, compliance", bias: "Assumes the employee's version needs a fair hearing", style: "Direct, fair-minded", domain: "law" },
  { id: "immilaw", n: "Al-Rashid", r: "Immigration Attorney", m: "AR", exp: "Visas, asylum process, cross-border family law", bias: "Assumes the process takes longer than promised", style: "Patient, procedural", domain: "law" },

  // ---- finance ----
  { id: "banker", n: "Castillo", r: "Investment Banker", m: "CS", exp: "M&A structuring, valuation, deal execution", bias: "Believes almost anything can be financed at the right price", style: "Fast-talking, deal-hungry", domain: "finance" },
  { id: "actuary", n: "Lindberg", r: "Actuary", m: "LB", exp: "Risk pricing, probability modeling, insurance economics", bias: "Trusts the model over the story", style: "Dry, exact, statistical", domain: "finance" },
  { id: "refinance", n: "Osman", r: "Real Estate Finance Analyst", m: "OM", exp: "Cap rates, financing structures, market cycles", bias: "Assumes the cycle always turns eventually", style: "Grounded, numbers-first", domain: "finance" },
  { id: "cryptofin", n: "Halvorsen", r: "Fintech & Crypto Analyst", m: "HV", exp: "Digital assets, tokenomics, regulatory gray zones", bias: "Excited by the tech, wary of the hype cycle", style: "Fast, contrarian, technical", domain: "finance" },
  { id: "accountant", n: "Fujimori", r: "Forensic Accountant", m: "FU", exp: "Audit trails, fraud detection, financial statement analysis", bias: "Assumes the numbers are hiding something until proven clean", style: "Meticulous, skeptical", domain: "finance" },
  { id: "wealth", n: "Odhiambo", r: "Wealth & Retirement Planner", m: "OD", exp: "Long-horizon planning, tax-advantaged accounts, drawdown strategy", bias: "Prioritizes the client outliving their money", style: "Patient, conservative, plain-spoken", domain: "finance" },
  { id: "underwriter", n: "Feldman", r: "Underwriter", m: "FD", exp: "Risk pricing, policy terms, claims exposure", bias: "Assumes the tail risk is underpriced", style: "Cautious, numbers-driven", domain: "finance" },

  // ---- business ----
  { id: "founder", n: "Okonkwo", r: "Serial Founder", m: "OW", exp: "Zero-to-one building, scrappy execution, pivoting", bias: "Bias toward shipping over planning", style: "Restless, direct, story-driven", domain: "business" },
  { id: "supplychain", n: "Tran", r: "Supply Chain Strategist", m: "TR", exp: "Logistics networks, sourcing risk, inventory strategy", bias: "Assumes the supply chain breaks at the worst time", style: "Systems-minded, contingency-focused", domain: "business" },
  { id: "sales", n: "Marchetti", r: "Sales Leader", m: "MA", exp: "Pipeline strategy, deal-closing, quota design", bias: "Believes almost anything can be sold with the right story", style: "Energetic, persuasive, metrics-driven", domain: "business", pref: "groq" },
  { id: "hr", n: "Njoroge", r: "Head of People", m: "NJ", exp: "Org design, culture, compensation, retention", bias: "Weighs long-term culture cost over short-term convenience", style: "Empathic but structured", domain: "business" },
  { id: "corpdev", n: "Ferreira", r: "Corporate Development Lead", m: "FE", exp: "Acquisitions, integration risk, strategic fit", bias: "Distrusts synergy numbers on a slide", style: "Skeptical dealmaker", domain: "business" },
  { id: "franchise", n: "Yalcin", r: "Franchise Operations Consultant", m: "YA", exp: "Unit economics, franchisee relations, standardization", bias: "Prioritizes consistency over local creativity", style: "Systematic, practical", domain: "business" },
  { id: "realtor", n: "Cabrera", r: "Real Estate Broker", m: "CB", exp: "Local market dynamics, negotiation, property value", bias: "Assumes location dominates every other factor", style: "Personable, practical", domain: "business" },
  { id: "hospitality", n: "Rinaldi", r: "Hospitality Strategist", m: "RI", exp: "Guest experience, operations, seasonal economics", bias: "Weighs experience quality over marginal cost savings", style: "Warm, operational", domain: "business", pref: "openai" },
  { id: "consumer", n: "Dubois", r: "Consumer Behavior Analyst", m: "DB", exp: "Purchase psychology, brand perception, decision triggers", bias: "Assumes stated preference and real behavior diverge", style: "Curious, pattern-seeking", domain: "business" },

  // ---- history ----
  { id: "milhist", n: "Kowalczyk", r: "Military Historian", m: "KW", exp: "Strategy, logistics of war, command decisions", bias: "Sees most conflicts as resource and logistics problems first", style: "Blunt, pattern-seeking", domain: "history" },
  { id: "econhist", n: "Ionescu", r: "Economic Historian", m: "IO", exp: "Long-run economic cycles, past crises, institutions", bias: "Believes this has mostly happened before", style: "Wry, long-view", domain: "history" },
  { id: "diplohist", n: "Abiodun", r: "Diplomatic Historian", m: "BI", exp: "Treaties, alliances, statecraft across eras", bias: "Distrusts any deal that looks too easy", style: "Measured, contextual", domain: "history" },
  { id: "classhist", n: "Papadakis", r: "Classical Historian", m: "PA", exp: "Ancient civilizations, governance, rise and fall of empires", bias: "Looks for the same few failure patterns everywhere", style: "Erudite, dry humor", domain: "history" },

  // ---- philosophy ----
  { id: "epistem", n: "Vukovic", r: "Epistemologist", m: "VU", exp: "Knowledge, justification, certainty and doubt", bias: "Distrusts confident claims more than uncertain ones", style: "Precise, questioning", domain: "philosophy" },
  { id: "polphil", n: "Adebayo", r: "Political Philosopher", m: "AE", exp: "Justice, legitimacy, power, the social contract", bias: "Weighs fairness of process over outcome", style: "Rigorous, values-driven", domain: "philosophy" },
  { id: "philmind", n: "Kristiansen", r: "Philosopher of Mind", m: "KR", exp: "Consciousness, agency, the nature of thought", bias: "Suspicious of claims that reduce mind to mechanism too quickly", style: "Careful, abstract, patient", domain: "philosophy" },
  { id: "logician", n: "Farahani", r: "Logician", m: "FR", exp: "Formal reasoning, argument validity, fallacy detection", bias: "Cares if the argument is valid before caring if it is true", style: "Exacting, dry", domain: "philosophy" },

  // ---- psychology ----
  { id: "clinpsych", n: "Moreau", r: "Clinical Psychologist", m: "MO", exp: "Therapy modalities, diagnosis, treatment planning", bias: "Weighs the person's lived experience over the checklist", style: "Warm, careful, boundaried", domain: "psychology" },
  { id: "cogsci", n: "Larsson", r: "Cognitive Scientist", m: "LR", exp: "Memory, perception, reasoning under uncertainty", bias: "Assumes intuition is wrong before it is right", style: "Precise, experiment-minded", domain: "psychology" },
  { id: "orgpsych", n: "Achebe", r: "Organizational Psychologist", m: "AC", exp: "Team dynamics, motivation at work, culture change", bias: "Believes structure shapes behavior more than personality", style: "Observant, systems-minded", domain: "psychology" },
  { id: "devpsych", n: "Lindholm", r: "Developmental Psychologist", m: "LH", exp: "Childhood and lifespan development, attachment, learning stages", bias: "Weighs long-term development over short-term compliance", style: "Patient, evidence-based", domain: "psychology" },

  // ---- design ----
  { id: "industrial", n: "Baptiste", r: "Industrial Designer", m: "BP", exp: "Physical product form, manufacturability, ergonomics", bias: "Form must earn its place; function first", style: "Tactile, precise, opinionated", domain: "design", pref: "gemini" },
  { id: "branddesign", n: "Kowal", r: "Brand Designer", m: "KL", exp: "Visual identity, typography, narrative through design", bias: "Believes perception is built one detail at a time", style: "Visual, exacting, expressive", domain: "design", pref: "gemini" },
  { id: "architect", n: "Villanueva", r: "Architect", m: "VI", exp: "Built environment, structural constraints, spatial experience", bias: "Weighs how a space will actually be lived in", style: "Spatial thinker, patient, exacting", domain: "design", pref: "gemini" },
  { id: "gamedesign", n: "Yamazaki", r: "Game Designer", m: "YM", exp: "Player psychology, systems design, engagement loops", bias: "Assumes players find the shortcut you did not design for", style: "Playful, systems-obsessed", domain: "design", pref: "gemini" },
  { id: "fashion", n: "Moreno", r: "Fashion & Textile Strategist", m: "MN", exp: "Trend cycles, materials, brand positioning", bias: "Weighs cultural timing as much as design", style: "Expressive, trend-aware", domain: "design", pref: "gemini" },

  // ---- education ----
  { id: "pedagogy", n: "Osagie", r: "Curriculum Designer", m: "OG", exp: "Learning design, pedagogy, assessment", bias: "Weighs whether it actually transfers to real understanding", style: "Structured, student-centered", domain: "education" },
  { id: "edtech", n: "Pham", r: "EdTech Specialist", m: "PH", exp: "Learning technology, adaptive tools, classroom adoption", bias: "Skeptical of tech that does not change the core interaction", style: "Practical, evidence-seeking", domain: "education" },
  { id: "highered", n: "Costa", r: "Higher Education Administrator", m: "CO", exp: "Institutional strategy, accreditation, enrollment", bias: "Weighs institutional risk heavily", style: "Measured, policy-minded", domain: "education" },
  { id: "specialed", n: "Kallio", r: "Special Education Specialist", m: "KA", exp: "Individualized learning plans, accessibility, inclusion", bias: "Insists the plan fit the child, not the reverse", style: "Advocacy-minded, patient", domain: "education" },
  { id: "childdev", n: "Amaro", r: "Child Development Specialist", m: "AM", exp: "Early childhood milestones, parenting strategies, family systems", bias: "Weighs the child's developmental stage over adult convenience", style: "Warm, patient, practical", domain: "education" },

  // ---- economics ----
  { id: "macro", n: "Nwosu", r: "Macroeconomist", m: "NW", exp: "Inflation, monetary policy, business cycles", bias: "Distrusts any forecast beyond a few quarters", style: "Analytical, hedge-everything", domain: "economics" },
  { id: "behavecon", n: "Strand", r: "Behavioral Economist", m: "ST", exp: "Decision biases, nudges, irrational markets", bias: "Assumes people are predictably irrational, not random", style: "Curious, example-driven", domain: "economics" },
  { id: "devecon", n: "Owusu", r: "Development Economist", m: "OU", exp: "Poverty, growth, institutions in emerging markets", bias: "Weighs institutions over one-off interventions", style: "Field-grounded, empirical", domain: "economics" },
  { id: "tradecon", n: "Karimov", r: "International Trade Economist", m: "KV", exp: "Tariffs, trade flows, comparative advantage", bias: "Assumes retaliation follows protectionism", style: "Global, numbers-first", domain: "economics" },

  // ---- public policy ----
  { id: "urbanplan", n: "Salazar", r: "Urban Planner", m: "SZ", exp: "Zoning, housing policy, city infrastructure", bias: "Weighs long-term livability over short-term cost", style: "Systems-minded, patient", domain: "public policy" },
  { id: "envpolicy", n: "Kristensen", r: "Environmental Policy Analyst", m: "KE", exp: "Climate regulation, emissions policy, tradeoffs", bias: "Weighs long-term externalities heavily", style: "Data-driven, urgent", domain: "public policy" },
  { id: "healthpolicy", n: "Adjei", r: "Healthcare Policy Analyst", m: "AJ", exp: "Health systems, insurance design, access tradeoffs", bias: "Weighs population outcomes over individual anecdote", style: "Systemic, cautious", domain: "public policy" },
  { id: "geopolitics", n: "Volkov", r: "Foreign Policy Analyst", m: "VK", exp: "Geopolitics, statecraft, great-power dynamics", bias: "Assumes states act on interest, not stated intent", style: "Cold-eyed, strategic", domain: "public policy" },
  { id: "edpolicy", n: "Mensah", r: "Education Policy Analyst", m: "ME", exp: "School funding, standards, access and equity", bias: "Weighs equity of access as heavily as outcomes", style: "Evidence-driven, advocacy-aware", domain: "public policy" },
  { id: "crisismgmt", n: "Oduya", r: "Crisis Manager", m: "OY", exp: "Emergency response, contingency planning, triage", bias: "Assumes the plan needs a plan B", style: "Calm, fast, decisive", domain: "public policy", pref: "groq" },

  // ---- and more ----
  { id: "agriculture", n: "Diallo", r: "Agricultural Scientist", m: "DI", exp: "Crop science, food security, farming economics", bias: "Weighs soil and season limits over ambition", style: "Grounded, patient", domain: "agriculture" },
  { id: "journalist", n: "Bergstrom", r: "Investigative Journalist", m: "BE", exp: "Verification, sourcing, public accountability", bias: "Assumes the official story is incomplete", style: "Probing, skeptical", domain: "media", pref: "openai" },
  { id: "linguist", n: "Tanabe", r: "Linguist", m: "TN", exp: "Language structure, meaning, communication patterns", bias: "Weighs how something is actually understood, not just said", style: "Precise, curious", domain: "humanities", pref: "openai" },
  { id: "sociologist", n: "Ochieng", r: "Sociologist", m: "OC", exp: "Social structures, group behavior, culture change", bias: "Weighs the system over the individual choice", style: "Observational, contextual", domain: "social science", pref: "openai" },
  { id: "airesearch", n: "Zimmer", r: "AI Research Scientist", m: "ZI", exp: "Model behavior, training dynamics, capability limits", bias: "Skeptical of both hype and dismissal", style: "Technical, precise, measured", domain: "technology" },
  { id: "forensics", n: "Gallo", r: "Forensic Scientist", m: "GA", exp: "Physical evidence, chain of custody, lab analysis", bias: "Trusts what can be independently verified", style: "Meticulous, procedural", domain: "science", pref: "groq" },
  { id: "sportscience", n: "Eriksen", r: "Sports Scientist", m: "ER", exp: "Performance, training load, recovery", bias: "Weighs long-term durability over short-term peak", style: "Practical, data-driven", domain: "health", pref: "groq" },
  { id: "theology", n: "Haile", r: "Religious Studies Scholar", m: "HL", exp: "Comparative religion, ethics traditions, meaning-making", bias: "Takes belief systems seriously on their own terms", style: "Respectful, contextual", domain: "humanities", pref: "openai" },
  { id: "energy", n: "Pettersen", r: "Energy Sector Analyst", m: "PT", exp: "Power markets, grid economics, transition trade-offs", bias: "Weighs reliability as heavily as cost or emissions", style: "Systems-minded, pragmatic", domain: "industry" },
  { id: "telecom", n: "Adeleke", r: "Telecom Network Engineer", m: "AK", exp: "Network infrastructure, latency, reliability at scale", bias: "Assumes the failure mode is the interesting part", style: "Technical, blunt", domain: "engineering" },
  { id: "statistician", n: "Wieczorek", r: "Statistician", m: "WI", exp: "Inference, sampling, uncertainty quantification", bias: "Distrusts a single number without a confidence interval", style: "Exact, dry, patient", domain: "science" },
  { id: "careercoach", n: "Nystrom", r: "Career Coach", m: "NY", exp: "Career transitions, negotiation of offers, positioning", bias: "Weighs the person's actual priorities over prestige", style: "Direct, encouraging", domain: "life", pref: "openai" },
  { id: "maritime", n: "Halberg", r: "Maritime & Shipping Analyst", m: "HB", exp: "Global shipping routes, port economics, logistics risk", bias: "Assumes the bottleneck is a port, not the ship", style: "Global, practical", domain: "logistics" },
  { id: "foodscience", n: "Tremblay", r: "Food Scientist", m: "TB", exp: "Food safety, formulation, shelf life", bias: "Assumes the shortcut fails a health inspection", style: "Precise, safety-first", domain: "science", pref: "gemini" },
  { id: "milstrategy", n: "Ibragimov", r: "Military Strategist", m: "IB", exp: "Force posture, deterrence, operational planning", bias: "Assumes the adversary is more capable than assumed", style: "Blunt, contingency-minded", domain: "defense", pref: "groq" },
  { id: "climate", n: "Fennimore", r: "Climate Scientist", m: "FN", exp: "Climate modeling, emissions pathways, physical risk", bias: "Weighs the model ensemble over any single run", style: "Careful, data-first", domain: "science" },
  { id: "astrophysics", n: "Chowdhury", r: "Astrophysicist", m: "CD", exp: "Cosmology, orbital mechanics, observational data", bias: "Comfortable with uncertainty measured in light-years and eons", style: "Curious, precise", domain: "science" },
  { id: "neuroscience", n: "Bianchi", r: "Neuroscientist", m: "BC", exp: "Brain function, neural mechanisms, cognition's biology", bias: "Distrusts folk explanations of behavior", style: "Exact, cautious about overclaiming", domain: "science" },
  { id: "materials", n: "Okwuosa", r: "Materials Scientist", m: "OZ", exp: "Material properties, failure modes, manufacturability", bias: "Assumes the material fails at the joint, not the middle", style: "Technical, exact", domain: "engineering" },
  { id: "robotics", n: "Takahashi", r: "Robotics Engineer", m: "TK", exp: "Actuation, control systems, real-world reliability", bias: "Assumes the demo does not survive contact with reality", style: "Pragmatic, technical", domain: "engineering" },
  { id: "chemeng", n: "Rocha", r: "Chemical Engineer", m: "RO", exp: "Process design, scale-up, safety margins", bias: "Assumes the pilot plant hides a scale-up problem", style: "Methodical, safety-first", domain: "engineering" },
  { id: "civileng", n: "Berglund", r: "Civil Engineer", m: "BG", exp: "Infrastructure, structural safety, load calculations", bias: "Overbuilds for the worst case by default", style: "Conservative, exact", domain: "engineering" },
  { id: "eleceng", n: "Nakagawa", r: "Electrical Engineer", m: "NG", exp: "Circuit design, power systems, signal integrity", bias: "Assumes the failure is a grounding problem until proven otherwise", style: "Precise, methodical", domain: "engineering" },
  { id: "aeroeng", n: "Petrenko", r: "Aerospace Engineer", m: "PN", exp: "Flight systems, propulsion, safety margins at extremes", bias: "Assumes the failure mode is one you have not tested yet", style: "Rigorous, safety-obsessed", domain: "engineering" },
  { id: "manufacturing", n: "Sokolov", r: "Manufacturing Engineer", m: "SK", exp: "Process optimization, throughput, quality control", bias: "Distrusts any process without a control chart", style: "Systematic, exacting", domain: "engineering" },
];

function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}
const EXPERTS = EXPERT_REGISTRY.map((e) => (e.h != null ? e : { ...e, h: hueFor(e.id) }));
const EX = (id: string) => EXPERTS.find((e) => e.id === id) || { id, n: id || "?", r: "Guest", m: String(id || "??").slice(0, 2).toUpperCase(), h: hueFor(String(id || "??")), exp: "", bias: "", style: "", domain: "" };
const PINNABLE = EXPERTS;
const EXPERT_SEATS = 6;

/* ================= EXPERT ROUTER ================= */
const STOPWORDS = new Set(["the","and","for","are","but","not","you","your","all","can","has","have","into","than","then","them","they","its","was","were","that","this","with","from","what","how","should","our","who","whom","when","where","which","while","would","could","about","just","also","more","most","some","such","only","very","much","many","does","did","get","got","out","now","new","use","used"]);
function shortlistExperts(question: string, pinIds: string[], n: number) {
  const words = (question || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const scored = EXPERT_REGISTRY.map((e) => {
    const hay = (e.domain + " " + e.r + " " + e.exp + " " + e.bias).toLowerCase();
    let s = 0;
    words.forEach((w) => { if (hay.includes(w)) s += 1; });
    return { e, s };
  }).sort((a, b) => (b.s - a.s) || (hueFor(a.e.id) - hueFor(b.e.id))).map((x) => x.e);
  const forced = (pinIds || []).map((id) => EXPERT_REGISTRY.find((e) => e.id === id)).filter(Boolean) as typeof EXPERT_REGISTRY;
  const seen = new Set<string>();
  const out: typeof EXPERT_REGISTRY = [];
  for (const e of [...forced, ...scored]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
    if (out.length >= n) break;
  }
  return out;
}

/* ================= MODES ================= */
const MODES = [
  { id: "quick", n: "Quick Decision", x: 3, rounds: 1, research: false, flavor: "Move fast; prioritize a clear, actionable call." },
  { id: "deep", n: "Deep Research", x: 5, rounds: 2, research: true, flavor: "Prioritize evidence, verification and thoroughness." },
  { id: "business", n: "Business Strategy", x: 4, rounds: 2, research: false, flavor: "Focus on market position, economics and execution." },
  { id: "tech", n: "Technical Review", x: 4, rounds: 2, research: false, flavor: "Focus on architecture, feasibility, risk and maintainability." },
  { id: "invest", n: "Investment Committee", x: 4, rounds: 2, research: true, flavor: "Judge as if capital is at stake; price the risk." },
  { id: "science", n: "Scientific Review", x: 4, rounds: 2, research: true, flavor: "Peer-review rigor; methods and evidence quality first." },
  { id: "life", n: "Life Decision", x: 4, rounds: 1, research: false, flavor: "Weigh values, wellbeing and reversibility, not just numbers." },
  { id: "legal", n: "Legal Analysis", x: 3, rounds: 1, research: false, flavor: "Surface obligations, liabilities and safer structures. General analysis, not legal advice." },
  { id: "arch", n: "Architecture Review", x: 4, rounds: 2, research: false, flavor: "Stress-test the design; find what breaks at scale." },
  { id: "brainstorm", n: "Product Brainstorm", x: 4, rounds: 1, research: false, flavor: "Generative first, then converge on the strongest concept." },
  { id: "board", n: "Board Meeting", x: 5, rounds: 2, research: false, flavor: "Governance lens: strategy, risk, accountability." },
  { id: "war", n: "War Room", x: 5, rounds: 2, research: true, flavor: "Adversarial urgency; assume something is wrong and find it." },
];

const STAGES = [
  { id: "understand", n: "Understand" },
  { id: "form", n: "Form" },
  { id: "think", n: "Think" },
  { id: "present", n: "Present" },
  { id: "debate", n: "Debate" },
  { id: "evidence", n: "Evidence" },
  { id: "revise", n: "Revise" },
  { id: "vote", n: "Vote" },
  { id: "verdict", n: "Verdict" },
];

const SAMPLES = [
  "Should I bootstrap my SaaS or raise a seed round this year?",
  "Monolith or microservices for our v1 launch?",
  "Should I relocate my family for a 30% raise?",
];

/* ================= UTILITIES ================= */
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (v: unknown, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(+(v as number)) ? +(v as number) : a));
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(worker));
  return ret;
}

function extractJSON(t: string) {
  if (!t) throw new Error("Empty model response");
  let s = String(t).replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) throw new Error("No JSON found in response");
  return JSON.parse(s.slice(a, b + 1));
}

/* ================= PROVIDERS ================= */
const PROVIDERS = [
  { id: "anthropic", label: "Claude (Anthropic)", defaultModel: "claude-opus-4-5", liveSearch: true,
    hint: "Claude AI — live web research available. This is the recommended default provider." },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o", liveSearch: false,
    hint: "OpenAI GPT models. Fast and broadly capable." },
  { id: "gemini", label: "Gemini", defaultModel: "gemini-1.5-flash", liveSearch: false,
    hint: "Google Gemini models. Good for analysis and long-context tasks." },
  { id: "groq", label: "Grok (xAI)", defaultModel: "grok-3", liveSearch: false,
    hint: "xAI Grok models via the xAI API." },
  { id: "openrouter", label: "OpenRouter", defaultModel: "openai/gpt-4o-mini", liveSearch: false,
    hint: "OpenRouter — route to many models. Use provider/model format (e.g. anthropic/claude-3.7-sonnet)." },
];
const PROV = (id: string) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];

/* ================= PERSISTENCE — localStorage ================= */
const store = {
  get(k: string): any {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  set(k: string, v: unknown): boolean {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  },
};

/* ================= AI PROXY — all calls go through the backend ================= */
async function providerSend(system: string, user: string, tools: unknown[] | undefined, cfg: any): Promise<string> {
  const id = (cfg && cfg.id) || "anthropic";
  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id, model: cfg?.model, system, user, tools }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      let kind = "unknown";
      if (res.status === 429) kind = "rate_limit";
      else if (res.status === 401 || res.status === 403) kind = "auth";
      const e: any = new Error("[" + id + "] " + (data.error || "Request failed"));
      e.kind = kind; e.provider = id;
      throw e;
    }
    if (!data.text) {
      const e: any = new Error("[" + id + "] Empty response from provider");
      e.kind = "unknown"; e.provider = id;
      throw e;
    }
    return data.text as string;
  } catch (e: any) {
    if (e && e.kind) throw e;
    const ne: any = new Error("[" + id + "] Could not reach the AI service. " + ((e && e.message) || ""));
    ne.kind = "network"; ne.provider = id;
    throw ne;
  }
}

async function askJSON(system: string, user: string, tools: unknown[] | undefined, cfg: any): Promise<any> {
  const providerCfg = cfg || { id: "anthropic" };
  let raw: string;
  try {
    raw = await providerSend(system, user, tools, providerCfg);
  } catch (e: any) {
    if (e.kind === "rate_limit") {
      await sleep(1500 + Math.random() * 900);
      raw = await providerSend(system, user, tools, providerCfg);
    } else {
      throw e;
    }
  }
  try {
    return extractJSON(raw);
  } catch {
    const retryRaw = await providerSend(system + " Respond with ONLY one minified valid JSON object. No prose, no markdown.", user, tools, providerCfg);
    return extractJSON(retryRaw);
  }
}

/* ================= COUNCIL ENGINE ================= */
const ENGINE_SYS = "You are the orchestration engine of Adep, a council where AI experts genuinely disagree, pressure-test each other, and converge only when it is earned. Never fake harmony. Respond with ONLY one minified valid JSON object. No prose, no markdown fences.";

function personaSys(e: any) {
  return "You are " + e.n + ", the " + e.r + " on the Adep decision council. Expertise: " + e.exp + ". Known bias: " + e.bias + ". Voice: " + e.style + ". Stay strictly in character. Be specific and opinionated; hedge only where your framework genuinely demands it. Respond with ONLY one minified valid JSON object. No prose, no markdown.";
}

function useCouncil() {
  const [phase, setPhase] = useState("idle");
  const [stageIdx, setStageIdx] = useState(-1);
  const [qText, setQText] = useState("");
  const [modeId, setModeId] = useState("quick");
  const [seats, setSeatsState] = useState<any[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [options, setOptions] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const seatsRef = useRef<any[]>([]);
  const recRef = useRef<any>(null);
  const argsRef = useRef<any>(null);
  const cancelRef = useRef(false);

  const syncSeats = () => setSeatsState(seatsRef.current.map((s: any) => ({ ...s })));
  const seat = (id: string, patch: any) => {
    const s = seatsRef.current.find((x: any) => x.id === id);
    if (s) Object.assign(s, patch);
    syncSeats();
  };
  const push = (item: any) => {
    const it = { id: uid(), ...item };
    setFeed((f) => [...f, it]);
    if (recRef.current) recRef.current.feed.push(it);
    return it;
  };
  const link = (from: string, to: string, k: string) => setLinks((ls) => [...ls.slice(-2), { id: uid(), from, to, k }]);
  const mark = (label: string) => { setLinks([]); push({ t: "stageMark", label }); };
  const bail = () => cancelRef.current;

  async function convene(question: string, mId: string, pins: string[], research: boolean, providerCfg: any, resolveExpertProvider: any) {
    cancelRef.current = false;
    setPhase("running"); setFeed([]); setLinks([]); setOptions(null); setReport(null); setErrMsg(null);
    setQText(question); setModeId(mId); setActive(null);
    const mode = MODES.find((m) => m.id === mId) || MODES[0];
    providerCfg = providerCfg || { id: "anthropic" };
    resolveExpertProvider = resolveExpertProvider || (() => null);
    argsRef.current = { question, mId, pins, research, providerCfg, resolveExpertProvider };
    recRef.current = { id: uid(), ts: Date.now(), q: question, modeId: mId, research, providerId: providerCfg.id, feed: [], report: null, options: null, seatIds: [], seatProviders: {}, confs: {} };
    try {
      /* Stage 1 — Understanding */
      setStageIdx(0); setBusy("Reading the question");
      const idx = store.get("adep:index") || { meetings: [] };
      const recent = idx.meetings.slice(-2).map((m: any) => '- "' + m.q + '" decided: ' + (m.rec || "-") + " (confidence " + (m.conf == null ? "?" : m.conf) + "%)").join("\n");
      const shortlisted = shortlistExperts(question, pins, 24);
      const roster = shortlisted.map((e) => e.id + ": " + e.r + " (" + e.domain + ") - " + e.exp + ". Bias: " + e.bias).join("\n");
      const a = await askJSON(
        ENGINE_SYS,
        'Question: """' + question + '"""\nMode: ' + mode.n + " - " + mode.flavor + "\nCandidate experts (pick by id):\n" + roster +
        (pins.length ? "\nMust include these ids: " + pins.join(", ") : "") +
        (recent ? "\nPrior council decisions for context:\n" + recent : "") +
        '\nSelect the ' + EXPERT_SEATS + ' most relevant experts for this specific question.' +
        '\nReturn {"interpretation":"1-2 sentences on what is really being asked","ambiguities":["0-2 short items"],"expertIds":["exactly ' + EXPERT_SEATS + ' ids"],"opening":"1-2 sentence neutral framing of what the council is about to examine"}',
        undefined, providerCfg
      );
      if (bail()) return;

      /* Stage 2 — Formation */
      setStageIdx(1); setBusy("Seating the council");
      let ids: string[] = (a.expertIds || []).filter((id: string) => EXPERT_REGISTRY.some((e) => e.id === id));
      pins.forEach((p) => { if (EXPERT_REGISTRY.some((e) => e.id === p) && !ids.includes(p)) ids.unshift(p); });
      ids = [...new Set(ids)].slice(0, EXPERT_SEATS);
      const FALLBACK = ["ceo", "cto", "risk", "psych", "economist", "scientist"];
      for (const f of FALLBACK) { if (ids.length >= EXPERT_SEATS) break; if (!ids.includes(f)) ids.push(f); }
      const seatIds = ids;
      const seatProviders: Record<string, any> = {};
      seatIds.forEach((id) => {
        const meta = EX(id);
        const resolved = (meta as any).pref ? resolveExpertProvider((meta as any).pref) : null;
        seatProviders[id] = resolved || providerCfg;
      });
      recRef.current.seatIds = seatIds;
      recRef.current.seatProviders = Object.fromEntries(Object.entries(seatProviders).map(([k, v]: [string, any]) => [k, v.id]));
      seatsRef.current = seatIds.map((id) => ({ id, conf: null, status: "idle", providerId: seatProviders[id].id }));
      syncSeats();
      mark("The council convenes");
      push(seatIds.includes("moderator")
        ? { t: "mod", text: a.opening || "The council is in session." }
        : { t: "note", label: "Council", text: a.opening || "The council is in session." });
      if (a.interpretation) push({ t: "note", label: "Reading of the question", text: a.interpretation + (a.ambiguities && a.ambiguities.length ? " Open ambiguities: " + a.ambiguities.join("; ") : "") });
      await sleep(700);
      if (bail()) return;

      /* Stage 3 — Independent thinking */
      setStageIdx(2); setBusy("Experts thinking independently");
      const voters = seatIds;
      voters.forEach((id) => seat(id, { status: "thinking" }));
      mark("Independent thinking - no member sees another's view");
      const openings: Record<string, any> = {};
      await mapLimit(voters, 3, async (id) => {
        const e = EX(id);
        const cfg = seatProviders[id] || providerCfg;
        const j = await askJSON(
          personaSys(e),
          'Council question: """' + question + '"""\nMode flavor: ' + mode.flavor +
          "\nYou have NOT seen any other member's view. Reason independently from your own framework." +
          '\nReturn {"stance":"your position in one sharp sentence","points":["2-3 short supporting points"],"assumptions":["1-2 assumptions you are making"],"unknowns":["1-2 things you would want to know"],"confidence":"integer 0-100"}',
          undefined, cfg
        );
        openings[id] = j;
        seat(id, { status: "done", conf: clamp(j.confidence, 5, 99), providerId: cfg.id });
      });
      if (bail()) return;

      /* Stage 4 — Presentation */
      setStageIdx(3); setBusy("Opening statements");
      mark("Opening statements");
      for (const id of voters) {
        if (bail()) return;
        const o = openings[id];
        setActive(id);
        push({ t: "opening", sId: id, stance: o.stance, points: o.points || [], assumptions: o.assumptions || [], unknowns: o.unknowns || [], confidence: clamp(o.confidence, 5, 99), providerId: (seatProviders[id] || providerCfg).id });
        await sleep(650);
      }
      setActive(null);

      /* Stage 5 — Debate */
      setStageIdx(4);
      const ser = voters.map((id) => {
        const e = EX(id); const o = openings[id];
        return id + " (" + e.r + ", conf " + clamp(o.confidence, 5, 99) + "%): " + o.stance + " | " + (o.points || []).join("; ");
      }).join("\n");
      const debateAll: any[] = [];
      for (let round = 1; round <= mode.rounds; round++) {
        setBusy(round === 1 ? "The floor is open" : "Round two - pressing the disagreements");
        mark("Debate - round " + round);
        const prev = debateAll.map((m) => m.s + " " + m.k + (m.tgt ? " to " + m.tgt : "") + ": " + m.x).join("\n");
        const d = await askJSON(
          ENGINE_SYS,
          'Question: """' + question + '"""\nOpening positions:\n' + ser +
          (prev ? "\nDebate so far:\n" + prev : "") +
          "\nSimulate the " + (round === 1 ? "first" : "second") + ' round of live debate between these members (ids above).' +
          "\nRules: at least 3 genuine challenges; " + (seatIds.includes("devil") ? "the devil's-advocate member must attack the strongest emerging consensus; " : "") + "members question assumptions, demand evidence, and expose weak reasoning; a concession only if genuinely earned; speak in first person, 26 words max per message; " +
          (round > 1 ? "escalate what is unresolved and converge ONLY where earned." : "do not converge yet.") +
          '\nReturn {"messages":[{"s":"speakerId","k":"challenge|support|question|evidence|concession|clarify","tgt":"targetId or null","x":"the message","dc":"integer -12 to 12 change to the SPEAKER\'s own confidence"}]} with 9-13 messages.',
          undefined, providerCfg
        );
        const msgs = (d.messages || []).filter((m: any) => seatIds.includes(m.s));
        for (const m of msgs) {
          if (bail()) return;
          setActive(m.s);
          const kk = KIND[m.k] ? m.k : "clarify";
          const tgt = m.tgt && seatIds.includes(m.tgt) ? m.tgt : null;
          if (tgt) link(m.s, tgt, kk);
          const dc = clamp(m.dc, -12, 12);
          push({ t: "debate", sId: m.s, k: kk, tId: tgt, x: m.x, dc });
          const s = seatsRef.current.find((x: any) => x.id === m.s);
          if (s && s.conf != null && dc) seat(m.s, { conf: clamp(s.conf + dc, 3, 99) });
          debateAll.push({ s: m.s, k: kk, tgt, x: m.x });
          await sleep(760);
        }
        setActive(null);
      }
      if (bail()) return;

      /* Stage 6 — Evidence review */
      const factSeated = seatIds.includes("fact");
      const factCfg = factSeated ? (seatProviders["fact"] || providerCfg) : providerCfg;
      const canSearch = research && factCfg.id === "anthropic";
      setStageIdx(5); setBusy(factSeated ? (canSearch ? "Fact checker researching live" : "Fact checker reviewing claims") : "Verifying key claims");
      mark("Evidence review");
      if (factSeated) { seat("fact", { status: "thinking" }); setActive("fact"); }
      const searchClause = canSearch
        ? "Use the web_search tool for at most 3 searches to verify, then give your final answer as ONLY the JSON object."
        : "Verify from your knowledge; mark anything you cannot verify as uncertain.";
      const evUser =
        'Question: """' + question + '"""\nPositions:\n' + ser +
        "\nDebate:\n" + debateAll.map((m) => m.s + ": " + m.x).join("\n") +
        "\nIdentify the 3-4 most decision-relevant checkable claims made above and verify them. " + searchClause +
        '\nReturn {"checks":[{"claim":"18 words max","by":"speakerId","verdict":"verified|disputed|uncertain","note":"18 words max","source":"short source name or null"}]}';
      const evSys = factSeated ? personaSys(EX("fact")) : ENGINE_SYS;
      let ev: any = { checks: [] };
      try {
        ev = await askJSON(evSys, evUser, canSearch ? [{ type: "web_search_20250305", name: "web_search" }] : undefined, factCfg);
      } catch {
        try {
          ev = await askJSON(evSys, evUser.replace(searchClause, "Verify from your knowledge; mark anything you cannot verify as uncertain."), undefined, factCfg);
        } catch { ev = { checks: [] }; }
      }
      for (const ch of (ev.checks || []).slice(0, 5)) {
        if (bail()) return;
        push({ t: "evidence", claim: ch.claim, by: ch.by, verdict: ch.verdict, note: ch.note, source: ch.source || null });
        if (ch.verdict === "disputed" && ch.by) {
          const s = seatsRef.current.find((x: any) => x.id === ch.by);
          if (s && s.conf != null) seat(ch.by, { conf: clamp(s.conf - 8, 3, 99) });
        }
        await sleep(650);
      }
      if (factSeated) { seat("fact", { status: "done" }); setActive(null); }
      if (bail()) return;

      /* Stages 7 + 8 — Revision and ballot */
      setStageIdx(6); setBusy("Positions being revised");
      mark("Revision and ballot");
      await sleep(500);
      setStageIdx(7); setBusy("Casting ballots");
      const v = await askJSON(
        ENGINE_SYS,
        'Question: """' + question + '"""\nPositions:\n' + ser +
        "\nDebate:\n" + debateAll.map((m) => m.s + " (" + m.k + "): " + m.x).join("\n") +
        "\nEvidence checks:\n" + ((ev.checks || []).map((c: any) => c.verdict + ": " + c.claim).join("\n") || "none") +
        "\nDefine 2-3 mutually exclusive decision options that emerged, then have each voting member (" + voters.join(", ") + ") cast a ballot reflecting how the debate and evidence actually moved them. Belief revision must be honest - some members should have changed." +
        '\nReturn {"options":[{"id":"A","label":"9 words max"}],"ballots":[{"s":"memberId","vote":"A","conf":"integer 0-100","changed":true,"note":"12 words max"}],"chair":"one-sentence neutral synthesis of where the vote landed"}',
        undefined, providerCfg
      );
      if (bail()) return;
      const opts = (v.options || []).slice(0, 3);
      const ballots = (v.ballots || []).filter((b: any) => voters.includes(b.s));
      const totals: Record<string, number> = {};
      opts.forEach((o: any) => { totals[o.id] = 0; });
      ballots.forEach((b: any) => {
        const c = clamp(b.conf, 1, 100);
        if (totals[b.vote] == null) totals[b.vote] = 0;
        totals[b.vote] += c;
        seat(b.s, { conf: c });
      });
      const winner = Object.keys(totals).sort((x, y) => totals[y] - totals[x])[0];
      for (const b of ballots) {
        if (bail()) return;
        setActive(b.s);
        push({ t: "ballot", sId: b.s, vote: b.vote, conf: clamp(b.conf, 1, 100), changed: !!b.changed, note: b.note || "" });
        await sleep(520);
      }
      setActive(null);
      const optPack = { options: opts, totals, winner, unanimous: ballots.length > 0 && ballots.every((b: any) => b.vote === ballots[0].vote) };
      setOptions(optPack); recRef.current.options = optPack;
      push({ t: "options", ...optPack });
      if (v.chair) push(seatIds.includes("moderator") ? { t: "mod", text: v.chair } : { t: "note", label: "Council", text: v.chair });
      if (bail()) return;

      /* Stage 9 — Consensus */
      setStageIdx(8); setBusy("Drafting the verdict");
      const winLabel = (opts.find((o: any) => o.id === winner) || {}).label || "-";
      const r = await askJSON(
        ENGINE_SYS,
        'Question: """' + question + '"""\nWinning option: ' + winLabel + " (weighted vote " + (totals[winner] || 0) + ")" +
        "\nAll options: " + opts.map((o: any) => o.id + ": " + o.label + " (" + (totals[o.id] || 0) + ")").join(" | ") +
        "\nBallots: " + ballots.map((b: any) => b.s + " voted " + b.vote + " at " + clamp(b.conf, 1, 100) + "%" + (b.changed ? " (revised)" : "")).join(", ") +
        "\nPositions:\n" + ser +
        "\nEvidence:\n" + ((ev.checks || []).map((c: any) => c.verdict + ": " + c.claim + " - " + c.note).join("\n") || "none") +
        "\nWrite the council's final report. Preserve real dissent - the minority holder must be an actual dissenting or lowest-confidence member. Be concise." +
        '\nReturn {"title":"7 words max","recommendation":"1-2 decisive sentences","confidence":"integer 0-100","summary":"3-4 sentence executive summary","evidence":["3-4 strongest supporting points"],"counter":["2-3 strongest counterarguments"],"minority":{"holder":"memberId","view":"1-2 sentence dissent"},"risks":[{"r":"risk, 12 words max","sev":"high|med|low","m":"mitigation, 12 words max"}],"tradeoffs":["2-3 items"],"plan":["3-5 concrete next steps"],"followups":["3 sharp follow-up questions"],"sources":["short source names, only if evidence cited any"]}',
        undefined, providerCfg
      );
      if (bail()) return;
      push(seatIds.includes("moderator") ? { t: "mod", text: "The council has reached its verdict." } : { t: "note", label: "Council", text: "The council has reached its verdict." });
      r.confidence = clamp(r.confidence, 1, 100);
      setReport(r); recRef.current.report = r;
      recRef.current.confs = Object.fromEntries(seatsRef.current.map((s: any) => [s.id, s.conf]));
      setPhase("report"); setBusy("");

      /* Persist the meeting */
      const rec = recRef.current;
      store.set("adep:meeting:" + rec.id, rec);
      idx.meetings.push({ id: rec.id, ts: rec.ts, q: rec.q, title: r.title || rec.q.slice(0, 60), conf: r.confidence, rec: winLabel, modeId: mId, seatIds: rec.seatIds, unanimous: optPack.unanimous, providerId: providerCfg.id });
      if (idx.meetings.length > 40) idx.meetings = idx.meetings.slice(-40);
      store.set("adep:index", idx);
    } catch (err: any) {
      console.error(err);
      setErrMsg((err && err.message) || "The council hit an unexpected error.");
      setPhase("error"); setBusy("");
    }
  }

  async function followUp(text: string, providerCfg: any) {
    if (!report || !text.trim()) return;
    providerCfg = providerCfg || (argsRef.current && argsRef.current.providerCfg) || { id: "anthropic" };
    setPhase("running"); setBusy("The council reconvenes"); setStageIdx(4);
    push({ t: "user", text });
    try {
      const seatIds = (recRef.current && recRef.current.seatIds.length ? recRef.current.seatIds : seatsRef.current.map((s: any) => s.id));
      const members = seatIds;
      const j = await askJSON(
        ENGINE_SYS,
        'Earlier verdict on """' + (argsRef.current ? argsRef.current.question : qText) + '""": ' + report.recommendation + " (confidence " + report.confidence + "%)." +
        "\nMinority view: " + ((report.minority && report.minority.view) || "-") +
        '\nThe user now challenges or asks: """' + text + '"""' +
        "\nHave 2-4 of these members (" + members.join(", ") + ") respond directly - pushing back or updating honestly - then give an addendum." +
        '\nReturn {"messages":[{"s":"memberId","k":"challenge|support|question|concession|clarify","x":"26 words max"}],"addendum":"2-3 sentences: does the verdict hold, change, or gain a caveat?","confidence":"integer 0-100"}',
        undefined, providerCfg
      );
      for (const m of (j.messages || [])) {
        if (!seatIds.includes(m.s)) continue;
        setActive(m.s);
        push({ t: "debate", sId: m.s, k: KIND[m.k] ? m.k : "clarify", tId: null, x: m.x, dc: 0 });
        await sleep(700);
      }
      setActive(null);
      const newConf = j.confidence == null ? report.confidence : clamp(j.confidence, 1, 100);
      push({ t: "addendum", text: j.addendum || "The verdict stands.", conf: newConf });
      const r2 = { ...report, confidence: newConf, addendum: (report.addendum || []).concat([{ q: text, a: j.addendum || "The verdict stands.", conf: newConf }]) };
      setReport(r2);
      if (recRef.current) { recRef.current.report = r2; store.set("adep:meeting:" + recRef.current.id, recRef.current); }
    } catch (e: any) {
      push({ t: "note", label: "Reconvene failed", text: (e && e.message) || "Please try again." });
    }
    setPhase("report"); setBusy("");
  }

  function reset() {
    cancelRef.current = true;
    setPhase("idle"); setStageIdx(-1); setFeed([]); setLinks([]); setActive(null);
    setBusy(""); setOptions(null); setReport(null); setErrMsg(null); setQText("");
    seatsRef.current = []; syncSeats();
  }

  function retry() {
    const a = argsRef.current;
    if (a) convene(a.question, a.mId, a.pins, a.research, a.providerCfg, a.resolveExpertProvider);
  }

  return { phase, stageIdx, qText, modeId, seats, feed, links, active, busy, options, report, errMsg, convene, followUp, reset, retry };
}

/* ================= PRIMITIVES ================= */
function Mono({ e, size = 30 }: { e: any; size?: number }) {
  return (
    <div aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", flex: "none",
      background: "hsl(" + e.h + " 42% 17%)", border: "1px solid hsl(" + e.h + " 45% 34%)",
      color: "hsl(" + e.h + " 65% 78%)", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: MONO, fontSize: Math.round(size * 0.36), fontWeight: 600 }}>
      {e.m}
    </div>
  );
}

function Cap({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontFamily: SANS, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: C.faint, fontWeight: 600, ...style }}>{children}</div>;
}

function ConfPill({ v }: { v: number }) {
  const col = v >= 70 ? C.good : v >= 45 ? C.warn : C.bad;
  return <span style={{ fontFamily: MONO, fontSize: 11.5, color: col, border: "1px solid " + C.line2, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>{v}%</span>;
}

function Card({ children, style, accent, className }: { children: React.ReactNode; style?: React.CSSProperties; accent?: string; className?: string }) {
  return (
    <div className={className || "fu"} style={{ background: C.bg2, border: "1px solid " + C.line,
      borderLeft: accent ? "3px solid " + accent : "1px solid " + C.line, borderRadius: 12, padding: "12px 14px", ...style }}>
      {children}
    </div>
  );
}

function Ghost({ children, onClick, style, label }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties; label?: string }) {
  return (
    <button onClick={onClick} aria-label={label} style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.dim,
      border: "1px solid " + C.line2, borderRadius: 10, padding: "8px 13px", background: "transparent", ...style }}>
      {children}
    </button>
  );
}

/* ================= THE COUNCIL TABLE ================= */
function SeatRing({ seats, active, links, title, sub }: any) {
  const W = 640, H = 434, cx = W / 2, cy = H / 2 + 2, rx = 236, ry = 146;
  const pos: Record<string, { x: number; y: number }> = {};
  const n = Math.max(seats.length, 1);
  seats.forEach((s: any, i: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pos[s.id] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
  return (
    <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Council table">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={C.line} strokeDasharray="2 6" />
      <ellipse cx={cx} cy={cy} rx={148} ry={84} fill={C.bg1} stroke={C.line2} />
      <ellipse cx={cx} cy={cy} rx={136} ry={74} fill="none" stroke="rgba(201,163,92,0.12)" />
      {links.map((l: any) => (pos[l.from] && pos[l.to]) ? (
        <line key={l.id} x1={pos[l.from].x} y1={pos[l.from].y} x2={pos[l.to].x} y2={pos[l.to].y}
          stroke={(KIND[l.k] || KIND.clarify).c} strokeWidth="1.6" strokeLinecap="round" className="lk" />
      ) : null)}
      <text x={cx} y={cy - 6} textAnchor="middle" fill={C.brassHi} fontFamily={SERIF} fontSize="21" fontWeight="600">{title}</text>
      {sub ? (
        <text x={cx} y={cy + 18} textAnchor="middle" fill={C.dim} fontFamily={SANS} fontSize="11.5" className="thinkdot">{sub + "…"}</text>
      ) : null}
      {seats.map((s: any) => {
        const e = EX(s.id); const p = pos[s.id]; if (!p) return null; const r = 24; const CIRC = 2 * Math.PI * (r + 5);
        return (
          <g key={s.id} transform={"translate(" + p.x + "," + p.y + ")"}>
            {active === s.id ? <circle r={r + 11} fill="none" stroke={C.brass} strokeWidth="1.5" className="glowp" /> : null}
            {s.conf != null ? (
              <circle r={r + 5} fill="none" stroke={"hsl(" + e.h + " 60% 55%)"} strokeWidth="2.5" opacity="0.85"
                strokeDasharray={((CIRC * s.conf) / 100) + " " + CIRC} transform="rotate(-90)" strokeLinecap="round" />
            ) : null}
            <circle r={r} fill={"hsl(" + e.h + " 40% 16%)"} stroke={"hsl(" + e.h + " 45% 34%)"} />
            <text y="4.5" textAnchor="middle" fill={"hsl(" + e.h + " 65% 80%)"} fontFamily={MONO} fontSize="12" fontWeight="600">{e.m}</text>
            {s.status === "thinking" ? <circle cx={r - 4} cy={-r + 4} r="4" fill={C.brass} className="thinkdot" /> : null}
            {s.status === "done" ? <circle cx={r - 4} cy={-r + 4} r="3.5" fill={C.good} /> : null}
            <text y={r + 16} textAnchor="middle" fill={C.ink} fontFamily={SANS} fontSize="11" fontWeight="600">{e.n}</text>
            <text y={r + 28} textAnchor="middle" fill={C.faint} fontFamily={SANS} fontSize="9">{e.r}</text>
            {s.conf != null ? <text y={r + 40} textAnchor="middle" fill={C.dim} fontFamily={MONO} fontSize="9">{s.conf + "%"}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

function StageRail({ idx }: { idx: number }) {
  return (
    <div className="rowscroll" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "2px 2px 8px" }}>
      {STAGES.map((s, i) => {
        const st = i < idx ? "done" : i === idx ? "active" : "todo";
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, flex: "none",
            padding: "5px 10px", borderRadius: 999, border: "1px solid " + (st === "active" ? C.brass : C.line),
            background: st === "active" ? C.brassDim : st === "done" ? C.bg2 : "transparent" }}>
            <div className={st === "active" ? "thinkdot" : ""} style={{ width: 6, height: 6, borderRadius: 99,
              background: st === "todo" ? C.line2 : st === "done" ? C.brass : C.brassHi }} />
            <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
              color: st === "todo" ? C.faint : st === "active" ? C.brassHi : C.dim }}>{s.n}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ================= TRANSCRIPT RENDERING ================= */
function NameLine({ e, extra }: { e: any; extra?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.ink }}>{e.n}</span>
      <span style={{ fontFamily: SANS, fontSize: 11, color: C.faint }}>{e.r}</span>
      {extra}
    </div>
  );
}

function ProviderTag({ id }: { id: string }) {
  return <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint, border: "1px solid " + C.line, borderRadius: 4, padding: "1px 5px" }}>{PROV(id || "anthropic").label}</span>;
}

function OptionsPanel({ options, totals, winner, unanimous }: any) {
  const max = Math.max(...options.map((o: any) => totals[o.id] || 0), 1);
  return (
    <Card accent={C.brass}>
      <Cap style={{ color: C.brass }}>{"Weighted ballot" + (unanimous ? " · unanimous" : "")}</Cap>
      {options.map((o: any) => {
        const vv = totals[o.id] || 0; const w = Math.round((vv / max) * 100);
        return (
          <div key={o.id} style={{ margin: "12px 0 2px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.brassHi }}>{o.id}</span>
              <span style={{ fontFamily: SANS, fontSize: 13, color: C.ink, flex: 1 }}>{o.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim }}>{vv}</span>
              {o.id === winner ? <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: "#14100A", background: C.brass, borderRadius: 5, padding: "1px 6px" }}>SELECTED</span> : null}
            </div>
            <div style={{ height: 6, background: C.bg3, borderRadius: 99, marginTop: 6, overflow: "hidden" }}>
              <div className="gb" style={{ height: "100%", width: w + "%", background: o.id === winner ? C.brass : C.line2, borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function renderItem(it: any): React.ReactNode {
  if (it.t === "stageMark") {
    return (
      <div key={it.id} className="fu" style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 2px" }}>
        <div style={{ height: 1, flex: 1, background: C.line }} />
        <Cap style={{ color: C.brass, textAlign: "center" }}>{it.label}</Cap>
        <div style={{ height: 1, flex: 1, background: C.line }} />
      </div>
    );
  }
  if (it.t === "mod") {
    const e = EX("moderator");
    return (
      <Card key={it.id} accent={C.brass}>
        <div style={{ display: "flex", gap: 10 }}>
          <Mono e={e} size={28} />
          <div style={{ flex: 1 }}>
            <NameLine e={e} />
            <div style={{ fontFamily: SERIF, fontSize: 15, color: C.ink, lineHeight: 1.55, marginTop: 4 }}>{it.text}</div>
          </div>
        </div>
      </Card>
    );
  }
  if (it.t === "note") {
    return (
      <Card key={it.id} style={{ background: C.bg1 }}>
        <Cap>{it.label}</Cap>
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.dim, lineHeight: 1.55, marginTop: 5 }}>{it.text}</div>
      </Card>
    );
  }
  if (it.t === "opening") {
    const e = EX(it.sId);
    return (
      <Card key={it.id}>
        <div style={{ display: "flex", gap: 10 }}>
          <Mono e={e} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}><NameLine e={e} extra={<ProviderTag id={it.providerId} />} /></div>
              <ConfPill v={it.confidence} />
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 15.5, color: C.ink, lineHeight: 1.5, margin: "7px 0 6px" }}>{it.stance}</div>
            {(it.points || []).map((p: string, i: number) => (
              <div key={i} style={{ display: "flex", gap: 7, fontFamily: SANS, fontSize: 13, color: C.dim, lineHeight: 1.5, marginTop: 3 }}>
                <span style={{ color: C.brass }}>·</span><span>{p}</span>
              </div>
            ))}
            {(it.assumptions || []).length ? (
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint, marginTop: 8 }}>
                <span style={{ color: C.dim, fontWeight: 600 }}>Assumes </span>{it.assumptions.join("; ")}
              </div>
            ) : null}
            {(it.unknowns || []).length ? (
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint, marginTop: 3 }}>
                <span style={{ color: C.dim, fontWeight: 600 }}>Wants to know </span>{it.unknowns.join("; ")}
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }
  if (it.t === "debate") {
    const e = EX(it.sId); const tg = it.tId ? EX(it.tId) : null; const kk = KIND[it.k] || KIND.clarify;
    return (
      <div key={it.id} className="fu" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "2px 2px" }}>
        <Mono e={e} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.ink }}>{e.n}</span>
            <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 600, color: kk.c, background: kk.c + "22", border: "1px solid " + kk.c + "44", borderRadius: 5, padding: "1px 7px" }}>
              {kk.l + (tg ? " " + tg.n : "")}
            </span>
            {it.dc ? (
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: it.dc > 0 ? C.good : C.bad }}>
                {(it.dc > 0 ? "+" : "") + it.dc + "%"}
              </span>
            ) : null}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.ink, lineHeight: 1.55, marginTop: 3 }}>{it.x}</div>
        </div>
      </div>
    );
  }
  if (it.t === "evidence") {
    const vcol = it.verdict === "verified" ? C.good : it.verdict === "disputed" ? C.bad : C.warn;
    const by = it.by ? EX(it.by) : null;
    return (
      <Card key={it.id} accent={C.viol}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: vcol, background: vcol + "1E", border: "1px solid " + vcol + "44", borderRadius: 5, padding: "2px 8px" }}>{it.verdict}</span>
          {by ? <span style={{ fontFamily: SANS, fontSize: 11, color: C.faint }}>{"on " + by.n + "'s claim"}</span> : null}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.ink, lineHeight: 1.5, marginTop: 7 }}>{it.claim}</div>
        {it.note ? <div style={{ fontFamily: SANS, fontSize: 12, color: C.dim, lineHeight: 1.5, marginTop: 4 }}>{it.note}</div> : null}
        {it.source ? <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, marginTop: 6 }}>{"Source: " + it.source}</div> : null}
      </Card>
    );
  }
  if (it.t === "ballot") {
    const e = EX(it.sId);
    return (
      <div key={it.id} className="fu" style={{ display: "flex", alignItems: "center", gap: 9, padding: "3px 2px", flexWrap: "wrap" }}>
        <Mono e={e} size={26} />
        <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.ink }}>{e.n}</span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.brassHi, border: "1px solid " + C.brass + "66", borderRadius: 5, padding: "1px 8px" }}>{it.vote}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim }}>{it.conf + "%"}</span>
        {it.changed ? <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: C.warn, background: C.warn + "1E", borderRadius: 5, padding: "1px 6px" }}>REVISED</span> : null}
        {it.note ? <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint }}>{it.note}</span> : null}
      </div>
    );
  }
  if (it.t === "options") return <OptionsPanel key={it.id} options={it.options} totals={it.totals} winner={it.winner} unanimous={it.unanimous} />;
  if (it.t === "user") {
    return (
      <div key={it.id} className="fu" style={{ alignSelf: "flex-end", maxWidth: "88%" }}>
        <Card accent={C.brass} style={{ background: C.brassDim }}>
          <Cap style={{ color: C.brass }}>You, to the council</Cap>
          <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.ink, lineHeight: 1.5, marginTop: 5 }}>{it.text}</div>
        </Card>
      </div>
    );
  }
  if (it.t === "addendum") {
    return (
      <Card key={it.id} accent={C.brass}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cap style={{ color: C.brass, flex: 1 }}>Council addendum</Cap>
          {it.conf != null ? <ConfPill v={it.conf} /> : null}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 15, color: C.ink, lineHeight: 1.55, marginTop: 6 }}>{it.text}</div>
      </Card>
    );
  }
  return null;
}

/* ================= THE VERDICT REPORT ================= */
function ConfMeter({ v }: { v: number }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Cap>Council confidence</Cap>
        <span style={{ fontFamily: MONO, fontSize: 22, color: C.brassHi }}>{v}%</span>
      </div>
      <div style={{ height: 8, background: C.bg3, borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
        <div className="gb" style={{ width: v + "%", height: "100%", borderRadius: 99, background: "linear-gradient(90deg, " + C.brass + ", " + C.brassHi + ")" }} />
      </div>
    </div>
  );
}

function Section({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ marginTop: 22, ...style }}>
      <Cap style={{ marginBottom: 9 }}>{label}</Cap>
      {children}
    </div>
  );
}

function DotList({ items, color }: { items: string[]; color: string }) {
  return (
    <div>
      {(items || []).map((x, i) => (
        <div key={i} style={{ display: "flex", gap: 8, fontFamily: SANS, fontSize: 13.5, color: C.dim, lineHeight: 1.6, marginTop: i ? 6 : 0 }}>
          <span style={{ color: color, marginTop: 1 }}>●</span>
          <span style={{ color: C.ink }}>{x}</span>
        </div>
      ))}
    </div>
  );
}

function ReportView({ r, options, onFollow }: any) {
  if (!r) return null;
  const minor = r.minority && r.minority.holder ? EX(r.minority.holder) : null;
  const winLabel = options ? ((options.options.find((o: any) => o.id === options.winner) || {}).label || null) : null;
  const sev: Record<string, string> = { high: C.bad, med: C.warn, low: C.dim };
  return (
    <div className="fu" style={{ maxWidth: 700, margin: "0 auto" }}>
      <Cap style={{ color: C.brass }}>Council verdict</Cap>
      <h1 style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 600, color: C.ink, lineHeight: 1.2, margin: "8px 0 16px" }}>{r.title}</h1>

      <Card accent={C.brass} style={{ padding: "16px 16px" }}>
        <div style={{ fontFamily: SERIF, fontSize: 17.5, color: C.ink, lineHeight: 1.55 }}>{r.recommendation}</div>
        {winLabel ? (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.faint, marginTop: 8 }}>
            {"Carried by weighted ballot: " + winLabel + (options.unanimous ? " · unanimous" : "")}
          </div>
        ) : null}
        <div style={{ marginTop: 16 }}><ConfMeter v={r.confidence} /></div>
      </Card>

      <Section label="Executive summary">
        <div style={{ fontFamily: SANS, fontSize: 14, color: C.dim, lineHeight: 1.7 }}>{r.summary}</div>
      </Section>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
        <Card style={{ flex: "1 1 260px" }}>
          <Cap style={{ marginBottom: 9 }}>Why — strongest support</Cap>
          <DotList items={r.evidence} color={C.good} />
        </Card>
        <Card style={{ flex: "1 1 260px" }}>
          <Cap style={{ marginBottom: 9 }}>Why not — strongest counters</Cap>
          <DotList items={r.counter} color={C.bad} />
        </Card>
      </div>

      {minor ? (
        <Section label="Minority report">
          <Card accent={C.bad}>
            <div style={{ display: "flex", gap: 10 }}>
              <Mono e={minor} size={30} />
              <div style={{ flex: 1 }}>
                <NameLine e={minor} />
                <div style={{ fontFamily: SERIF, fontSize: 14.5, color: C.ink, lineHeight: 1.55, marginTop: 5 }}>{r.minority.view}</div>
              </div>
            </div>
          </Card>
        </Section>
      ) : null}

      {(r.risks || []).length ? (
        <Section label="Risk register">
          {r.risks.map((k: any, i: number) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: i ? 9 : 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, marginTop: 5, flex: "none", background: sev[k.sev] || C.dim }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontFamily: SANS, fontSize: 13.5, color: C.ink }}>{k.r}</span>
                <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.faint }}>{" — " + (k.m || "")}</span>
              </div>
            </div>
          ))}
        </Section>
      ) : null}

      {(r.tradeoffs || []).length ? (
        <Section label="Trade-offs accepted">
          <DotList items={r.tradeoffs} color={C.warn} />
        </Section>
      ) : null}

      {(r.plan || []).length ? (
        <Section label="Action plan">
          {r.plan.map((p: string, i: number) => (
            <div key={i} style={{ display: "flex", gap: 11, marginTop: i ? 9 : 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.brass, marginTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontFamily: SANS, fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>{p}</span>
            </div>
          ))}
        </Section>
      ) : null}

      {(r.sources || []).length ? (
        <Section label="Sources consulted">
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.faint, lineHeight: 1.9 }}>{r.sources.join(" · ")}</div>
        </Section>
      ) : null}

      {(r.addendum || []).map((ad: any, i: number) => (
        <Section key={i} label={"Addendum " + (i + 1)}>
          <Card accent={C.brass}>
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.faint, marginBottom: 6 }}>{"You asked: " + ad.q}</div>
            <div style={{ fontFamily: SERIF, fontSize: 14.5, color: C.ink, lineHeight: 1.55 }}>{ad.a}</div>
          </Card>
        </Section>
      ))}

      {(r.followups || []).length ? (
        <Section label="Ask the council next">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {r.followups.map((f: string, i: number) => (
              <button key={i} onClick={onFollow ? () => onFollow(f) : undefined}
                style={{ fontFamily: SANS, fontSize: 12.5, color: C.dim, border: "1px solid " + C.line2, borderRadius: 999,
                  padding: "8px 13px", background: C.bg2, textAlign: "left", cursor: onFollow ? "pointer" : "default" }}>
                {f}
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

/* ================= PROVIDER CONFIG — server-side keys ================= */
function useProviderConfig() {
  const [providerId, setProviderId] = useState("anthropic");
  const [models, setModels] = useState<Record<string, string>>({});
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    // Load saved model preferences from localStorage
    const saved = store.get("adep:providerPrefs");
    if (saved) {
      if (saved.providerId) setProviderId(saved.providerId);
      if (saved.models) setModels(saved.models);
    }
    setPrefsLoaded(true);

    // Ask the server which providers are configured
    fetch("/api/ai/providers")
      .then((r) => r.json())
      .then((d: any) => {
        const avail: string[] = d.available || [];
        setAvailableIds(avail);
        // Auto-select the first available provider if current isn't available
        if (avail.length > 0 && !avail.includes(providerId)) {
          setProviderId(avail[0]);
        }
        setServerLoaded(true);
      })
      .catch(() => { setAvailableIds(["anthropic"]); setServerLoaded(true); });
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    store.set("adep:providerPrefs", { providerId, models });
  }, [prefsLoaded, providerId, models]);

  const setModel = (id: string, m: string) => setModels((s) => ({ ...s, [id]: m }));
  const isAvailable = (id: string) => availableIds.includes(id);

  const resolveFor = (id: string | null) => {
    if (!id || !isAvailable(id)) return null;
    const m = PROV(id);
    return { id, model: models[id] || m.defaultModel };
  };

  const meta = PROV(providerId);
  const cfg = { id: providerId, model: models[providerId] || meta.defaultModel };
  const ready = serverLoaded && isAvailable(providerId);

  return { providerId, setProviderId, setModel, cfg, meta, ready, resolveFor, availableIds, serverLoaded };
}

/* ================= HOME ================= */
function HomeView({ onConvene, meetings, onHistory, onOpen, providers }: any) {
  const [q, setQ] = useState("");
  const [mId, setMId] = useState("quick");
  const [pins, setPins] = useState<string[]>([]);
  const [research, setResearch] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [showProv, setShowProv] = useState(false);
  const [expQuery, setExpQuery] = useState("");
  const mode = MODES.find((m) => m.id === mId) || MODES[0];

  const pickMode = (id: string) => {
    setMId(id);
    const m = MODES.find((x) => x.id === id);
    setResearch(!!(m && m.research));
  };
  const togglePin = (id: string) => setPins((p) => p.includes(id) ? p.filter((x) => x !== id) : (p.length >= EXPERT_SEATS ? p : [...p, id]));
  const go = () => { if (q.trim() && providers.ready) onConvene(q.trim(), mId, pins, research); };

  return (
    <div className="fu">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 26 }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600, color: C.ink, lineHeight: 1 }}>Adep</div>
          <Cap style={{ marginTop: 5 }}>Decision council</Cap>
        </div>
        <Ghost onClick={onHistory} label="Open session history">History</Ghost>
      </div>

      <h1 style={{ fontFamily: SERIF, fontSize: 31, fontWeight: 600, color: C.ink, lineHeight: 1.22, margin: "0 0 10px" }}>
        Ask once.<br />The council convenes.
      </h1>
      <p style={{ fontFamily: SANS, fontSize: 14, color: C.dim, lineHeight: 1.65, margin: "0 0 20px", maxWidth: 560 }}>
        Independent minds think first, argue in the open, verify the facts, and vote — you get one verdict, with the dissent on record.
      </p>

      <div style={{ background: C.bg1, border: "1px solid " + C.line, borderRadius: 16, padding: 14 }}>
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") go(); }}
          placeholder="What decision are you weighing?"
          rows={3}
          aria-label="Your question for the council"
          style={{ width: "100%", background: "transparent", border: "none", resize: "vertical", minHeight: 74,
            color: C.ink, fontFamily: SANS, fontSize: 15.5, lineHeight: 1.5 }}
        />
        <div className="rowscroll" style={{ display: "flex", gap: 7, overflowX: "auto", margin: "4px 0 12px" }}>
          {SAMPLES.map((s, i) => (
            <button key={i} onClick={() => setQ(s)} style={{ flex: "none", fontFamily: SANS, fontSize: 11.5, color: C.faint,
              border: "1px solid " + C.line, borderRadius: 999, padding: "5px 11px", background: "transparent" }}>{s}</button>
          ))}
        </div>

        <Cap style={{ marginBottom: 8 }}>Mode</Cap>
        <div className="rowscroll" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
          {MODES.map((m) => (
            <button key={m.id} onClick={() => pickMode(m.id)} style={{ flex: "none", fontFamily: SANS, fontSize: 12, fontWeight: 600,
              color: m.id === mId ? C.brassHi : C.dim, border: "1px solid " + (m.id === mId ? C.brass : C.line),
              background: m.id === mId ? C.brassDim : "transparent", borderRadius: 999, padding: "7px 13px" }}>{m.n}</button>
          ))}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint, margin: "7px 2px 12px" }}>{mode.flavor}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <button onClick={() => setResearch((r) => !r)} aria-pressed={research}
            style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 34, height: 19, borderRadius: 99, background: research ? C.brass : C.bg3,
              border: "1px solid " + (research ? C.brass : C.line2), position: "relative", display: "inline-block", transition: "background .2s" }}>
              <span style={{ position: "absolute", top: 2, left: research ? 17 : 2, width: 13, height: 13, borderRadius: 99,
                background: research ? "#14100A" : C.dim, transition: "left .2s" }} />
            </span>
            <span style={{ fontFamily: SANS, fontSize: 12.5, color: research ? C.ink : C.dim }}>Live research — the fact checker searches the web</span>
          </button>
        </div>
        {research && providers.providerId !== "anthropic" ? (
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, margin: "2px 2px 10px" }}>
            Live search runs on the Claude provider; {providers.meta.label} verifies from training knowledge instead.
          </div>
        ) : <div style={{ marginBottom: 8 }} />}

        {/* Provider selector */}
        <button onClick={() => setShowProv((s) => !s)} style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.dim, marginBottom: showProv ? 10 : 12 }}>
          {(showProv ? "Hide model provider" : "Model provider") + " · " + providers.meta.label}
          {providers.serverLoaded && (
            <span style={{ marginLeft: 8, fontFamily: MONO, fontSize: 9, color: providers.ready ? C.good : C.warn }}>
              {providers.ready ? "✓ configured" : "not configured"}
            </span>
          )}
        </button>
        {showProv ? (
          <div style={{ marginBottom: 14 }}>
            <div className="rowscroll" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
              {PROVIDERS.map((p) => {
                const avail = providers.availableIds.includes(p.id);
                return (
                  <button key={p.id} onClick={() => providers.setProviderId(p.id)} style={{ flex: "none", fontFamily: SANS, fontSize: 12, fontWeight: 600,
                    color: p.id === providers.providerId ? C.brassHi : avail ? C.dim : C.faint,
                    border: "1px solid " + (p.id === providers.providerId ? C.brass : avail ? C.line : C.line),
                    background: p.id === providers.providerId ? C.brassDim : "transparent",
                    borderRadius: 999, padding: "7px 13px", opacity: avail ? 1 : 0.45 }}>
                    {p.label}
                    {providers.serverLoaded && <span style={{ marginLeft: 5, fontFamily: MONO, fontSize: 9, color: avail ? C.good : C.faint }}>{avail ? "✓" : "–"}</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, margin: "8px 2px" }}>{providers.meta.hint}</div>
            <input value={providers.cfg.model} onChange={(e: React.ChangeEvent<HTMLInputElement>) => providers.setModel(providers.providerId, e.target.value)}
              placeholder="Model id" aria-label="Model id"
              style={{ width: "100%", background: C.bg2, border: "1px solid " + C.line, borderRadius: 9, padding: "9px 11px",
                color: C.ink, fontFamily: MONO, fontSize: 12.5 }} />
            {!providers.ready && providers.serverLoaded ? (
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.warn, marginTop: 8 }}>
                {providers.meta.label} is not configured. Select a configured provider above.
              </div>
            ) : null}
            {providers.serverLoaded ? (
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, marginTop: 10 }}>
                Configured providers (Expert Router can assign per-expert): {providers.availableIds.length ? providers.availableIds.map((id: string) => PROV(id).label).join(", ") : "none"}.
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Expert pins */}
        <button onClick={() => setShowPins((s) => !s)} style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.dim, marginBottom: showPins ? 10 : 12 }}>
          {(showPins ? "Hide experts" : "Choose experts (optional)") + (pins.length ? " · " + pins.length + "/" + EXPERT_SEATS + " pinned" : "")}
        </button>
        {showPins ? (
          <div style={{ marginBottom: 14 }}>
            <input value={expQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpQuery(e.target.value)}
              placeholder={"Search " + PINNABLE.length + " experts by name, role, or domain"} aria-label="Search experts"
              style={{ width: "100%", background: C.bg2, border: "1px solid " + C.line, borderRadius: 9, padding: "9px 11px",
                color: C.ink, fontFamily: SANS, fontSize: 12.5, marginBottom: 9 }} />
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {(() => {
                const qx = expQuery.trim().toLowerCase();
                const pool = qx
                  ? PINNABLE.filter((e) => (e.id + " " + e.n + " " + e.r + " " + e.domain + " " + e.exp).toLowerCase().includes(qx))
                  : PINNABLE.slice(0, 18);
                const pinnedElsewhere = PINNABLE.filter((e) => pins.includes(e.id) && !pool.some((p) => p.id === e.id));
                return [...pinnedElsewhere, ...pool];
              })().map((e) => {
                const on = pins.includes(e.id);
                return (
                  <button key={e.id} onClick={() => togglePin(e.id)} style={{ display: "flex", alignItems: "center", gap: 6,
                    border: "1px solid " + (on ? C.brass : C.line), background: on ? C.brassDim : C.bg2,
                    borderRadius: 999, padding: "5px 10px 5px 5px" }}>
                    <Mono e={e} size={22} />
                    <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: on ? C.brassHi : C.dim }}>{e.n}</span>
                    <span style={{ fontFamily: SANS, fontSize: 10, color: C.faint }}>{e.r}</span>
                  </button>
                );
              })}
            </div>
            {!expQuery.trim() ? (
              <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.faint, marginTop: 7 }}>Showing a sample — search to browse all {PINNABLE.length}.</div>
            ) : null}
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, marginTop: 8 }}>
              Every seat — including the Chair, Ash, and Vera — is assigned by the router based on relevance, unless you pin one here.
            </div>
          </div>
        ) : null}

        <button onClick={go} disabled={!q.trim() || !providers.ready} aria-label="Convene the council"
          style={{ width: "100%", fontFamily: SANS, fontSize: 15, fontWeight: 700, color: "#14100A",
            background: (q.trim() && providers.ready) ? "linear-gradient(180deg, " + C.brassHi + ", " + C.brass + ")" : C.bg3,
            borderRadius: 12, padding: "13px 0", opacity: (q.trim() && providers.ready) ? 1 : 0.55 }}>
          {providers.serverLoaded ? "Convene the council" : "Connecting to providers…"}
        </button>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, textAlign: "center", marginTop: 8 }}>Ctrl/Cmd + Enter</div>
      </div>

      {meetings.length ? (
        <div style={{ marginTop: 26 }}>
          <Cap style={{ marginBottom: 10 }}>Recent sessions</Cap>
          {meetings.slice(0, 3).map((m: any) => (
            <button key={m.id} onClick={() => onOpen(m.id)} style={{ display: "flex", width: "100%", textAlign: "left", alignItems: "center", gap: 10,
              background: C.bg2, border: "1px solid " + C.line, borderRadius: 12, padding: "11px 13px", marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title || m.q}</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.q}</div>
              </div>
              {m.conf != null ? <ConfPill v={m.conf} /> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, textAlign: "center", marginTop: 30, lineHeight: 1.6 }}>
        All AI providers run server-side — your API keys are never exposed to the browser.
      </div>
    </div>
  );
}

/* ================= HISTORY ================= */
function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ flex: "1 1 130px", background: C.bg2, border: "1px solid " + C.line, borderRadius: 12, padding: "12px 13px" }}>
      <div style={{ fontFamily: MONO, fontSize: 19, color: C.brassHi }}>{value}</div>
      <Cap style={{ marginTop: 4 }}>{label}</Cap>
    </div>
  );
}

function HistoryView({ meetings, onBack, onOpen }: any) {
  const count = meetings.length;
  const avg = count ? Math.round(meetings.reduce((a: number, m: any) => a + (m.conf || 0), 0) / count) : 0;
  const unan = count ? Math.round((meetings.filter((m: any) => m.unanimous).length / count) * 100) : 0;
  const tally: Record<string, number> = {};
  meetings.forEach((m: any) => (m.seatIds || []).forEach((id: string) => {
    tally[id] = (tally[id] || 0) + 1;
  }));
  const topId = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  return (
    <div className="fu">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 600, color: C.ink }}>Council history</div>
        <Ghost onClick={onBack} label="Back to home">Home</Ghost>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatTile label="Sessions" value={count} />
        <StatTile label="Avg confidence" value={avg + "%"} />
        <StatTile label="Most seated" value={topId ? EX(topId).n : "—"} />
        <StatTile label="Unanimous" value={unan + "%"} />
      </div>
      {count === 0 ? (
        <Card style={{ textAlign: "center", padding: "26px 16px" }}>
          <div style={{ fontFamily: SERIF, fontSize: 16, color: C.ink }}>No sessions yet</div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.faint, marginTop: 6 }}>Convene your first council and the record starts here.</div>
        </Card>
      ) : meetings.map((m: any) => (
        <button key={m.id} onClick={() => onOpen(m.id)} style={{ display: "flex", width: "100%", textAlign: "left", alignItems: "center", gap: 10,
          background: C.bg2, border: "1px solid " + C.line, borderRadius: 12, padding: "12px 13px", marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title || m.q}</div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {(MODES.find((x) => x.id === m.modeId) || {}).n || ""}{" · "}{PROV(m.providerId || "anthropic").label}{" · "}{new Date(m.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" · "}{m.q}
            </div>
          </div>
          {m.conf != null ? <ConfPill v={m.conf} /> : null}
        </button>
      ))}
    </div>
  );
}

function MeetingView({ id, onBack }: { id: string; onBack: () => void }) {
  const [rec, setRec] = useState<any>(null);
  const [tab, setTab] = useState("report");
  useEffect(() => { setRec(store.get("adep:meeting:" + id)); }, [id]);
  return (
    <div className="fu">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Ghost onClick={onBack} label="Back to history">Back</Ghost>
        <div style={{ display: "flex", gap: 6 }}>
          {["report", "transcript"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700,
              color: tab === t ? C.brassHi : C.faint, border: "1px solid " + (tab === t ? C.brass : C.line),
              background: tab === t ? C.brassDim : "transparent", borderRadius: 999, padding: "6px 13px", textTransform: "capitalize" }}>{t}</button>
          ))}
        </div>
      </div>
      {!rec ? (
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.faint, textAlign: "center", padding: 30 }}>Loading the record…</div>
      ) : tab === "report" ? (
        <ReportView r={rec.report} options={rec.options} onFollow={null} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{rec.feed.map(renderItem)}</div>
      )}
    </div>
  );
}

/* ================= LIVE SESSION ================= */
function SessionView({ council, onHome, providerCfg }: any) {
  const { phase, stageIdx, qText, modeId, seats, feed, links, active, busy, options, report, errMsg, followUp, retry } = council;
  const [tab, setTab] = useState("verdict");
  const [fq, setFq] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === "running" && endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [feed.length, phase]);
  useEffect(() => { if (phase === "report") setTab("verdict"); }, [phase]);
  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  const stageName = phase === "report" ? "Verdict" : (STAGES[stageIdx] ? STAGES[stageIdx].n : "Convening");
  const sendFollow = (text?: string) => { const v = (text != null ? text : fq).trim(); if (!v) return; setFq(""); setTab("transcript"); followUp(v, providerCfg); };

  return (
    <div className="fu">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={onHome} aria-label="Leave session" style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: C.ink }}>Adep</button>
        <Cap>{mode.n}</Cap>
      </div>
      <StageRail idx={phase === "report" ? 9 : stageIdx} />

      <Card style={{ background: C.bg1, margin: "8px 0 12px" }} className="">
        <Cap>Question before the council</Cap>
        <div style={{ fontFamily: SERIF, fontSize: 15.5, color: C.ink, lineHeight: 1.5, marginTop: 5 }}>{qText}</div>
      </Card>

      <div style={{ background: C.bg1, border: "1px solid " + C.line, borderRadius: 16, padding: "8px 4px", marginBottom: 14 }}>
        <SeatRing seats={seats} active={active} links={links} title={stageName} sub={phase === "running" ? busy : ""} />
      </div>

      {phase === "error" ? (
        <Card accent={C.bad}>
          <Cap style={{ color: C.bad }}>The session hit an error</Cap>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.dim, lineHeight: 1.55, margin: "6px 0 12px" }}>{errMsg}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Ghost onClick={retry} style={{ color: C.brassHi, borderColor: C.brass }} label="Retry the session">Reconvene</Ghost>
            <Ghost onClick={onHome} label="Back to home">Home</Ghost>
          </div>
        </Card>
      ) : null}

      {phase === "report" ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {["verdict", "transcript"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700,
              color: tab === t ? C.brassHi : C.faint, border: "1px solid " + (tab === t ? C.brass : C.line),
              background: tab === t ? C.brassDim : "transparent", borderRadius: 999, padding: "6px 13px", textTransform: "capitalize" }}>{t}</button>
          ))}
          <div style={{ flex: 1 }} />
          <Ghost onClick={onHome} label="Start a new question">New question</Ghost>
        </div>
      ) : null}

      {phase === "report" && tab === "verdict" ? (
        <ReportView r={report} options={options} onFollow={sendFollow} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {feed.map(renderItem)}
          <div ref={endRef} />
        </div>
      )}

      {phase === "report" ? (
        <div style={{ position: "sticky", bottom: 10, marginTop: 20, background: C.bg1, border: "1px solid " + C.line2,
          borderRadius: 14, padding: 10, display: "flex", gap: 8, alignItems: "flex-end", boxShadow: "0 8px 30px rgba(0,0,0,0.45)" }}>
          <textarea value={fq} onChange={(e) => setFq(e.target.value)} rows={1}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendFollow(); }}
            placeholder="Challenge the council, or ask a follow-up…" aria-label="Follow-up for the council"
            style={{ flex: 1, background: "transparent", border: "none", resize: "none", color: C.ink, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.4, maxHeight: 90 }} />
          <button onClick={() => sendFollow()} disabled={!fq.trim()} aria-label="Reconvene the council"
            style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: "#14100A", background: fq.trim() ? C.brass : C.bg3,
              borderRadius: 9, padding: "9px 14px", flex: "none", opacity: fq.trim() ? 1 : 0.55 }}>Reconvene</button>
        </div>
      ) : null}
    </div>
  );
}

/* ================= APP ================= */
export default function Adep() {
  const [view, setView] = useState("home");
  const [openId, setOpenId] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<any[]>([]);
  const council = useCouncil();
  const providers = useProviderConfig();

  useEffect(() => {
    const i = store.get("adep:index");
    setMeetings(((i && i.meetings) || []).slice().reverse());
  }, [view, council.phase]);

  const start = (q: string, mId: string, pins: string[], research: boolean) => {
    setView("session");
    council.convene(q, mId, pins, research, providers.cfg, providers.resolveFor);
  };
  const goHome = () => { council.reset(); setView("home"); };

  return (
    <div style={{ minHeight: "100vh", color: C.ink, fontFamily: SANS,
      background: "radial-gradient(1100px 520px at 50% -8%, rgba(201,163,92,0.07), transparent 60%), " + C.bg0 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "20px 16px 70px" }}>
        {view === "home" ? (
          <HomeView onConvene={start} meetings={meetings} onHistory={() => setView("history")} onOpen={(id: string) => { setOpenId(id); setView("meeting"); }} providers={providers} />
        ) : null}
        {view === "session" ? <SessionView council={council} onHome={goHome} providerCfg={providers.cfg} /> : null}
        {view === "history" ? <HistoryView meetings={meetings} onBack={() => setView("home")} onOpen={(id: string) => { setOpenId(id); setView("meeting"); }} /> : null}
        {view === "meeting" && openId ? <MeetingView id={openId} onBack={() => setView("history")} /> : null}
      </div>
    </div>
  );
}
