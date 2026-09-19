# Keppel Track — Tencent Cloud "AI CAN DO IT" Hackathon Singapore 2026: Research Report & Playbook

## TL;DR

- **What Keppel is asking for:** A system that captures scattered expert knowledge across a diverse real-estate portfolio and turns it into _reusable, governed intelligence that supports decisions and operations across different assets_ — i.e., a cross-asset knowledge system, exactly the direction the user chose. This is the officially confirmed one-line brief; the fuller description sits only in the gated hackathon handbook.
- **The gap you can win on:** Most existing tools (JLL GPT, CBRE Ellis/Capital AI, CapitaLand's GenAI KM, Prophia, Cherre) are either single-function (lease abstraction) or single-firm silos. Almost none deliver _cross-asset transfer_ — letting a lesson learned at a data centre inform an office retrofit — with citations and access control. A student team can credibly prototype that thin, high-value slice.
- **How to build it fast:** Use a RAG + lightweight knowledge-graph architecture on Tencent Cloud (Hunyuan models via TokenHub, ADP/TCADP or the open-source WeKnora for retrieval, plus the required CodeBuddy/WorkBuddy tooling), grounded in a small synthetic multi-asset corpus with source citations, role-based access, and an audit trail — matching the seven published judging criteria.

## Key Findings

**1. The track is real and confirmed, but the detailed brief is gated.** The Keppel track is one of five industry challenges in the _AI CAN DO IT Tencent Cloud Hackathon Singapore 2026_, run by Tencent Cloud and AI Singapore (16 September–3 November 2026). The only public, official statement of the Keppel problem is a single sentence: "Explore how expert knowledge can be captured and converted into reusable, governed intelligence that supports decisions and operations across different assets." The multi-paragraph description, deliverables, datasets and any weightings are in the "official hackathon handbook," which is only accessible through the registration flow — the user should read it in full after registering.

**2. Timeline and mechanics (confirmed):** Submissions close 16 October 2026; shortlisted teams announced 23 October; Demo Day and Award Ceremony on 3 November 2026 (as part of Tencent Cloud Day Singapore). Prize pool is S$17,000 (S$10,000 / S$5,000 / S$2,000). Each registered participant gets 1,000 Tencent Cloud credits. Outstanding participants may get Tencent internship fast-tracks, and selected projects may be considered for proof-of-concept, investment or incubation — discretionary, not guaranteed.

**3. Judging criteria (confirmed, no public weightings):** relevance, human-centric design, use of AI, technical execution, feasibility, responsible AI practices, and potential business impact.

**4. Required/encouraged tooling (confirmed):** Tencent CodeBuddy (AI coding assistant), Tencent WorkBuddy (agentic office workspace), and Tencent Design Miora (creative studio). The broader Tencent AI stack — Hunyuan models, the Tencent Cloud Agent Development Platform (ADP/TCADP), and Tencent's open-source WeKnora RAG platform — is highly relevant even though only the three tools above are formally named for this event.

**5. "Cross-asset" for Keppel is unusually broad.** Keppel Ltd. is a global asset manager and operator across infrastructure, real estate and connectivity, targeting S$200 billion AUM by 2030, with an interim S$100 billion target by end-2026, per Keppel's Vision 2030 restructuring. Its listed real-estate vehicles alone span offices (Keppel REIT), data centres (Keppel DC REIT), and US offices (Keppel Pacific Oak US REIT), plus private funds, senior living, and sustainable urban renewal. This heterogeneity is the crux: knowledge that lives in one team/asset class rarely reaches another.

**6. Keppel already runs sophisticated AI internally** — Alpha and Duet (deal evaluation/research), KAI (proprietary AI operating system), Athena (data-centre failure prediction), and Agent9D (project execution). A hackathon project should _complement_ rather than duplicate these, focusing on the cross-asset knowledge-capture layer that is still an open problem.

## Details

### 1. The Keppel problem statement and contest logistics

The contest page (tch.tencentcloud.com/contest/44) is a dynamically-loaded site that shows the sponsor (Tencent Cloud Singapore), "Registration Open," a S$17,000 prize pool and ~400 registrations, but does not render the challenge briefs publicly. The authoritative public source is Tencent Cloud's press release (PR Newswire APAC, 17 September 2026), which lists all five tracks:

- **Banking (DBS):** secure conversational transaction agent — natural-language interpretation with deterministic execution and explicit user authorisation.
- **Real estate (Keppel):** capture expert knowledge and convert it into reusable, governed intelligence supporting decisions and operations across different assets.
- **Healthcare (LKCMedicine):** patient-facing tools for safer self-triage, care navigation, long-term self-care.
- **FinTech (Aspire):** context-aware enterprise knowledge system with RBAC, security logging and audit trail.
- **Digital native (Ryde):** multi-agent dispute resolution for ride-hailing.

Notably, the Aspire track explicitly demands RBAC + audit trails and the DBS track demands deterministic execution + authorisation. Although those governance requirements are formally attached to other tracks, the Keppel brief's word "governed" strongly signals that access control, provenance and auditability will score well under "responsible AI practices."

The seven judging criteria and the three named tools are confirmed above. No public dataset is provided; teams should assume they must build or synthesize their own corpus.

### 2. Keppel background and what "cross-asset" means

Keppel Ltd. (SGX: BN4) is a Singapore-headquartered global asset manager and operator across three segments — infrastructure, real estate and connectivity — operating in more than 20 countries, transforming under "Vision 2030" from a conglomerate into an asset-light global alternative real-asset manager targeting S$200 billion AUM by 2030 (interim S$100 billion by end-2026). Its real-estate-related platforms include:

- **Keppel REIT** — a commercial/office REIT (~S$11.8 billion portfolio as of 30 June 2026) with Grade-A offices in Singapore (Ocean Financial Centre, Marina Bay Financial Centre, One Raffles Quay, Keppel Bay Tower), Australia, South Korea and Japan.
- **Keppel DC REIT** — Asia's first pure-play data-centre REIT; 25 data centres across ~10 countries, ~S$4.5 billion AUM, occupancy above 97%, WALE ~6.5 years (1H2026).
- **Keppel Pacific Oak US REIT (KORE)** — 13 US freehold office assets, ~US$1.3 billion.
- Plus private real-estate funds (~S$62 billion real-estate FUM), senior living, student accommodation, and Sustainable Urban Renewal.

"Cross-asset" therefore spans office towers, hyperscale/colocation data centres, residential/senior living, retail, and mixed-use precincts — each with different lease structures, O&M regimes, sustainability metrics, tenant profiles and regulatory contexts. The knowledge-transfer problem is acute precisely because these asset classes are managed by different teams, funds and geographies, yet share reusable expertise (energy retrofits, green certifications, tenant engagement, predictive maintenance).

### 3. Keppel's existing digital/AI initiatives (avoid duplicating these)

- **Alpha & Duet:** two GenAI apps launched ~18 months before Nov 2025; analysed 50,000+ companies and answered 17,000+ questions; Alpha speeds deal evaluation up to 4x, ingests PDFs/spreadsheets/decks, and layers proprietary operating data.
- **KAI:** proprietary AI operating system integrating ChatGPT, Claude and Gemini; supports building expert AI agents on proprietary data; in beta, wide rollout targeted end-2025.
- **Athena:** a data-centre "black swan detector" using signal processing/AI (vibration, sound, harmonics) to predict rare failures like cooling breakdowns; deployed in a facility with rollouts underway.
- **Agent9D:** project-execution agent targeting up to 30% improvement in on-time delivery and 50% fewer site changes; under development.
- **Infrastructure Intelligence (II) / Operations Nerve Centre (ONC):** AI/ML platform for data-centre monitoring; a Keppel–Midea partnership on AI-enabled modular cooling.
- **Cloud partnerships:** AWS is Keppel's preferred cloud provider (AI platform on Amazon Bedrock); a Dell framework for industry-specific AI platforms; a Group data lake initiative. Note this AWS-first posture — a Tencent-stack demo is a hackathon exercise, not a procurement match, so emphasise portability.
- **Smart-building history:** Keppel Bay Tower became Singapore's first Green Mark Platinum (Zero Energy) commercial building. Envision Digital's cloud-based Smart Building AIoT platform "helped Keppel Land eliminate 17 data silos, connect 170 devices, 30 systems, 65 sub-systems, and collect data from >20,000 sources, including people," saving enough energy to power more than 400 Singaporean homes for a year. Separately, an IES performance digital twin — calibrated to be over 99% accurate — identified energy conservation measures of which eight were implemented over three months, delivering a measured 7% EEI (kWh/m² per annum) saving, part of a BCA/Keppel Land project (a S$1.28 million BCA grant) that cut overall building energy use 22.3–30%. This is a perfect illustration of _reusable_ knowledge: the KBT retrofit playbook is directly relevant to other offices in the portfolio.

The clear white space: Keppel's tools focus on deal evaluation, project delivery and asset-level operations. A firm-wide, cross-asset _knowledge capture and transfer_ layer — turning tacit expert know-how and scattered documents into governed, queryable, reusable intelligence — is the exact gap the track names.

### 4. Current industry implementations (the competitive landscape)

**Large real-estate firms:**

- **JLL — JLL GPT:** an in-house LLM for CRE; JLL analyses vast internal/external data points. Per Truvisory (citing JLL's 2025 Global Real Estate Technology Survey), JLL's lease-abstraction deployment "cut manual review labor by 60% and, in the process, surfaced more than $1 million in escalation clauses the firm had been missing" — a first-year deployment that let the same team handle roughly 3x volume without added headcount. Lesson: the value is not just speed but catching money the old process loses.
- **CBRE — Ellis AI & Capital AI:** ML/GenAI for investment modelling, predictive maintenance on IoT data, and digital assistants; reported ~25% reduction in manual lease-processing time; unified property-management search built on AWS Bedrock; AI deployed across a very large managed floor area.
- **CapitaLand:** GenAI for two use cases — internal employee knowledge management and external customer chatbots (e.g., Ascott's "Cubby"); a tiered training model (awareness → role-specific → power users).
- **Brookfield/Mapletree and peers:** broadly pursuing lease intelligence and portfolio analytics, but public cross-asset KM case studies are thin.

**Proptech point solutions:**

- **Prophia:** AI lease abstraction with portfolio-wide standardization and hyperlinks back to source documents (traceability).
- **Cherre:** a real-estate _knowledge graph_ connecting properties, addresses, people and companies, with entity resolution and an Agent.STUDIO for custom agents on unified data — the closest commercial analogue to a cross-asset knowledge graph.
- **V7 Go, AppFolio Realm-X, OrthoGraph** (operational BIM + conversational CMMS), and others in document intelligence, workflow automation and digital-twin O&M.

**Standards & techniques worth citing to impress technical judges:**

- Ontologies/standards: **RealEstateCore** (smart-building/digital-twin RDF ontology, used by ProptechOS), **Brick Schema** (building systems), **IFC** (BIM), **RESO** (transactional MLS data). Using or referencing one signals rigor.
- **Digital twins + LLM agents:** research on ontology-enabled, AI-agent-driven intelligent digital twins for building O&M (ScienceDirect, 2025) and BIM→digital-twin O&M pipelines (Autodesk Tandem, Bentley iTwin, Azure Digital Twins).
- **Knowledge-graph + RAG hybrids:** provenance/versioning as first-class citizens, hybrid ML+rules extraction — directly applicable to "governed intelligence."

**The overall pattern (and the trap):** JLL's 2025 Global Real Estate Technology Survey (1,500+ decision-makers across 16 markets, published 28 October 2025) found that 88% of investors, owners and landlords have started piloting AI — most pursuing an average of five use cases simultaneously — and 92% of occupiers are also running corporate real-estate AI pilots, yet only 5% reported achieving all their program goals. This echoes MIT's NANDA "The GenAI Divide: State of AI in Business 2025," which found 95% of enterprise GenAI pilots deliver no measurable P&L impact — with data readiness the most common culprit. The winning approach is _staged and narrow_: start with portfolio intelligence over your own documents, with citations for every answer. This is directly transferable advice for a hackathon scope.

### 5. Relevant Tencent Cloud tooling and how it fits

- **CodeBuddy (required):** conversational full-stack coding assistant — use it to scaffold the app, ingestion pipeline and UI quickly.
- **WorkBuddy (required):** agentic office workspace that decomposes multi-step tasks, runs specialised "Expert" agents in parallel, reads/writes local files, and offers enterprise safeguards (sandboxing, workspace isolation, file-access permissions, audit/export, "team data never used for training," VPC option). This maps neatly to a "governed" cross-asset assistant and to producing deliverables (reports/decks) at Demo Day.
- **Miora (required):** creative studio with persistent memory — useful for a polished pitch deck / consistent visual identity.
- **Hunyuan models via TokenHub:** Tencent's LLM family (MoE architectures, long context, strong agentic/coding) plus third-party models — the reasoning/generation engine.
- **Tencent Cloud ADP / TCADP (highly relevant, not formally named):** enterprise AgentOps platform with LLM+RAG, Workflow and Multi-agent engines, plus governance (content moderation, RBAC, operation audit, runtime observability) and OCR/multimodal document parsing — arguably the single best fit for a "governed knowledge system," and directly demonstrates the responsible-AI criterion.
- **WeKnora (Tencent open-source):** an open LLM knowledge platform that turns raw documents into a queryable RAG + reasoning agent + self-maintaining wiki; supports 10+ document formats, multiple vector DBs (pgvector, Milvus, Weaviate, Qdrant, Tencent VectorDB), Hunyuan and other models, scoped API keys/RBAC, Langfuse observability, and scales to tens of thousands of documents. Excellent, free backbone for a hackathon prototype and a strong story on data sovereignty.
- **Tencent Cloud VectorDB:** managed vector store for embeddings.

Suggested stack: WeKnora or ADP for retrieval/agents + Hunyuan (via TokenHub) for generation + Tencent VectorDB for embeddings + a light knowledge-graph layer (e.g., Neo4j or RDF using RealEstateCore concepts) for cross-asset links + CodeBuddy to build + WorkBuddy/Miora for deliverables.

### 6. Prior art from Tencent and proptech hackathons

- The **2025 Tencent Cloud Hackathon** (Shenzhen, 48h, "AI for Social Good") saw 17 teams build with CodeBuddy, TCADP and EdgeOne; winners were mostly games/social-impact projects (e.g., "Poke Planet"). The 2026 "AI CAN DO IT" game/creative editions (Hong Kong/Macau, Southeast Asia) similarly favored games, animation and AI agents. Takeaway: the Singapore _industry_ edition is a departure — it rewards enterprise-grade, deployable solutions, so polish on governance and business impact matters more than flashy demos.
- No prior _Keppel-sponsored_ AI hackathon challenge was found publicly; this appears to be Keppel's first such track, so there is no direct precedent to benchmark against — an advantage for original ideas.

### 6b. Concrete, differentiated project ideas (hackathon-scale)

Ranked by fit to the brief and feasibility:

1. **Cross-Asset "Lessons Learned" Transfer Engine (recommended flagship).** A RAG + knowledge-graph assistant that ingests documents from _multiple asset types_ (office, data centre, residential) and, when a user describes a situation on one asset, surfaces relevant precedents from _other_ asset classes — e.g., "chiller optimisation at a data centre" → "applicable retrofit steps proven at Keppel Bay Tower office." Differentiator: explicit cross-asset edges in a knowledge graph, every answer cited to source, and a "why this is relevant to your asset" rationale. Directly nails "reusable... across different assets."

2. **Governed Expert-Knowledge Capture (tacit → explicit).** An interview-style agent that debriefs experts (e.g., an asset manager leaving a project), structures their tacit knowledge into a governed knowledge base with provenance, confidence and access levels, and makes it queryable. Nails "expert knowledge can be captured" + governance.

3. **Portfolio Q&A with RBAC + audit trail.** A conversational layer over leases, O&M manuals, ESG reports and maintenance logs, with role-based access (a REIT analyst sees different data than an FM technician), full citations and an audit log of who asked what. Lower novelty but strongest on the "governed/responsible AI" criteria.

4. **ESG/green-certification knowledge co-pilot.** Turns Keppel's sustainability playbooks (Green Mark, net-zero retrofits) into reusable, cross-asset guidance with benchmark data — leveraging the genuinely reusable KBT precedent.

5. **Due-diligence knowledge accelerator.** For acquisitions, auto-assembles relevant institutional knowledge and prior comparable-asset learnings — but note overlap with Keppel's Alpha; position as the cross-asset knowledge layer feeding such tools.

**What impresses judges:** (a) a real, if synthetic, multi-asset corpus (mix office + data-centre + residential docs) so "cross-asset" is demonstrated, not claimed; (b) citations/provenance on every answer; (c) visible RBAC + audit trail; (d) an evaluation slide (retrieval accuracy, hallucination checks) addressing the ~5%-succeed / 95%-no-P&L-impact reality; (e) a crisp business-impact estimate grounded in comparable public numbers (e.g., JLL's 60% review-time cut / $1M clauses found; CBRE's 25%).

**Pitfalls to avoid:** building a generic single-document chatbot (no cross-asset story); ignoring governance; over-scoping a full digital twin; using only real Keppel-branded data you don't have (use synthetic/public docs); and duplicating Alpha/KAI/Athena rather than complementing them.

## Recommendations

1. **Register and read the handbook first.** The full Keppel brief, any provided datasets, deliverable format and possible weightings are only in the gated handbook (via qdrl.qq.com/65xN1yft). Confirm before locking scope; everything below assumes the public one-liner.
2. **Pick Idea #1 (Cross-Asset Lessons-Learned Transfer Engine) as the flagship**, with RBAC + citations from Idea #3 baked in. It is the most literal reading of "reusable, governed intelligence across different assets" and has the clearest differentiation from JLL GPT / Prophia / Cherre.
3. **Build the minimum credible cross-asset corpus early** (Week 1): assemble ~30–60 public/synthetic documents spanning at least three asset classes (office lease + O&M + ESG report; data-centre spec + maintenance log; residential/senior-living ops). Cross-asset retrieval is your differentiator — protect time for it.
4. **Use WeKnora or ADP/TCADP for the RAG/agent core** (governance + observability out of the box), Hunyuan via TokenHub for generation, Tencent VectorDB for embeddings, and a small knowledge graph (RealEstateCore-inspired schema) for the cross-asset links. Use CodeBuddy to accelerate, WorkBuddy/Miora for the deliverable and pitch.
5. **Instrument for the judging rubric:** add a citations panel (technical execution + responsible AI), an RBAC toggle and audit log (governance), a one-slide evaluation of retrieval quality/hallucination rate (feasibility), and a business-impact estimate benchmarked to JLL/CBRE public figures (business impact). Keep a human-in-the-loop confirmation step for anything actionable (human-centric design).
6. **Tell a portability story.** Since Keppel is AWS/Bedrock-first internally, frame the Tencent stack as a portable reference architecture (open WeKnora, standard vector DBs, RealEstateCore ontology) so the concept survives outside the hackathon environment.

**Benchmarks that would change the plan:** If the handbook provides a real Keppel dataset, pivot to it immediately (authenticity dominates). If it specifies a narrower sub-problem (e.g., only leases, or only ESG), narrow scope to match and drop the multi-asset corpus ambition. If weightings emphasise business impact heavily, invest more in the ROI slide and a named beachhead use case; if they emphasise responsible AI, double down on RBAC/audit/provenance.

## Caveats

- **The detailed Keppel brief is not public.** All specifics here derive from the confirmed one-line statement plus the official press release; deliverables, datasets and weightings must be verified in the handbook after registration.
- **The contest page did not render challenge details** when fetched (JavaScript-loaded), so contest specifics come from Tencent Cloud's press release and reputable secondary coverage (TechNode, PR Newswire), not the live brief.
- **Keppel's internal-AI figures** (Alpha/Duet usage, Athena, Agent9D targets) are from Keppel's own November 2025 feature article and are corporate self-reported; treat targeted results (e.g., "up to 30%") as goals, not audited outcomes.
- **Competitor ROI figures** (JLL 60%/$1M, CBRE 25%) are company/secondary-source claims useful for benchmarking, not independently audited.
- **Tencent ADP/TCADP is not formally listed** among this hackathon's named tools (CodeBuddy, WorkBuddy, Miora); confirm eligibility/credits before relying on it, though it and WeKnora are publicly available.
