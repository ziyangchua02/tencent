"""Synthetic, Keppel-like multi-asset knowledge corpus (content only; see generate_dataset.py).

ALL CONTENT IS SYNTHETIC AND ILLUSTRATIVE. Apart from Keppel Bay Tower (used as a
recognisable anchor, with a few publicly reported smart-building facts), asset
names are fictional and every figure is invented for the hackathon demo.

The corpus is designed so that cross-asset transfer is *demonstrable*:
  * DC-01 (data-centre cooling) states the DC team has no precedent for chiller-plant
    optimisation - OFF-01 / OFF-05 (office retrofit) supply exactly that.
  * SL-02 (senior-living lift breakdowns) asks whether failures can be predicted -
    OFF-04 (office lift monitoring) and DC-03 (DC vibration analytics) answer it.
  * OFF-03, SL-03 and DC-01 each learned the same comfort / communication lesson independently.
Page structure: each document is a list of pages; each page is a list of blocks
  ("h", heading) | ("p", paragraph) | ("ul", [bullets]) | ("table", [header, *rows]).
"""

DOCUMENTS = [
    # ------------------------------------------------------------------ OFFICE
    {
        "id": "OFF-01",
        "filename": "KBT_Chiller_Plant_HVAC_Retrofit_Report.pdf",
        "title": "Chiller Plant Optimisation & HVAC Retrofit - Technical Report",
        "asset_type": "Office", "asset_name": "Keppel Bay Tower", "location": "Singapore",
        "category": "Energy Efficiency", "classification": "Technical",
        "author": "Office Portfolio M&E Engineering", "doc_date": "2025-03",
        "problem": "High cooling energy consumption from an ageing, manually sequenced chiller plant",
        "solution": "AI-driven chiller plant optimisation with smart HVAC monitoring, variable speed drives "
                    "and chilled-water temperature reset",
        "impact": "Chiller plant efficiency improved from 0.86 to 0.59 kW/RT; building energy use down 18%",
        "pages": [
            [
                ("h", "1. Executive summary"),
                ("p", "Cooling is the largest energy end-use at Keppel Bay Tower, accounting for 54% of building "
                      "electricity in the 2023 baseline year. The water-cooled chilled-water plant (three 650 RT "
                      "centrifugal chillers, one 300 RT duty chiller and four cooling towers) was sequenced manually "
                      "by operators using fixed time schedules, and ran at an annual average plant efficiency of "
                      "0.86 kW/RT."),
                ("p", "Between March and October 2024 the plant was retrofitted with an AI-driven optimisation layer, "
                      "variable speed drives and smart HVAC monitoring. Over the first twelve months of operation the "
                      "measured plant efficiency improved to 0.59 kW/RT, cooling energy fell 31% and whole-building "
                      "energy use fell 18%, with no increase in tenant thermal-comfort complaints."),
                ("h", "2. Baseline conditions"),
                ("ul", [
                    "Chiller staging was decided by operators from fixed schedules; chillers often ran at 30-40% "
                    "part load, where their efficiency is poorest.",
                    "Chilled-water supply temperature was fixed at 6.5°C all year, regardless of cooling load.",
                    "Condenser water pumps and cooling tower fans ran at constant speed.",
                    "Plant efficiency was only spot-checked monthly; there was no permanent measurement and "
                    "verification (M&V) instrumentation.",
                ]),
                ("table", [
                    ["Baseline KPI (2023)", "Value"],
                    ["Annual building electricity", "9.8 GWh"],
                    ["Share of electricity used for cooling", "54%"],
                    ["Chiller plant efficiency (annual average)", "0.86 kW/RT"],
                    ["Peak cooling load", "1,450 RT"],
                ]),
            ],
            [
                ("h", "3. Measures implemented"),
                ("p", "The programme combined five measures, delivered in phases so that each could be verified "
                      "before the next was enabled."),
                ("ul", [
                    "AI-driven chiller plant optimisation: a machine-learning model forecasts the cooling load 24 "
                    "hours ahead from weather forecasts and turnstile occupancy data. Every 15 minutes the optimiser "
                    "selects the chiller combination and the chilled-water and condenser-water setpoints that "
                    "minimise total plant kW while meeting the load.",
                    "Chilled-water supply temperature reset: the setpoint now floats between 6.5°C and 8.5°C using "
                    "trim-and-respond logic driven by AHU valve positions, raising chiller efficiency at part load.",
                    "Variable speed drives on condenser water pumps and cooling tower fans, with the condenser-water "
                    "temperature optimised against outdoor wet-bulb conditions.",
                    "AHU fan static-pressure reset and CO2-based demand-controlled ventilation.",
                    "Smart HVAC monitoring: fault detection and diagnostics rules run on building management system "
                    "(BMS) trend data and flag stuck valves, simultaneous heating and cooling, sensor drift and "
                    "short-cycling chillers.",
                ]),
                ("h", "4. Instrumentation and M&V"),
                ("p", "Permanent high-accuracy instrumentation was installed before any control change: "
                      "electromagnetic flow meters, temperature sensors accurate to ±0.05°C and power meters on every "
                      "chiller, pump and cooling tower fan. The same instrumentation calculates plant efficiency in "
                      "real time and supplies the data for measurement and verification of savings."),
                ("h", "5. Commissioning approach"),
                ("p", "The optimiser first ran for four weeks in shadow mode: it recommended staging and setpoints, "
                      "and operators approved or rejected each recommendation. Closed-loop control was enabled only "
                      "after more than 95% of recommendations were being accepted. Operators can override the "
                      "optimiser from the BMS at any time."),
            ],
            [
                ("h", "6. Results (first 12 months)"),
                ("table", [
                    ["KPI", "Baseline", "After retrofit"],
                    ["Chiller plant efficiency (kW/RT)", "0.86", "0.59"],
                    ["Cooling energy (GWh/yr)", "5.3", "3.7"],
                    ["Building electricity (GWh/yr)", "9.8", "8.0"],
                    ["Hot complaints per month", "14", "13"],
                    ["Carbon avoided (tCO2e/yr)", "-", "725"],
                ]),
                ("h", "7. Lessons learned"),
                ("ul", [
                    "Sensor accuracy is the foundation. Two of fourteen chilled-water temperature sensors had "
                    "drifted by more than 0.3°C and caused poor staging decisions in the first month; quarterly "
                    "sensor calibration is now mandatory.",
                    "Shadow mode built operator trust. Operators who had run the plant for years accepted closed-loop "
                    "control because they had seen, and could veto, every recommendation.",
                    "Coordinate temperature reset with humidity. During the wet north-east monsoon the lobby AHUs "
                    "needed a lower chilled-water temperature for dehumidification, so the reset logic now includes "
                    "a space dew-point limit.",
                    "Phase the changes. Enabling one measure at a time made savings attributable and rollback simple.",
                ]),
                ("h", "8. Applicability"),
                ("p", "The approach applies to any water-cooled chilled-water plant. Facilities with steady, "
                      "round-the-clock cooling loads can expect a larger absolute saving from supply-temperature reset "
                      "and optimised staging, provided equipment and contractual temperature limits are respected."),
            ],
        ],
    },
    {
        "id": "OFF-02",
        "filename": "KBT_Smart_Building_Digital_Twin_Report.pdf",
        "title": "Smart Building Analytics & Energy Digital Twin - FY2025 Report",
        "asset_type": "Office", "asset_name": "Keppel Bay Tower", "location": "Singapore",
        "category": "Smart Building Analytics", "classification": "Technical",
        "author": "Smart Buildings Team", "doc_date": "2025-08",
        "problem": "Building data fragmented across 17 data silos, preventing portfolio-level energy insight",
        "solution": "Integrated IoT smart-building platform with standard point naming and a calibrated energy "
                    "digital twin to test energy conservation measures",
        "impact": "Eight energy conservation measures implemented in three months, cutting energy use intensity by 7%",
        "pages": [
            [
                ("h", "1. Background"),
                ("p", "Before 2023, operational data at Keppel Bay Tower was spread across 17 separate data silos: "
                      "the BMS, lighting controls, lift monitoring, power meters, the car park system and several "
                      "vendor portals. Each system used its own naming conventions, so combining data for analysis "
                      "took days of manual work and nobody had a complete, real-time view of how the building used "
                      "energy."),
                ("h", "2. Integrated smart-building platform"),
                ("p", "A cloud IoT platform was deployed to connect 170 devices, 30 systems and 65 sub-systems, "
                      "collecting data from more than 20,000 sources. The key design decision was a standard "
                      "point-naming and tagging scheme, inspired by the Brick Schema, applied to every sensor and "
                      "meter. With standard naming, an analytic written once - for example 'detect a chiller running "
                      "with no load' - can be reused on any building that follows the same scheme."),
                ("ul", [
                    "Real-time dashboards for energy use intensity, plant efficiency and indoor environment.",
                    "Automated fault detection, with work orders created in the maintenance system (CMMS).",
                    "Tenant-level metering of after-hours air-conditioning use.",
                ]),
                ("p", "Note: the numbers of data silos, devices and data sources follow publicly reported "
                      "descriptions of the Keppel Bay Tower smart-building programme; all other figures in this "
                      "corpus are synthetic."),
            ],
            [
                ("h", "3. Energy digital twin"),
                ("p", "A physics-based energy model of the building was calibrated against twelve months of metered "
                      "data until its predictions matched measurements within ASHRAE Guideline 14 tolerances, with a "
                      "monthly error below 1%. The digital twin was then used to test energy conservation measures "
                      "(ECMs) virtually, before any change was made to the real building."),
                ("table", [
                    ["Energy conservation measure", "Predicted saving", "Status"],
                    ["AHU schedules aligned to actual occupancy", "1.6%", "Implemented"],
                    ["Perimeter-zone daylight dimming", "1.1%", "Implemented"],
                    ["Chilled-water reset tuning", "1.2%", "Implemented"],
                    ["Car park ventilation controlled by CO sensors", "0.9%", "Implemented"],
                    ["Tenant after-hours AC tracking and billing", "0.7%", "Implemented"],
                    ["Condenser pump setpoint tuning", "0.6%", "Implemented"],
                    ["Toilet exhaust fan scheduling", "0.5%", "Implemented"],
                    ["Lift standby mode in off-peak hours", "0.4%", "Implemented"],
                ]),
                ("p", "All eight ECMs were implemented within three months. Measured energy use intensity fell by "
                      "7%, in line with the digital-twin prediction."),
            ],
            [
                ("h", "4. Lessons learned"),
                ("ul", [
                    "Data governance comes first. Agreeing a single naming standard took longer than installing the "
                    "platform, but it is what makes analytics reusable across buildings.",
                    "Test before touching. The digital twin rejected two proposed measures that would have caused "
                    "comfort problems in west-facing zones.",
                    "Recalibrate after major changes. The twin drifted after the chiller plant retrofit and had to be "
                    "recalibrated with the new plant performance curves.",
                    "Close the loop to maintenance. Analytics only saved energy once alerts were routed automatically "
                    "into CMMS work orders with an owner and a deadline.",
                ]),
                ("h", "5. Scaling across the portfolio"),
                ("p", "The naming standard, dashboards and fault-detection rules are asset-agnostic. The same data "
                      "model can sit on top of a data centre DCIM or the BMS of a residential development, so that "
                      "energy analytics, anomaly detection and benchmarking are written once and reused everywhere."),
            ],
        ],
    },
    {
        "id": "OFF-03",
        "filename": "TQT_Setpoint_Optimisation_Lessons_Learned.pdf",
        "title": "Tenant Thermal Comfort - Lessons Learned from Setpoint Optimisation",
        "asset_type": "Office", "asset_name": "Tanjong Quay Tower", "location": "Singapore",
        "category": "Occupant Experience", "classification": "Operational",
        "author": "Office Asset Management & Property Operations", "doc_date": "2024-11",
        "problem": "Tenant thermal-comfort complaints after space temperature setpoints were raised to save energy",
        "solution": "Gradual zone-by-zone setpoint changes with elevated air speed, humidity control, tenant "
                    "engagement and a comfort feedback loop",
        "impact": "Comfort complaints down 68% from peak while retaining an 11% cooling energy saving",
        "pages": [
            [
                ("h", "1. What happened"),
                ("p", "In March 2024, to accelerate progress towards the building's energy target, space temperature "
                      "setpoints at Tanjong Quay Tower were raised from 23°C to 25°C across all floors in a single "
                      "overnight change. Within two weeks, hot complaints rose from about 12 to 96 per month. Two "
                      "anchor tenants escalated to the asset manager, and several tenants brought in desk fans."),
                ("h", "2. Root causes"),
                ("ul", [
                    "No tenant communication: occupants experienced the change without warning or explanation.",
                    "One setpoint for every zone: west-facing perimeter zones with high afternoon solar gain "
                    "overheated, while interior zones were comfortable.",
                    "Humidity was ignored: relative humidity of 65-70% made 25°C feel considerably warmer.",
                    "VAV box minimum airflows were set too low, so air movement at desks was poor.",
                ]),
            ],
            [
                ("h", "3. Recovery plan"),
                ("ul", [
                    "Setpoints were returned to 24°C, then raised in 0.5°C steps every two weeks, zone by zone, only "
                    "where comfort feedback stayed stable.",
                    "Elevated air speed: ceiling and desk fans providing 0.3-0.5 m/s of air movement allow a higher "
                    "setpoint at the same perceived comfort.",
                    "Humidity first: AHUs were re-tuned to control the space dew point, keeping relative humidity "
                    "below 60%.",
                    "Tenant engagement: each tenant nominated a 'comfort champion' and receives a monthly energy and "
                    "comfort report; green-lease clauses were introduced at renewal.",
                    "Comfort feedback loop: QR codes in each zone let occupants report 'too warm' or 'too cold'; each "
                    "report creates a BMS work order and reports are reviewed weekly.",
                ]),
            ],
            [
                ("h", "4. Results after six months"),
                ("table", [
                    ["KPI", "Before change", "Peak of complaints", "After recovery"],
                    ["Hot complaints per month", "12", "96", "31"],
                    ["Average space setpoint", "23.0°C", "25.0°C", "24.5°C"],
                    ["Cooling energy vs 2023", "-", "-15%", "-11%"],
                    ["Tenant satisfaction (survey)", "84%", "61%", "81%"],
                ]),
                ("h", "5. Lessons learned"),
                ("ul", [
                    "Never change setpoints building-wide overnight. Small, communicated steps are accepted; "
                    "surprises are not.",
                    "Humidity matters as much as temperature in a tropical climate.",
                    "Measure comfort, not just energy. A saving that drives tenants away is not a saving.",
                    "People accept changes they understand: explain the why, share the results and give occupants "
                    "a voice.",
                    "These lessons apply wherever occupants are sensitive to indoor conditions or have contractual "
                    "comfort expectations.",
                ]),
            ],
        ],
    },
    {
        "id": "OFF-04",
        "filename": "SOT_Lift_Predictive_Maintenance_Record.pdf",
        "title": "Lift Predictive Maintenance Programme - Maintenance Record FY2024",
        "asset_type": "Office", "asset_name": "Southbank Office Tower", "location": "Melbourne",
        "category": "Vertical Transportation", "classification": "Maintenance",
        "author": "Facilities Management, Australia Office Portfolio", "doc_date": "2025-01",
        "problem": "Frequent lift breakdowns and passenger entrapments disrupting tenants",
        "solution": "IoT condition monitoring of lift door operators and traction motors, with anomaly alerts driving "
                    "condition-based maintenance and an availability-based contract",
        "impact": "Lift breakdowns down 47%, entrapments cut from 7 to 2, average downtime per incident cut from "
                  "5.2 to 2.1 hours",
        "pages": [
            [
                ("h", "1. Baseline (FY2023)"),
                ("p", "Southbank Office Tower has 12 passenger lifts, installed in 2008, serving 34 floors. In FY2023 "
                      "the lifts recorded 58 breakdowns and 7 passenger entrapments, and lift availability was 98.7%. "
                      "Maintenance was time-based: the lift contractor visited each lift monthly regardless of its "
                      "condition, and most faults were only discovered when a lift stopped."),
                ("table", [
                    ["Fault category", "Share of breakdowns"],
                    ["Door operator, door locks and sills", "61%"],
                    ["Drive and traction motor", "18%"],
                    ["Controller and levelling", "14%"],
                    ["Other", "7%"],
                ]),
                ("h", "2. Impact on tenants"),
                ("p", "Breakdowns concentrated in the morning peak caused long waits in the lobby, and each entrapment "
                      "triggered an incident report and a tenant escalation. Lift performance was the second most "
                      "common complaint in the FY2023 tenant survey."),
            ],
            [
                ("h", "3. Condition-monitoring programme"),
                ("ul", [
                    "IoT sensors retrofitted on each lift: door cycle counter, door motor current, car vibration "
                    "(accelerometer), levelling accuracy and traction motor temperature.",
                    "Cloud analytics learn a normal baseline for each lift and raise an anomaly alert when, for "
                    "example, door closing time drifts by more than 15% or vibration rises above its baseline band.",
                    "Every alert automatically creates a work order in the CMMS with the sensor evidence attached, so "
                    "the technician arrives knowing which component to inspect.",
                    "Spare door operators, door rollers and lock contacts are held on site because door faults "
                    "dominate.",
                    "The maintenance contract moved from monthly visits to an availability-based contract with a 99.5% "
                    "availability target and shared savings.",
                ]),
                ("h", "4. Alert triage"),
                ("p", "In the first six weeks the system produced too many alerts and technicians began to ignore "
                      "them. Thresholds were re-tuned for each lift using technician feedback on every alert "
                      "('confirmed fault' or 'false alarm'), which cut false alarms by two thirds."),
            ],
            [
                ("h", "5. Results (FY2024)"),
                ("table", [
                    ["KPI", "FY2023", "FY2024"],
                    ["Breakdowns", "58", "31"],
                    ["Entrapments", "7", "2"],
                    ["Mean downtime per incident (hours)", "5.2", "2.1"],
                    ["Lift availability", "98.7%", "99.6%"],
                    ["Maintenance cost", "baseline", "+4% (sensors and subscription)"],
                ]),
                ("h", "6. Lessons learned"),
                ("ul", [
                    "Monitor the doors first: they cause most failures and are the cheapest part to instrument.",
                    "Availability-based contracts align the contractor's incentives with the occupant experience.",
                    "Alerts need an owner and a feedback loop; untuned thresholds create alarm fatigue.",
                    "Condition data is most valuable wherever lift downtime has a high human cost.",
                ]),
            ],
        ],
    },
    {
        "id": "OFF-05",
        "filename": "Office_Chiller_Retrofit_Business_Case.pdf",
        "title": "Chiller Plant Retrofit Programme - Business Case & Financial Review",
        "asset_type": "Office", "asset_name": "Keppel Bay Tower", "location": "Singapore",
        "category": "Financial Performance", "classification": "Financial",
        "author": "Office Portfolio Asset Management", "doc_date": "2025-06",
        "problem": "Rising electricity tariffs and an ageing chiller plant eroding net property income",
        "solution": "Invest in chiller plant optimisation (AI optimisation, VSDs, M&V instrumentation and controls) "
                    "and roll it out across the office portfolio",
        "impact": "S$1.9M capex, S$548k measured annual savings, 3.5-year simple payback (3.0 years after grant)",
        "pages": [
            [
                ("h", "1. Investment summary"),
                ("p", "This paper reviews the financial performance of the Keppel Bay Tower chiller plant "
                      "optimisation retrofit completed in October 2024 and recommends a phased rollout to other "
                      "office assets."),
                ("table", [
                    ["Capex item", "S$"],
                    ["AI optimisation platform and integration", "380,000"],
                    ["Variable speed drives (pumps and cooling tower fans)", "450,000"],
                    ["M&V instrumentation", "210,000"],
                    ["Controls and AHU upgrades", "520,000"],
                    ["Commissioning and contingency", "340,000"],
                    ["Total capex", "1,900,000"],
                    ["Less green building grant (assumed)", "(250,000)"],
                    ["Net capex", "1,650,000"],
                ]),
                ("h", "2. Business-case assumptions (approved 2023)"),
                ("ul", [
                    "Planned electricity saving of 1.76 GWh per year at an average tariff of S$0.29/kWh, plus "
                    "S$16,000 per year of avoided maintenance: S$526,000 per year in total.",
                    "Planned simple payback: 3.6 years gross, 3.1 years after the grant.",
                ]),
            ],
            [
                ("h", "3. Actual performance (first 12 months)"),
                ("table", [
                    ["Item", "Business case", "Actual"],
                    ["Electricity saved (GWh)", "1.76", "1.76"],
                    ["Average tariff (S$/kWh)", "0.29", "0.30"],
                    ["Energy cost saving (S$)", "510,000", "528,000"],
                    ["Maintenance saving (S$)", "16,000", "20,000"],
                    ["Total annual saving (S$)", "526,000", "548,000"],
                    ["Simple payback, net of grant (years)", "3.1", "3.0"],
                    ["NPV at 8% over 10 years (S$)", "1.88M", "2.03M"],
                    ["IRR", "29%", "31%"],
                ]),
                ("h", "4. Value impact"),
                ("p", "The annual saving flows directly to net property income (NPI). At an indicative capitalisation "
                      "rate of 4.0%, an NPI uplift of S$548,000 corresponds to roughly S$13.7 million of asset value, "
                      "more than seven times the capital invested. The retrofit also helped the asset qualify for a "
                      "sustainability-linked loan margin reduction of 5 basis points."),
                ("h", "5. Risks observed"),
                ("ul", [
                    "Tariff volatility moves the payback in both directions; savings were measured in kWh first and "
                    "valued second.",
                    "Measurement and verification disputes were avoided because permanent M&V instrumentation was "
                    "installed before the retrofit.",
                    "Tenant disruption was minimal thanks to phased commissioning.",
                ]),
            ],
            [
                ("h", "6. Portfolio rollout recommendation"),
                ("table", [
                    ["Asset", "Plant efficiency (kW/RT)", "Est. capex (S$)", "Est. saving (S$/yr)", "Payback (yrs)"],
                    ["Tanjong Quay Tower", "0.92", "1,400,000", "450,000", "3.1"],
                    ["Southbank Office Tower", "0.88", "1,250,000", "330,000", "3.8"],
                ]),
                ("h", "7. Recommendation"),
                ("p", "Approve phase 2 for Tanjong Quay Tower in FY2026 and Southbank Office Tower in FY2027, reusing "
                      "the same vendor framework, M&V specification and shadow-mode commissioning. Cooling-intensive "
                      "assets elsewhere in the wider portfolio should be screened using the same method, because "
                      "savings scale with cooling load and operating hours."),
            ],
        ],
    },
    {
        "id": "OFF-06",
        "filename": "TQT_Cooling_Tower_Water_Maintenance_Record.pdf",
        "title": "Cooling Tower Water Efficiency & Legionella Control - Maintenance Record",
        "asset_type": "Office", "asset_name": "Tanjong Quay Tower", "location": "Singapore",
        "category": "Water Management", "classification": "Maintenance",
        "author": "Facilities Management, Singapore Office Portfolio", "doc_date": "2025-09",
        "problem": "Excessive cooling tower make-up water use and Legionella risk from manual water treatment",
        "solution": "Automated conductivity-based blowdown control, higher cycles of concentration, side-stream "
                    "filtration and monthly Legionella testing",
        "impact": "Cooling tower make-up water down 21% with zero Legionella exceedances in 18 months",
        "pages": [
            [
                ("h", "1. Maintenance log summary (2024)"),
                ("p", "Tanjong Quay Tower operates four induced-draft cooling towers serving a 2,400 RT chilled-water "
                      "plant. Water treatment was manual: the contractor opened the blowdown valves twice a day and "
                      "dosed chemicals by hand. Cycles of concentration averaged only 3.5 and make-up water use "
                      "reached 62,000 m³ per year."),
                ("table", [
                    ["Date", "Observation", "Action taken"],
                    ["12 Feb 2024", "High conductivity on CT-2 after a missed blowdown", "Manual blowdown; dosing adjusted"],
                    ["07 May 2024", "Legionella count above action level, CT-3", "Tower isolated, disinfected, retested clear"],
                    ["19 Aug 2024", "Scale on condenser tubes of chiller CH-2", "Tubes brushed; approach temperature restored"],
                    ["03 Oct 2024", "Legionella count above action level, CT-1", "Disinfected; damaged drift eliminators found"],
                ]),
                ("p", "Water treatment contractor on record: Mr Tan Wei Ming (mobile 9123 4567, "
                      "weiming.tan@example.com)."),
            ],
            [
                ("h", "2. Corrective actions"),
                ("ul", [
                    "Automated conductivity controller with a motorised blowdown valve on each tower; blowdown now "
                    "happens continuously in small amounts instead of twice a day.",
                    "Cycles of concentration raised from 3.5 to 6 with a scale and corrosion inhibitor programme and "
                    "corrosion coupon monitoring.",
                    "Side-stream filtration added to remove suspended solids.",
                    "Automated biocide dosing controlled by oxidation-reduction potential (ORP).",
                    "Legionella sampling increased from quarterly to monthly for each tower; damaged drift eliminators "
                    "replaced.",
                    "Conductivity, ORP and make-up water meters integrated into the BMS, with alarms to the control "
                    "room.",
                ]),
            ],
            [
                ("h", "3. Results (18 months)"),
                ("table", [
                    ["KPI", "2024 baseline", "2025-2026 (annualised)"],
                    ["Make-up water (m³/yr)", "62,000", "49,000"],
                    ["Cycles of concentration", "3.5", "6.0"],
                    ["Legionella exceedances", "2", "0"],
                    ["Chemical cost", "baseline", "-9%"],
                ]),
                ("h", "4. Lessons learned"),
                ("ul", [
                    "Automation removes the variability of manual blowdown; most exceedances followed missed or late "
                    "manual actions.",
                    "Blowdown valves must be fail-safe and must alarm when stuck open or stuck closed.",
                    "Higher cycles need tighter corrosion monitoring; coupons are cheap insurance.",
                    "Coordinate with chiller plant optimisation: a lower condenser-water temperature saves chiller "
                    "energy but increases evaporation.",
                ]),
            ],
        ],
    },
    # ------------------------------------------------------------- DATA CENTRE
    {
        "id": "DC-01",
        "filename": "TDC1_Cooling_Optimisation_Report.pdf",
        "title": "Data Hall Cooling Optimisation Report",
        "asset_type": "Data Centre", "asset_name": "Tampines Data Centre 1", "location": "Singapore",
        "category": "Energy Efficiency", "classification": "Technical",
        "author": "Data Centre Engineering", "doc_date": "2025-05",
        "problem": "High PUE caused by overcooling and hot-air recirculation in the data halls",
        "solution": "Hot-aisle containment, higher CRAH supply air temperature within ASHRAE limits, rack-inlet sensor "
                    "control of CRAH fans and a higher chilled-water temperature",
        "impact": "PUE reduced from 1.68 to 1.52; cooling energy down 34% (7.2 GWh per year)",
        "pages": [
            [
                ("h", "1. Summary"),
                ("p", "Tampines Data Centre 1 (TDC1) is an 8 MW colocation facility with three data halls and a "
                      "current IT load of 5.1 MW. In 2024 its annualised power usage effectiveness (PUE) was 1.68, "
                      "well above the portfolio target of 1.50, and cooling accounted for roughly 70% of the non-IT "
                      "energy. A cooling optimisation programme in the data halls reduced PUE to 1.52 and cooling "
                      "energy by 34%."),
                ("h", "2. Baseline findings"),
                ("ul", [
                    "CRAH units supplied air at 18°C with fans fixed at 100% speed, far colder than the IT equipment "
                    "required.",
                    "A thermal survey and CFD study found 42% bypass airflow and hot-air recirculation over rack tops: "
                    "rack inlet temperatures ranged from 19°C to 27°C within the same row.",
                    "Blanking panels were missing in 30% of racks and cable cut-outs were unsealed.",
                    "Chilled water was supplied at 7°C, the same as a typical office plant.",
                ]),
            ],
            [
                ("h", "3. Measures implemented"),
                ("ul", [
                    "Hot-aisle containment in all three data halls, with blanking panels and brush grommets sealing "
                    "every opening.",
                    "CRAH supply air temperature raised in 1°C steps from 18°C to 24°C, keeping every rack inlet "
                    "inside the ASHRAE TC9.9 recommended envelope of 18-27°C.",
                    "Three temperature sensors per rack (top, middle and bottom) now drive CRAH fan speed through "
                    "variable speed drives; fans typically run at 55-70%.",
                    "Chilled-water supply temperature raised from 7°C to 12°C, which improves chiller efficiency and "
                    "removes most unnecessary dehumidification.",
                    "Customer SLAs were reviewed before each step, and every change had a documented rollback.",
                ]),
                ("h", "4. Results"),
                ("table", [
                    ["KPI", "2024", "After programme"],
                    ["PUE (annualised)", "1.68", "1.52"],
                    ["Cooling energy (GWh/yr)", "21.2", "14.0"],
                    ["CRAH fan power (kW)", "610", "290"],
                    ["Rack inlet temperature spread", "19-27°C", "23-25°C"],
                ]),
                ("p", "The annual saving of 7.2 GWh avoids about 2,970 tCO2e."),
            ],
            [
                ("h", "5. Lessons learned"),
                ("ul", [
                    "Containment first. Raising setpoints before sealing the aisles created hot spots in two rows "
                    "during the pilot.",
                    "Watch humidity. After the chilled-water temperature was raised, relative humidity in Data Hall 2 "
                    "rose to 65%; a dedicated dehumidification unit now keeps the dew point within ASHRAE limits.",
                    "Communicate with customers. Two colocation customers queried the higher inlet temperatures; "
                    "publishing live rack-inlet data against the SLA resolved their concerns.",
                ]),
                ("h", "6. Remaining opportunities"),
                ("p", "Air-side and chilled-water temperatures are now optimised, but the central chiller plant is "
                      "still sequenced manually by the operations team using fixed rules, and plant efficiency is only "
                      "measured monthly. Plant-level optimisation - chiller staging, condenser-water reset and pump "
                      "and tower-fan speed control - is the next opportunity, but the data-centre team has no in-house "
                      "precedent for it yet."),
            ],
        ],
    },
    {
        "id": "DC-02",
        "filename": "JHC_Chiller_Failure_Incident_RCA.pdf",
        "title": "Chiller Failure Incident Log & Root Cause Analysis",
        "asset_type": "Data Centre", "asset_name": "Jurong Hyperscale Campus", "location": "Singapore",
        "category": "Incident & Failure Analysis", "classification": "Maintenance",
        "author": "Critical Facilities Operations", "doc_date": "2025-04",
        "problem": "Chiller compressor failure and a failed standby start caused a temperature excursion in a data hall",
        "solution": "Vibration-based condition monitoring on chiller compressors, automated monthly failover testing "
                    "and change control for BMS software updates",
        "impact": "Zero unplanned chiller trips in the following 12 months; three incipient faults caught weeks "
                  "before failure",
        "pages": [
            [
                ("h", "1. Incident summary"),
                ("p", "At 02:40 on 14 March 2025, chiller CH-03 serving Data Hall 2 tripped on high motor winding "
                      "temperature caused by a compressor bearing failure. The standby chiller CH-04 failed to start "
                      "automatically because a BMS software update two weeks earlier had altered the sequencing "
                      "logic. Rack inlet temperatures in Data Hall 2 rose from 24°C to 31.5°C within 14 minutes. Two "
                      "customers' servers throttled performance, but no IT load was lost."),
                ("table", [
                    ["Time", "Event"],
                    ["02:40", "CH-03 trips; alarm raised in the NOC"],
                    ["02:44", "CH-04 auto-start fails (sequencing fault)"],
                    ["02:49", "On-call technician dispatched"],
                    ["02:54", "Rack inlet temperature reaches 31.5°C"],
                    ["02:58", "CH-04 started manually; temperatures begin to recover"],
                    ["03:35", "Data Hall 2 back within SLA"],
                ]),
                ("p", "Attendance: on-call technician Muhammad Hafiz (tel. 8765 4321); chiller OEM service engineer "
                      "Ravi Kumar (NRIC S1234567D)."),
            ],
            [
                ("h", "2. Root cause analysis (five whys)"),
                ("ul", [
                    "Why did CH-03 fail? The compressor bearing had worn progressively for about six weeks.",
                    "Why was the wear not detected? Maintenance was time-based: quarterly inspection and oil analysis, "
                    "the last of which took place ten weeks before the failure. No continuous vibration monitoring "
                    "was installed.",
                    "Why did the standby chiller not start? A BMS software update changed the sequencing logic, and "
                    "failover was not re-tested after the update.",
                    "Why was it not re-tested? The change process did not require failover testing after "
                    "control-software changes.",
                ]),
                ("h", "3. Contributing factors"),
                ("ul", [
                    "There was no alarm for 'standby chiller not ready'.",
                    "Failover had last been tested four months earlier.",
                ]),
            ],
            [
                ("h", "4. Corrective and preventive actions"),
                ("ul", [
                    "Tri-axial vibration sensors installed on all chiller compressors and condenser-water pumps, with "
                    "machine-learning anomaly detection on bearing defect frequencies.",
                    "Automated monthly failover test of every chiller, with results logged.",
                    "Change control: any BMS or controls software change now requires a documented failover retest "
                    "before sign-off.",
                    "Critical spare bearing kits held on site.",
                ]),
                ("h", "5. Results after 12 months"),
                ("p", "There were no unplanned chiller trips in the 12 months after these actions. Vibration "
                      "monitoring raised three early warnings - a bearing defect, a shaft misalignment and pump "
                      "cavitation - each detected two to five weeks before it would have caused a failure and repaired "
                      "during a planned maintenance window."),
            ],
        ],
    },
    {
        "id": "DC-03",
        "filename": "TDC1_Predictive_Maintenance_Pilot_Report.pdf",
        "title": "Predictive Maintenance Pilot - Vibration & Acoustic Analytics",
        "asset_type": "Data Centre", "asset_name": "Tampines Data Centre 1", "location": "Singapore",
        "category": "Predictive Maintenance", "classification": "Technical",
        "author": "Data Centre Engineering & Analytics", "doc_date": "2025-10",
        "problem": "Unplanned failures of rotating equipment despite time-based maintenance",
        "solution": "Wireless vibration and acoustic sensors with machine-learning anomaly detection generating "
                    "condition-based work orders",
        "impact": "Seven incipient faults detected 2-6 weeks ahead; mean time between failures up 38%; maintenance "
                  "cost down 15%",
        "pages": [
            [
                ("h", "1. Pilot scope"),
                ("p", "Time-based maintenance was not preventing unplanned failures of rotating equipment at TDC1: "
                      "four failures of pumps and CRAH fans in 2024 each needed an emergency call-out. A nine-month "
                      "pilot instrumented 116 critical assets with wireless vibration and acoustic sensors."),
                ("table", [
                    ["Asset group", "Units instrumented"],
                    ["Chillers (compressors and motors)", "6"],
                    ["Chilled-water and condenser-water pumps", "24"],
                    ["CRAH fans", "86"],
                ]),
                ("h", "2. How it works"),
                ("ul", [
                    "Sensors sample every 10 minutes and capture a high-resolution vibration burst once a day.",
                    "An edge gateway computes spectral features, including harmonics of running speed and bearing "
                    "defect frequencies.",
                    "A machine-learning model learns each asset's normal baseline and flags anomalies with a severity "
                    "score.",
                    "Every alert creates a condition-based work order in the CMMS, with the spectrum attached for the "
                    "technician.",
                ]),
            ],
            [
                ("h", "3. Results"),
                ("table", [
                    ["Fault detected", "Asset", "Lead time before failure"],
                    ["Bearing wear", "Condenser-water pump P-07", "6 weeks"],
                    ["Bearing wear", "CRAH fan DH1-14", "4 weeks"],
                    ["Bearing wear", "Chiller CH-02 motor", "5 weeks"],
                    ["Shaft misalignment", "Chilled-water pump P-03", "3 weeks"],
                    ["Shaft misalignment", "CRAH fan DH3-02", "2 weeks"],
                    ["Belt looseness", "CRAH fan DH2-21", "2 weeks"],
                    ["Cavitation", "Condenser-water pump P-11", "3 weeks"],
                ]),
                ("p", "Mean time between failures across the instrumented assets rose by 38%. Maintenance cost fell "
                      "15% because fixed-interval overhauls were replaced by repairs triggered by condition."),
                ("h", "4. False alarms"),
                ("p", "In the first month 22% of alerts were false alarms. Technicians labelled every alert as "
                      "confirmed or false, and the labels were used to retune thresholds for each asset; the "
                      "false-alarm rate fell to 6% by month four."),
            ],
            [
                ("h", "5. Lessons learned"),
                ("ul", [
                    "Start with the critical rotating equipment whose failure hurts most.",
                    "The technician feedback loop is essential: labelled alerts turn a noisy system into a trusted one.",
                    "Integrate with the CMMS from day one so every alert has an owner.",
                    "Wireless sensors can be retrofitted without shutting equipment down.",
                ]),
                ("h", "6. Cost and scale-up"),
                ("p", "The installed cost was S$400-650 per monitored asset plus an analytics subscription. The "
                      "approach suits any motor-driven equipment with a characteristic vibration signature - pumps, "
                      "fans, compressors and traction machines - and is being scaled to all rotating plant at TDC1."),
            ],
        ],
    },
    {
        "id": "DC-04",
        "filename": "JHC_Water_Usage_Effectiveness_Report.pdf",
        "title": "Water Usage Effectiveness (WUE) Improvement Report",
        "asset_type": "Data Centre", "asset_name": "Jurong Hyperscale Campus", "location": "Singapore",
        "category": "Water Management", "classification": "Technical",
        "author": "Data Centre Sustainability Engineering", "doc_date": "2025-12",
        "problem": "High water usage effectiveness (WUE) from cooling tower evaporation and blowdown",
        "solution": "NEWater make-up, higher cycles of concentration with side-stream filtration, automated treatment "
                    "and condenser-water optimisation",
        "impact": "WUE improved from 1.9 to 1.35 L/kWh; potable water use down 80%",
        "pages": [
            [
                ("h", "1. Background"),
                ("p", "Jurong Hyperscale Campus (JHC) rejects heat through eight cooling towers. In 2024 the campus "
                      "used 240,000 m³ of potable water, a water usage effectiveness (WUE) of 1.9 litres per kWh of IT "
                      "energy. The cooling towers ran at only three cycles of concentration, so a large share of the "
                      "water was lost to blowdown. Customers increasingly ask for WUE disclosures in tenders."),
                ("h", "2. Measures"),
                ("ul", [
                    "Cooling tower make-up switched from potable water to NEWater, Singapore's high-grade reclaimed "
                    "water, which has very low dissolved solids.",
                    "Cycles of concentration raised from 3 to 7, made possible by NEWater's low mineral content, "
                    "side-stream filtration and automated inhibitor dosing.",
                    "Blowdown water recovered for irrigation and toilet flushing.",
                    "Condenser-water setpoints optimised to reduce evaporation at part load.",
                    "Online monitoring of conductivity, ORP and biocide residual, with monthly Legionella sampling.",
                ]),
            ],
            [
                ("h", "3. Results"),
                ("table", [
                    ["KPI", "2024", "2025"],
                    ["Total water (m³/yr)", "240,000", "171,000"],
                    ["Potable water (m³/yr)", "240,000", "48,000"],
                    ["Cycles of concentration", "3", "7"],
                    ["WUE (L/kWh)", "1.9", "1.35"],
                ]),
                ("h", "4. Lessons learned"),
                ("ul", [
                    "NEWater's low mineral content is what allows much higher cycles of concentration.",
                    "Monitor corrosion closely when water chemistry changes; corrosion coupons flagged an early issue "
                    "on galvanised surfaces.",
                    "Energy and water trade off: a lower condenser-water temperature saves chiller energy but "
                    "increases evaporation, so both must be optimised together.",
                    "Legionella control must stay robust as cycles rise; ORP-based biocide dosing and monthly testing "
                    "were introduced before cycles were increased.",
                ]),
            ],
        ],
    },
    {
        "id": "DC-05",
        "filename": "DDC2_UPS_Battery_Thermal_Event_Lessons.pdf",
        "title": "UPS Battery Thermal Event - Lessons Learned",
        "asset_type": "Data Centre", "asset_name": "Dublin Colocation DC2", "location": "Dublin, Ireland",
        "category": "Power Resilience", "classification": "Operational",
        "author": "European Data Centre Operations", "doc_date": "2025-09",
        "problem": "A UPS battery string overheated after the battery room cooling failed, risking thermal runaway",
        "solution": "Per-block battery monitoring, redundant battery-room cooling with alarms routed to the NOC, and "
                    "migration to lithium-ion batteries with a battery management system",
        "impact": "Event contained with no loss of IT load; battery-related alarms down 70% after the upgrade",
        "pages": [
            [
                ("h", "1. What happened"),
                ("p", "On 18 June 2025, during an unusually hot spell, the single split air-conditioning unit serving "
                      "UPS battery room B failed. The room temperature rose to 38°C over about three hours. The room "
                      "temperature alarm was sent only by e-mail to a shared inbox and was not seen by the 24/7 "
                      "network operations centre (NOC). A technician on a routine walk-round noticed the heat and "
                      "found VRLA battery string 2 at 52°C with visibly swollen blocks. The string was isolated and "
                      "the UPS stayed online on its remaining strings; no IT load was lost."),
                ("h", "2. Root causes"),
                ("ul", [
                    "Battery room cooling had no redundancy: one unit and no standby.",
                    "Critical alarms were routed to e-mail rather than to the NOC alarm console with escalation.",
                    "Battery monitoring measured string voltage only, with no per-block temperature or internal "
                    "resistance data.",
                    "The VRLA batteries were 5.5 years old and nearing the end of their life.",
                ]),
            ],
            [
                ("h", "3. Actions"),
                ("ul", [
                    "Per-block battery monitoring (temperature, voltage and internal resistance) on every string, "
                    "with trend alarms.",
                    "N+1 cooling for all battery rooms, and high-temperature alarms routed to the NOC with automatic "
                    "escalation to the duty manager.",
                    "VRLA strings replaced with lithium-ion batteries with an integrated battery management system and "
                    "thermal-runaway detection.",
                    "Quarterly thermal imaging of battery rooms and switchgear.",
                    "Integrated systems test of the UPS, generators and cooling twice a year.",
                ]),
                ("h", "4. Lessons learned"),
                ("ul", [
                    "An alarm that goes to e-mail is not an alarm. Every critical alarm needs a monitored console and "
                    "an escalation path.",
                    "Single points of failure hide in support spaces: battery rooms, switch rooms and pump rooms "
                    "deserve the same redundancy review as the data halls.",
                    "Monitor what fails first: for batteries that is temperature and internal resistance, not string "
                    "voltage.",
                    "Test like you mean it: integrated tests under real load reveal interactions that component tests "
                    "miss.",
                ]),
            ],
        ],
    },
    {
        "id": "DC-06",
        "filename": "DC_Renewable_Energy_Strategy_2026_2030.pdf",
        "title": "Energy Procurement & Renewable Strategy 2026-2030",
        "asset_type": "Data Centre", "asset_name": "Data Centre Portfolio", "location": "Singapore & Europe",
        "category": "Sustainability Strategy", "classification": "Strategic",
        "author": "Data Centre Fund Management", "doc_date": "2026-01",
        "problem": "Rising energy costs and customer demand for low-carbon capacity threaten competitiveness",
        "solution": "Efficiency-first cooling retrofits, renewable procurement (PPAs and RECs), on-site solar and "
                    "heat-reuse pilots",
        "impact": "Targets of 60% renewable electricity and a portfolio PUE of 1.40 or better by 2030",
        "pages": [
            [
                ("h", "1. Context"),
                ("p", "The data-centre portfolio consumes about 420 GWh of electricity per year. Energy is 45-60% of "
                      "operating cost, and hyperscale customers now require renewable-energy matching and declining "
                      "carbon intensity in new contracts. Without action, rising tariffs and carbon prices will erode "
                      "margins and win rates."),
                ("h", "2. Strategy pillars"),
                ("ul", [
                    "Efficiency first: reach a portfolio PUE of 1.40 through containment, higher operating "
                    "temperatures and plant-level chiller optimisation. Proven chiller-plant optimisation practices "
                    "elsewhere in the wider real-estate portfolio should be evaluated for data-centre plants.",
                    "Renewable procurement: corporate PPAs for wind power in Ireland; renewable energy certificates "
                    "(RECs) and regional electricity imports in Singapore as they become available.",
                    "On-site solar: limited roof area means on-site solar covers only 1-2% of load, but it is visible "
                    "to customers.",
                    "Heat reuse: pilot the export of waste heat to a district heating network in Dublin.",
                    "Green financing: link sustainability-linked loans to PUE and renewable-share targets.",
                ]),
            ],
            [
                ("h", "3. Targets and roadmap"),
                ("table", [
                    ["KPI", "2025", "2027", "2030"],
                    ["Portfolio PUE", "1.58", "1.48", "1.40"],
                    ["Renewable electricity share", "18%", "35%", "60%"],
                    ["Carbon intensity (kgCO2e per kWh of IT load)", "0.52", "0.38", "0.22"],
                ]),
                ("h", "4. Investment envelope"),
                ("p", "The plan requires about S$85 million over five years: S$40 million for efficiency retrofits, "
                      "S$25 million for on-site solar, heat reuse and electrical upgrades, and S$20 million of "
                      "contingency and PPA collateral. Efficiency projects are expected to pay back in 3-5 years; "
                      "renewable procurement is expected to be cost-neutral to slightly positive over the PPA terms."),
                ("h", "5. Key risks"),
                ("ul", [
                    "Availability and price of renewable electricity in Singapore.",
                    "Customer acceptance of higher operating temperatures.",
                    "Execution capacity of engineering teams while facilities remain live.",
                ]),
            ],
        ],
    },
    {
        "id": "DC-07",
        "filename": "DC_Maintenance_MOP_Change_Control_Standard.pdf",
        "title": "Maintenance Change Control & Method of Procedure (MOP) Standard",
        "asset_type": "Data Centre", "asset_name": "Data Centre Portfolio", "location": "Singapore & Europe",
        "category": "Operational Excellence", "classification": "Operational",
        "author": "Critical Facilities Operations", "doc_date": "2024-08",
        "problem": "Human error during maintenance works caused a large share of data centre incidents",
        "solution": "Mandatory Method of Procedure (MOP) with peer review, pre-task briefings, rollback steps and "
                    "advance customer notifications",
        "impact": "Human-error incidents down 60% over two years",
        "pages": [
            [
                ("h", "1. Why this standard exists"),
                ("p", "A review of 48 incidents across the data-centre portfolio in 2022-2023 found that 40% were "
                      "caused by human error during planned maintenance: operating the wrong breaker, skipping a step "
                      "or making an untested change. Most happened during routine work that 'everyone knew how to "
                      "do'."),
                ("h", "2. Method of Procedure (MOP) requirements"),
                ("ul", [
                    "Every maintenance activity that can affect redundancy or customer load requires a written MOP.",
                    "A MOP contains the scope, a risk assessment, step-by-step actions with verification points, "
                    "expected system states, a rollback plan and a communications plan.",
                    "MOPs are graded by risk; Level 3 (high-risk) MOPs require peer review and approval by the change "
                    "advisory board.",
                    "A pre-task briefing is held on site before work starts, walking the team through the MOP and the "
                    "rollback steps.",
                    "Two-person verification for all electrical switching: one person reads the step, the other "
                    "performs it.",
                ]),
            ],
            [
                ("h", "3. Customer communication"),
                ("ul", [
                    "Customers receive notice at least five business days before any work that reduces redundancy, "
                    "with the start time, expected duration and the risk mitigation in place.",
                    "Live status updates are sent at the start and end of work, and immediately if anything deviates "
                    "from the plan.",
                    "A post-work summary is shared for high-risk activities.",
                ]),
                ("h", "4. Results"),
                ("table", [
                    ["KPI", "2022-2023", "2024-2025"],
                    ["Incidents caused by human error (per year)", "9.6", "3.8"],
                    ["Maintenance activities with a MOP", "55%", "100%"],
                    ["Customer complaints about maintenance", "14", "3"],
                ]),
                ("h", "5. Lessons learned"),
                ("ul", [
                    "MOPs must be usable in the field: checklists, not essays.",
                    "Rehearse complex or rare works on a mock-up or in a quiet period.",
                    "Proactive communication builds trust. Customers tolerate planned work they are told about; "
                    "surprises damage relationships far more than the work itself.",
                ]),
            ],
        ],
    },
    # ----------------------------------------------------------- SENIOR LIVING
    {
        "id": "SL-01",
        "filename": "HSR_Facility_Management_Q2_2026.pdf",
        "title": "Facility Management Quarterly Report - Q2 2026",
        "asset_type": "Senior Living", "asset_name": "Harmony Senior Residences", "location": "Singapore",
        "category": "Facility Management", "classification": "Operational",
        "author": "Facility Management Team, Harmony Senior Residences", "doc_date": "2026-07",
        "problem": "Rising utility costs from 24/7 air-conditioning, recurring lift breakdowns and hot water complaints",
        "solution": "Q3 action plan: chiller plant efficiency audit, lift contract review, heat-pump hot water study "
                    "and better resident communication",
        "impact": "Utility cost growth held to 3% year on year; actions tracked for Q3 2026",
        "pages": [
            [
                ("h", "1. Property overview"),
                ("p", "Harmony Senior Residences has 220 residential units in two 12-storey blocks, with a care "
                      "centre, dining hall and therapy rooms. Common areas and resident rooms are cooled by a central "
                      "350 RT water-cooled chiller plant with two cooling towers, and each room has a fan coil unit. "
                      "Each block has two lifts."),
                ("table", [
                    ["KPI (Q2 2026)", "Value", "vs Q2 2025"],
                    ["Electricity (MWh)", "740", "+3%"],
                    ["Chiller plant efficiency (spot reading, kW/RT)", "1.05", "n/a"],
                    ["Work orders", "412", "+9%"],
                    ["Average work order response (hours)", "3.8", "+0.6"],
                    ["Lift breakdowns", "6", "+2"],
                    ["Hot water complaints", "23", "+8"],
                ]),
            ],
            [
                ("h", "2. Key issues"),
                ("ul", [
                    "Energy: air-conditioning runs 24 hours a day in common areas and resident rooms. The chiller plant "
                    "has no permanent metering, and the spot reading of 1.05 kW/RT suggests poor efficiency. Chillers "
                    "are staged manually by the technician on duty.",
                    "Lifts: six breakdowns in the quarter, mostly door-related. Residents with mobility aids are the "
                    "most affected; see the lift incident log for details.",
                    "Hot water: electric storage heaters cannot meet the morning peak demand, leading to complaints "
                    "about lukewarm showers.",
                    "Resident satisfaction: families have complained about slow repairs and a lack of updates during "
                    "maintenance works.",
                ]),
                ("h", "3. Q3 2026 action plan"),
                ("ul", [
                    "Commission a chiller plant efficiency audit and install basic metering.",
                    "Review the lift maintenance contract and response times with the contractor.",
                    "Study the feasibility of heat-pump hot water.",
                    "Introduce advance notices for maintenance works that affect residents.",
                ]),
            ],
        ],
    },
    {
        "id": "SL-02",
        "filename": "HSR_Lift_Breakdown_Incident_Log.pdf",
        "title": "Lift Breakdown Incident Log & Resident Impact Assessment",
        "asset_type": "Senior Living", "asset_name": "Harmony Senior Residences", "location": "Singapore",
        "category": "Vertical Transportation", "classification": "Maintenance",
        "author": "Facility Management Team, Harmony Senior Residences", "doc_date": "2026-07",
        "problem": "Recurring lift breakdowns stranding residents with limited mobility",
        "solution": "Interim measures: priority call-out SLA with the lift contractor, a resident buddy system and "
                    "evacuation chairs; condition monitoring under evaluation",
        "impact": "Call-out response improved to 25 minutes, but breakdown frequency unchanged (14 in six months)",
        "pages": [
            [
                ("h", "1. Incident log (January-June 2026)"),
                ("table", [
                    ["Date", "Lift", "Fault", "Downtime", "Residents affected"],
                    ["08 Jan", "Block A L1", "Door failed to close", "3.5 h", "18"],
                    ["21 Jan", "Block B L2", "Door operator fault", "6.0 h", "22"],
                    ["04 Feb", "Block A L2", "Levelling fault", "2.0 h", "11"],
                    ["17 Feb", "Block B L1", "Entrapment: door lock fault (resident in wheelchair, 48 min)", "5.0 h", "20"],
                    ["02 Mar", "Block A L1", "Door operator fault", "4.5 h", "18"],
                    ["19 Mar", "Block B L2", "Drive fault", "9.0 h", "25"],
                    ["06 Apr", "Block A L2", "Door failed to close", "2.5 h", "12"],
                    ["22 Apr", "Block B L1", "Levelling fault", "3.0 h", "19"],
                    ["09 May", "Block A L1", "Door operator fault", "5.5 h", "17"],
                    ["15 May", "Block B L2", "Power dip; controller reset", "1.0 h", "9"],
                    ["28 May", "Block A L2", "Entrapment: door fault (resident with walker, 35 min)", "4.0 h", "14"],
                    ["06 Jun", "Block B L1", "Door operator fault", "6.5 h", "21"],
                    ["18 Jun", "Block A L1", "Drive fault", "8.0 h", "19"],
                    ["27 Jun", "Block B L2", "Levelling fault", "2.5 h", "10"],
                ]),
                ("p", "Summary: 14 breakdowns and 2 entrapments in six months - 8 door-related faults, 3 levelling "
                      "faults, 2 drive faults and 1 power dip. Lift contractor duty technician: Ahmad Rizal (hotline "
                      "9234 5678)."),
            ],
            [
                ("h", "2. Impact on residents"),
                ("ul", [
                    "38% of residents use wheelchairs, walkers or other mobility aids. When a block's lift is out of "
                    "service, residents above level 3 are effectively confined to their floor.",
                    "Three residents missed medical appointments because of breakdowns this half-year.",
                    "Families escalated complaints after the two entrapments; one resident was trapped for 48 minutes.",
                    "In an emergency, residents with limited mobility depend on staff for evacuation when a lift is "
                    "unavailable.",
                ]),
                ("h", "3. Current maintenance regime"),
                ("p", "The lift contractor carries out monthly time-based servicing under a standard contract. Door "
                      "components are replaced only after they fail. The contract measures response time, not lift "
                      "availability, and there is no condition data on the lifts."),
            ],
            [
                ("h", "4. Interim measures"),
                ("ul", [
                    "Priority call-out SLA: the contractor must respond within 30 minutes (average achieved: 25 "
                    "minutes).",
                    "Resident buddy system: staff check on residents above level 3 during outages and deliver meals if "
                    "needed.",
                    "An evacuation chair on each floor, with staff trained in its use.",
                ]),
                ("h", "5. Open questions"),
                ("ul", [
                    "Can breakdowns be predicted before residents are stranded? Door faults dominate, but there is no "
                    "data on door condition.",
                    "Would a different contract model give the contractor an incentive to prevent failures rather "
                    "than respond to them?",
                    "There is no precedent within the senior-living portfolio for monitoring lift condition; options "
                    "are being evaluated.",
                ]),
            ],
        ],
    },
    {
        "id": "SL-03",
        "filename": "HSR_Thermal_Comfort_Energy_Lessons.pdf",
        "title": "Resident Thermal Comfort & Air-Conditioning Energy - Operational Lessons",
        "asset_type": "Senior Living", "asset_name": "Harmony Senior Residences", "location": "Singapore",
        "category": "Occupant Experience", "classification": "Operational",
        "author": "Operations & Care Team, Harmony Senior Residences", "doc_date": "2026-03",
        "problem": "Elderly residents uncomfortable (too cold at night, stuffy by day) while air-conditioning energy "
                   "use kept rising",
        "solution": "Resident comfort bands of 24-26°C with humidity control, ceiling fans, night setback in common "
                    "areas and staff and family engagement",
        "impact": "Air-conditioning energy down 12% and comfort complaints down 40%",
        "pages": [
            [
                ("h", "1. Background"),
                ("p", "Residents at Harmony Senior Residences are aged 70 to 95. Ageing reduces the body's ability to "
                      "regulate temperature, so residents are more sensitive both to cold draughts and to heat stress. "
                      "Before this initiative, room thermostats could be set anywhere from 16°C to 30°C. Visitors and "
                      "staff often set rooms to 20°C, residents then felt cold at night, and common areas felt stuffy "
                      "during the day. Relative humidity above 70% in some rooms caused mould on walls and wardrobes."),
                ("h", "2. Measures"),
                ("ul", [
                    "Comfort band: thermostats limited to 24-26°C; residents can adjust within the band, and nursing "
                    "staff can approve medical exceptions.",
                    "Humidity control: fan coil units use a dehumidification mode at night, keeping relative humidity "
                    "below 65%.",
                    "Ceiling fans in rooms and lounges provide air movement so that 25-26°C feels comfortable.",
                    "Night setback: common-area setpoints rise by 1°C after 11 pm.",
                ]),
            ],
            [
                ("h", "3. Engagement"),
                ("ul", [
                    "Residents and families were briefed at town halls before any change, and each resident's "
                    "preferences were recorded in their care plan.",
                    "Care staff were trained to recognise signs of heat stress and of feeling cold, and to report "
                    "comfort issues through the maintenance app.",
                    "A monthly comfort check was added to the care routine.",
                ]),
                ("h", "4. Results (six months)"),
                ("table", [
                    ["KPI", "Before", "After"],
                    ["Air-conditioning energy (MWh/month)", "168", "148"],
                    ["Comfort complaints per month", "25", "15"],
                    ["Rooms with mould reports", "9", "2"],
                ]),
                ("h", "5. Lessons learned"),
                ("ul", [
                    "Involve residents and families before changing anything they can feel; explain why and listen.",
                    "Humidity matters as much as temperature.",
                    "Health comes first: medical needs override energy targets, and exceptions must be easy to approve.",
                    "Make small changes and measure comfort as carefully as energy.",
                ]),
            ],
        ],
    },
    {
        "id": "SL-04",
        "filename": "SGSL_Resident_Family_Experience_Survey_2026.pdf",
        "title": "Resident & Family Experience Survey 2026",
        "asset_type": "Senior Living", "asset_name": "Sakura Gardens Senior Living", "location": "Osaka, Japan",
        "category": "Customer Experience", "classification": "Operational",
        "author": "Resident Experience Team, Sakura Gardens", "doc_date": "2026-05",
        "problem": "Resident and family satisfaction fell, driven by maintenance disruptions and poor communication",
        "solution": "72-hour advance notice of maintenance works, a single point of contact, quiet hours for works and "
                    "a digital feedback channel for families",
        "impact": "Net Promoter Score improved from +12 to +26 within two quarters; complaints about works down 55%",
        "pages": [
            [
                ("h", "1. Survey overview"),
                ("p", "The annual survey reached 186 residents and 240 family members, a response rate of 71%. Overall "
                      "satisfaction fell from 81% to 72% and the Net Promoter Score (NPS) fell to +12."),
                ("table", [
                    ["Top reasons for dissatisfaction", "Share of detractors"],
                    ["Maintenance works without notice (noise, water shut-offs, lifts out of service)", "41%"],
                    ["Slow response to repair requests", "27%"],
                    ["No updates on the progress of repairs", "19%"],
                    ["Food and activities", "13%"],
                ]),
                ("p", "Families said the problem was less the works themselves than being surprised by them: 'We only "
                      "found out the water would be off when Mother called us upset.'"),
            ],
            [
                ("h", "2. Actions"),
                ("ul", [
                    "Maintenance communication protocol: 72 hours' notice of any works affecting residents, through "
                    "the family app, noticeboards and a text message, with daily updates during multi-day works.",
                    "Single point of contact: a resident-experience coordinator owns every open repair request and "
                    "gives updates.",
                    "Quiet hours: noisy works only between 10 am and 4 pm, avoiding rest times and meals.",
                    "A contractor code of conduct for working in residents' spaces.",
                    "A digital feedback kiosk in the lobby and in-app feedback for families, reviewed weekly.",
                ]),
                ("h", "3. Results after two quarters"),
                ("table", [
                    ["KPI", "Before", "After"],
                    ["Net Promoter Score", "+12", "+26"],
                    ["Complaints about maintenance works (per quarter)", "38", "17"],
                    ["Average time to update on a repair (days)", "3.2", "1.0"],
                ]),
                ("h", "4. Lessons learned"),
                ("ul", [
                    "How you communicate about works matters as much as the works themselves.",
                    "Predictability builds trust: residents and families accept disruption they can plan for.",
                    "Give frontline staff the authority to fix small issues on the spot.",
                ]),
            ],
        ],
    },
    {
        "id": "SL-05",
        "filename": "SGSL_Power_Outage_Emergency_Review.pdf",
        "title": "Power Outage & Emergency Preparedness Review",
        "asset_type": "Senior Living", "asset_name": "Sakura Gardens Senior Living", "location": "Osaka, Japan",
        "category": "Emergency Preparedness", "classification": "Operational",
        "author": "Facilities & Safety Team, Sakura Gardens", "doc_date": "2025-11",
        "problem": "A typhoon power outage stopped lifts and oxygen concentrators, and the standby generator failed "
                   "its first start",
        "solution": "Monthly on-load generator tests with starter-battery monitoring, UPS for critical medical "
                    "devices, lift automatic rescue devices and night-shift evacuation drills",
        "impact": "12 of 12 monthly generator tests started first time; all oxygen-dependent residents now on "
                  "UPS-backed supply",
        "pages": [
            [
                ("h", "1. Event summary"),
                ("p", "On 16 September 2025 a typhoon caused a grid power outage lasting 3 hours 20 minutes. The "
                      "standby generator failed to start automatically because its starter battery was flat; it had "
                      "last been tested four months earlier, without load. Staff started it manually after 26 "
                      "minutes. During that gap two lifts stopped, trapping a resident and a carer for 35 minutes; "
                      "nine residents using oxygen concentrators were switched to oxygen cylinders by nurses; and room "
                      "temperatures rose to 31°C because the air-conditioning was off. Emergency lighting worked as "
                      "designed."),
                ("h", "2. Root causes"),
                ("ul", [
                    "Generator tests were quarterly and off-load, so they did not prove the set could take load, and "
                    "nobody monitored the starter battery.",
                    "The generator alarm panel was not connected to any remote monitoring.",
                    "Critical medical devices had no uninterruptible power supply (UPS).",
                    "Lifts had no automatic rescue devices to reach the nearest floor on power loss.",
                    "The evacuation plan assumed day-shift staffing levels.",
                ]),
            ],
            [
                ("h", "3. Actions"),
                ("ul", [
                    "Monthly on-load generator test (one hour at 50% or more load) with automatic starter-battery "
                    "monitoring and alarms.",
                    "Generator and fuel alarms connected to a 24/7 remote monitoring service.",
                    "UPS for oxygen concentrators, the nurse-call system and medication refrigerators.",
                    "Automatic rescue devices fitted to all lifts, bringing the car to the nearest floor and opening "
                    "the doors on power loss.",
                    "Night-shift evacuation drills and a register of residents who need assistance.",
                ]),
                ("h", "4. Results (12 months)"),
                ("p", "The generator started at the first attempt in 12 out of 12 monthly on-load tests. All nine "
                      "oxygen-dependent residents are on a UPS-backed supply, and every night shift has completed an "
                      "evacuation drill."),
                ("h", "5. Lessons learned"),
                ("ul", [
                    "Test like you mean it: an off-load test proves little. Test under real load and monitor the parts "
                    "that fail silently, such as starter batteries.",
                    "Protect the people most at risk first: map every life-critical device and make sure it has backup "
                    "power.",
                    "Plan for the worst shift, not the average one.",
                ]),
            ],
        ],
    },
    {
        "id": "SL-06",
        "filename": "SL_Utilities_Sustainability_Investment_Plan.pdf",
        "title": "Utilities Cost Reduction & Sustainability Investment Plan",
        "asset_type": "Senior Living", "asset_name": "Senior Living Portfolio", "location": "Singapore & Japan",
        "category": "Financial Performance", "classification": "Financial",
        "author": "Senior Living Asset Management", "doc_date": "2026-04",
        "problem": "Utilities rose to 18% of operating costs, squeezing margins across the senior-living portfolio",
        "solution": "Phased investment in chiller plant optimisation, heat-pump hot water, LED lighting and rooftop "
                    "solar through a PPA",
        "impact": "S$1.35M programme delivering S$290k annual savings; 4.7-year blended payback",
        "pages": [
            [
                ("h", "1. Context"),
                ("p", "Utilities cost the senior-living portfolio S$1.6 million a year, 18% of operating costs, up from "
                      "13% three years ago. Air-conditioning running around the clock, hot water and lifts are the "
                      "main drivers. Residents' fees cannot absorb further increases without affecting occupancy, and "
                      "investors expect a credible decarbonisation plan."),
                ("h", "2. Investment options"),
                ("table", [
                    ["Measure", "Capex (S$)", "Annual saving (S$)", "Payback (years)"],
                    ["Chiller plant optimisation and metering (Harmony)", "420,000", "110,000", "3.8"],
                    ["Heat-pump hot water (both properties)", "260,000", "62,000", "4.2"],
                    ["LED lighting and occupancy sensors", "150,000", "38,000", "3.9"],
                    ["Smart fan coil controls with comfort bands", "520,000", "35,000", "14.9"],
                    ["Rooftop solar through a PPA (no capex)", "0", "45,000", "n/a"],
                    ["Total", "1,350,000", "290,000", "4.7 (blended)"],
                ]),
            ],
            [
                ("h", "3. Recommendation"),
                ("ul", [
                    "Phase 1 (FY2026): chiller plant optimisation and metering, plus LED lighting - the fastest "
                    "paybacks.",
                    "Phase 2 (FY2027): heat-pump hot water and the rooftop solar PPA.",
                    "Defer smart fan coil controls: at a 14.9-year payback they should be combined with the next room "
                    "refurbishment cycle.",
                ]),
                ("h", "4. Risks"),
                ("ul", [
                    "Execution risk: the senior-living team has limited engineering capacity and no experience of "
                    "plant optimisation projects.",
                    "Resident disruption: works must follow the resident communication protocol.",
                    "Tariff uncertainty moves savings in both directions.",
                ]),
            ],
        ],
    },
]

# Tacit knowledge captured through the in-app "Capture expert lesson" workflow (no PDF).
EXPERT_LESSONS = [
    {
        "id": "LES-01",
        "source_type": "expert_lesson",
        "title": "Expert debrief: running chilled-water plants - rules of thumb from a retiring chief engineer",
        "asset_type": "Office", "asset_name": "Keppel Bay Tower", "location": "Singapore",
        "category": "Expert Knowledge", "classification": "Operational",
        "author": "Chief Engineer (retiring), Office Portfolio - captured by the Knowledge Steward",
        "doc_date": "2026-06",
        "submitted_by": "sarah.lim",
        "problem": "Decades of chilled-water plant know-how at risk of leaving with a retiring chief engineer",
        "solution": "Structured debrief capturing practical rules for chiller staging, sensor checks, surge "
                    "avoidance and wet-season dehumidification",
        "impact": "Tacit plant-operation knowledge preserved as reusable, citable guidance",
        "pages": [
            "Expert lesson: running chilled-water plants - rules of thumb from a retiring chief engineer. "
            "Contributor: Chief Engineer, Office Portfolio (32 years of plant experience), interviewed by the "
            "Knowledge Steward before retirement.\n"
            "1. Trust, but verify, your sensors. Once a month, check the chilled-water supply and return sensors "
            "against a calibrated handheld probe. A 0.3°C error in the temperature difference throws the load "
            "calculation off by more than 5%, and every optimisation decision after that is wrong.\n"
            "2. Run fewer chillers, more loaded. Most centrifugal chillers are most efficient between 50% and 90% "
            "load; two chillers at 80% beat three at 55%.\n"
            "3. Surge is a warning. If a chiller surges at low load, the condenser water is usually too warm or the "
            "chiller too lightly loaded. Stage down or lower the condenser-water temperature; do not just reset the "
            "alarm.\n"
            "4. Mind the wet season. During the north-east monsoon, humid air overwhelms dehumidification if the "
            "chilled-water supply temperature is set too high. Watch the space dew point, not only the temperature.\n"
            "5. Keep the condenser tubes clean. A rising approach temperature is the earliest sign of fouling; "
            "brushing the tubes early is cheaper than losing efficiency all year.\n"
            "6. Never test failover on a Friday afternoon. Do it early in the week, with the vendor on call.\n"
            "7. Write it down. Any rule that lives only in an operator's head will be lost at the next shift change."
        ],
    },
    {
        "id": "LES-02",
        "source_type": "expert_lesson",
        "title": "Expert debrief: planning maintenance works around residents' daily routines",
        "asset_type": "Senior Living", "asset_name": "Harmony Senior Residences", "location": "Singapore",
        "category": "Expert Knowledge", "classification": "Operational",
        "author": "Director of Nursing, Harmony Senior Residences - captured by the Knowledge Steward",
        "doc_date": "2026-08",
        "submitted_by": "sarah.lim",
        "problem": "Maintenance works repeatedly disrupted the meals, rest and medical routines of elderly residents",
        "solution": "Plan works around care routines: schedule against the care calendar, brief nurses first, treat "
                    "shutdowns as clinical risks and always keep a way back",
        "impact": "Fewer distressed residents and family complaints during maintenance works",
        "pages": [
            "Expert lesson: planning maintenance works around residents' daily routines. Contributor: Director of "
            "Nursing, Harmony Senior Residences (18 years in aged care), captured during a knowledge debrief.\n"
            "1. Plan works against the care calendar, not the contractor's calendar. Meals, medication rounds, "
            "afternoon rest and therapy sessions are fixed points; noisy or disruptive works must avoid them.\n"
            "2. Brief the nurses before the residents. Care staff are the people residents trust, and they know who "
            "will be anxious, who is on oxygen and who cannot use the stairs.\n"
            "3. Treat water, power and lift shutdowns as clinical risks. Check the list of residents who depend on "
            "them and have a fallback ready - bottled water, portable oxygen, a buddy for residents on upper floors - "
            "before starting.\n"
            "4. Always keep a way back. If the work overruns, the essential service must be restored before the "
            "evening medication round and dinner.\n"
            "5. Tell families what residents will tell them. A short message to families before works prevents "
            "worried phone calls afterwards.\n"
            "6. After every major work, ask two residents and one nurse what went wrong. The answers are usually "
            "simple and cheap to fix."
        ],
    },
]
