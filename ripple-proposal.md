# Ripple: working proposal

Internal team document, v3.1, 12 October 2026. Replaces `RIPPLE_CONTEXT_v2`.
Event: Google Cloud AI Builder Cup 2026, theme "Manufacturing: Intelligent Operations & Industrial Efficiency".
Readers: the four of us. Parts of this will move into the deck, the README and the video script later, so it is written in English.

Each section starts with an "In short" line. Read only those lines and you get the whole argument in under two minutes.

What changed since v2:

- Ripple no longer chases vendors or the warehouse by message. Readiness is a checklist people tick, ranked against the latest schedule, and Ripple proposes updates from documents the planner pastes in. This follows Kafi's input that the real work is setting logistics priorities, not sending chats.
- The scope is any schedule change, sorted into three types: request, disruption and opportunity.
- OR-Tools CP-SAT replaces the planned heuristics and TOPSIS for finding options. Gemini still weighs the qualitative factors.
- The problem is framed as a class that exists in many industries, with offshore well intervention as the anchor case.

What changed in v3.1 (after two rounds of team review, 12 Oct):

- Gemini's role is stated more precisely. It does not invent strategies an optimizer could not find. It frames the problem: from what people wrote, it decides which assumptions are fixed and which are negotiable, opens levers one at a time, and reads the results before choosing the next step (5.4, 7.3).
- An action registry sets which levers company policy allows and who must approve them. Gemini can close an allowed lever for a given case but can never open a forbidden one (7.4).
- Qualitative risks and uncertain ETAs now have defined mechanics in the engine (7.5).
- Planners can reject with a reason or reply in plain language, and the agent replans (6.5, 7.3).
- Readiness data carries its source and last update, and stale data lowers confidence (7.6).
- The ablation compares three set-ups, including an optimizer with every lever open and an optimizer fed by a human-filled form (8.4).
- Wording: "best feasible plan found" instead of "optimal"; cost figures are model estimates for a seeded scenario, not measured savings.
- Scope is cut to the core loop (9.1).

## Contents

Part I. Why
1. Executive summary
2. Context
3. Problem
4. Goals and requirements

Part II. What
5. Options and selection
6. Proposed solution

Part III. How
7. Architecture
8. Validation

Part IV. Next
9. Scope and team plan
10. Risks and mitigations
11. Scalability and roadmap

Appendices: glossary, assumptions, demo scenarios, traceability to judging criteria, open questions.

---

# Part I. Why

## 1. Executive summary

> In short: Ripple is a Gemini agent that turns messy schedule changes into verified plans a planner can approve in minutes.

**Situation.** Many operations run on schedules where several jobs compete for the same scarce assets. In offshore oil and gas, one well intervention needs a rig or barge, deck space on a supply boat, a safe weather window, and a pump that has passed its function test.

**Complication.** These schedules change every week. Requests and bad news arrive through WhatsApp groups and email, written in loose language. The planner then traces the knock-on effects by hand across jobs, vessels, equipment readiness and weather. This can take hours, and mistakes show up late, for example when a barge is on location waiting for a pump that has not been tested.

**Question.** How can a planner judge a change quickly, see everything it touches, and still own the decision?

**Answer.** The planner pastes the message into Ripple. Gemini works out what kind of change it is and which levers are realistic in this case, such as asking the vendor to test earlier or moving cargo to another boat, within what company policy allows. It opens those levers one at a time and checks each result with a deterministic engine and the OR-Tools CP-SAT solver, so Ripple cannot recommend a plan that breaks a modelled constraint. The planner approves one option. Ripple then updates the schedule, re-ranks the logistics checklist and drafts the messages to the vendor and the warehouse.

We build on offshore well intervention because it is the hardest version of this problem and because one of us works in that field. The core model is domain neutral. A plant turnaround scenario will run on the same engine to show it.

## 2. Context

> In short: Ripple targets a type of problem that exists in many industries; offshore operations are our anchor case because every part of the problem shows up there at full strength.

### 2.1 The problem class

We define the problem as:

> Managing changes to an operations schedule where jobs share scarce resources, depend on material readiness, and news of changes arrives as unstructured messages.

It has five parts:

| Part | What it means |
|---|---|
| Jobs | Units of work with a start date and a duration |
| Shared resources | Limited assets that several jobs compete for |
| Readiness chain | Steps that materials or equipment must finish before the job can start |
| External disruptions | Weather, late suppliers, breakdowns, new findings |
| Messy communication | Requests and updates arrive by chat, email, phone and PDF |

### 2.2 Anchor case: offshore well intervention

A short primer for readers outside oil and gas. Offshore wells sit on platforms at sea. Many of them use an electric submersible pump (ESP) to lift oil. When an ESP fails or degrades, a crew has to pull it and install a new one. That job needs a rig or a barge with lifting equipment on location. The replacement pump goes from the vendor to a shorebase, then out to the platform on a supply boat. Before it ships it must pass a function test. Wave height decides whether boats can sail and cranes can lift.

Initial planning, such as choosing candidate wells and building the first schedule, is largely handled by standard optimization. The hard part is execution. Production, operations, maintenance and vendors can ask for changes at any time, often without anyone seeing what the change costs in lost production. "Waiting on equipment" shows up again and again as a category of non-productive time (NPT).

Why we anchor here:

- Errors are expensive. A barge waiting on location costs a day rate, and a well producing below potential loses oil every day it waits.
- All five parts of the problem appear, weather included.
- We know the workflow from the inside. One team member works in an artificial lift team at an upstream operator, so the scenarios and constraints come from real practice, with all data made up.

### 2.3 The same pattern in other industries

| Part | Offshore well intervention | Plant turnaround | Building construction |
|---|---|---|---|
| Job | Replace ESP in well A-12 | Replace a heat exchanger | Pour the 5th floor slab |
| Shared resource | Barge, supply boat deck | Crane, scaffolding crew | Tower crane |
| Readiness chain | Pump test, paperwork, shorebase, loading | Spare part delivery, work permit | Rebar delivery, inspection |
| Disruption | High waves, late pump test | Late part, new corrosion finding | Rain, late concrete |

Section 11 covers how Ripple carries over to these domains and what each one adds.

## 3. Problem

> In short: The cost sits in the hours a planner spends tracing the effects of each change by hand, and in the errors that slip through when one effect is missed.

### 3.1 Who feels the pain

| Stakeholder | Pain today |
|---|---|
| Planner / scheduler | Gets change requests in chat, recalculates the schedule by hand, chases equipment status, then has to explain the decision upward |
| Production or operations engineer | Waits for an answer on whether an urgent well can move earlier while the well keeps underperforming |
| Logistics and warehouse | Hears about changes late and reshuffles loading lists in a rush |
| Vendors | Receive late and sometimes conflicting requests to speed up or slow down |
| Management | Sees the decision but not the reasoning or the cost behind it |

### 3.2 How it works today (as-is)

1. A change arrives. Someone writes in a WhatsApp group: "A-12 production dropped, can we move it to this week?"
2. The planner opens the schedule spreadsheet, then messages the warehouse and the vendor to find out where the pump is and whether it has been tested.
3. The planner works out which other jobs would move, whether the supply boat has deck space, and whether the weather allows it.
4. The planner proposes something, discusses it in a meeting or a chat thread, and decides.
5. The planner updates the spreadsheet and messages each party one by one.
6. Nobody writes down why. The next similar case starts from zero.

Steps 2 and 3 take most of the time, and step 6 means the organisation never learns from past decisions.

Some operators already run an internal schedule web app that collects each division's needs and flags capacity conflicts. It stops at detection: it does not recommend an option or show the cost of a change. Ripple is meant to sit on top of that kind of tool as a judgment layer, not to replace it.

### 3.3 Breaking the problem down

The first two levels of the tree are domain neutral. The examples come from the offshore case.

**What triggered the change (nature)**

- Request: someone wants the schedule changed, for example pulling A-12 forward because production dropped. The answer can be no.
- Disruption: something has already happened, such as a delayed pump test or high waves. It cannot be refused. The plan has to adapt.
- Opportunity: something got better, such as a pump that is ready four days early. The plan can take advantage of it.

**What the change touches (impact)**

- Schedule: other jobs that have to shift.
- Shared resources: barge time, supply boat deck space, crane, crew.
- Readiness: which items now need to be ready earlier, and whether they can be.
- Production: barrels deferred or recovered.
- Communication: who needs to hear what, and by when.

**Why it happens (cause), mapped to constraint types**

| Cause | Constraint type | In the prototype? |
|---|---|---|
| Equipment or material not ready | Readiness | Yes |
| Asset already booked or full | Resource capacity | Yes |
| Weather | Weather window | Yes |
| One job matters more than another | Priority | Yes, as a number per job |
| Job order, permits | Dependencies | Roadmap |

### 3.4 Root cause (5 whys)

1. Why do schedule changes take long and go wrong? Because the planner works out the impact by hand.
2. Why by hand? Because the schedule, equipment status, boat capacity and weather live in different places: spreadsheets, chat threads and vendor emails.
3. Why can't a tool combine them? Because the information that matters most arrives as free text, and scheduling tools only accept structured data.
4. Why does the free text matter so much? Because it carries context that changes the answer, such as "don't touch B-05, the client is inspecting it", and that context never reaches a form.
5. Why not run an optimizer? Because someone first has to translate that context into constraints and priorities, and today only the planner can do that translation.

Root cause: the slow part is turning messy, contextual change information into a precise problem and then checking every consequence. Planners do both by hand.

### 3.5 What it costs

We have not measured this in a real operation. The numbers below are desk estimates from public sources and the team's own experience. Replace them if a planner gives us better ones.

```
Cost of a mishandled change =
    idle days of rig or barge   x  day rate
  + days a well returns late    x  production shortfall (bbl/day)  x  netback ($/bbl)
  + planner hours per change    x  hourly cost
```

| Input | Estimate (range) | Basis |
|---|---|---|
| Barge or liftboat day rate | USD 30,000 (20,000 to 40,000) | Gulf Marine Services reported a liftboat fleet average of USD 36,000/day for 9M 2025. Indonesian workover barges are likely cheaper, so we use a lower midpoint |
| Value of a barrel | USD 95 gross (80 to 105) | Brent closed at USD 100.58 on 6 Oct 2026; EIA expects about USD 98 average for 2026 and USD 84 for 2027. Gross value, before the PSC split |
| Shortfall of a degraded ESP well | 150 bbl/day (50 to 300) | Team estimate for mature offshore wells. The A-12 scenario uses 250 bbl/day |
| ESP replacement duration with a rig | About 7 days | SLB case study: a conventional workover rig needed at least 7 days |
| Planner time per change | 3 hours (2 to 4) | Team estimate |
| Changes per month | 10 (8 to 15) | Team estimate |
| Changes per month that go wrong | 2 | Team estimate: 1 idle barge day plus 2 days of late well return each |
| Planner cost | About USD 20/hour loaded | Public Indonesian petroleum engineer salary data, rounded up |

What this gives us (order of magnitude, not a forecast):

| Item | Calculation | Result |
|---|---|---|
| One idle barge day | 1 x 30,000 | USD 30,000 |
| One day of late return, A-12 | 1 x 250 x 95 | USD 23,750 |
| A-12 pulled forward 4 days | 4 x 250 x 95 | about USD 95,000 recovered |
| One change that goes wrong | 30,000 + 2 x 150 x 95 | USD 58,500 |
| Per month (2 bad changes) | 2 x 58,500 | about USD 117,000, or roughly USD 1.4M a year |
| Planner time per month | 10 x 3 h x 20 | USD 600, plus 30 hours |

Two takeaways for the pitch. Planner time is cheap next to lost production, so the story is about barrels and idle vessels, not about saving the planner's salary. And a single avoided mistake (about USD 58,500) is worth more than the whole prototype costs to run for a year.

### 3.6 Problem statement

How might we help a planner turn a messy schedule change into a verified, explained plan within minutes, while the planner keeps the final decision?

## 4. Goals and requirements

> In short: A good solution reads messy input, never recommends an infeasible plan, explains itself and leaves the decision with a person. These requirements become the scoring criteria in section 5.

### 4.1 Goals and business metrics

These describe the value in real operations. Section 8 covers how we prove the prototype works, which is a different question.

| Goal | Metric | Target (to validate with planners) |
|---|---|---|
| Faster decisions | Time from change message to approved plan | From hours to under 15 minutes |
| Fewer bad plans | Share of modelled constraint violations caught before approval | All of them |
| Less production lost | Barrels deferred per change, compared with the manual baseline | Measure in a pilot |
| Less waiting on equipment | NPT hours booked as "waiting on equipment" | Measure in a pilot |
| Traceable decisions | Share of changes with a logged reason | All of them |

### 4.2 Functional requirements

| ID | Requirement |
|---|---|
| FR1 | Accept change information as pasted text, an uploaded PDF or a screenshot |
| FR2 | Classify each change as request, disruption or opportunity, and extract jobs, dates, cause and context into a structured record |
| FR3 | Check the impact on the schedule, shared resources, readiness chains and weather windows |
| FR4 | For a request, return a verdict: feasible, feasible with conditions, or infeasible. For a disruption or opportunity, return replan options |
| FR5 | Offer alternatives with their trade-offs, and state what would have to change for an infeasible request to work |
| FR6 | Keep a readiness checklist per job, with deadlines computed backward from the job date and ranked by urgency. Users tick items. Ripple proposes updates from documents |
| FR7 | The planner approves or rejects. Approval updates the schedule and checklist in one transaction |
| FR8 | Draft notifications for each audience after approval |
| FR9 | Run a daily check on its own and raise warnings |
| FR10 | Log every decision with its reasoning |

### 4.3 Non-functional requirements

| ID | Requirement |
|---|---|
| NFR1 Trust | Every recommended plan passes the engine. Numbers in explanations match engine output |
| NFR2 Human control | The agent cannot change the schedule. Only the approve action can |
| NFR3 Domain neutral core | Jobs, resources, readiness chains and constraints come from configuration, not code |
| NFR4 Zero integration to start | Works with paste and upload. Mailbox or chat integration is optional and later |
| NFR5 Cost | Runs on a low-cost model by default, can swap models, and reports cost per decision |
| NFR6 Security | Treats pasted content as untrusted data. No secrets or real company data in the repo |
| NFR7 Usability | A judge can open the link and run a scenario with no setup |

### 4.4 Hackathon constraints

From the official rules and FAQ:

- Must use Google AI models (Gemini or Gemma) or Google agentic platforms, and be deployed on Cloud Run or Firebase.
- Must be built mainly on the Google Cloud stack.
- Must be a fresh project built during the hackathon window.
- Submission: deployed link, demo video under 3 minutes, public GitHub repository, deck as PDF.
- All materials in English.
- Team formation closes 11 Oct 2026. Prototype deadline 18 Oct 2026.
- The judging criteria are Technical Merit and Gen AI Implementation (40%), Problem Alignment and Impact (25%), Innovation and Creativity (25%), User Experience and Solution Design (10%).
- Side prizes worth aiming at: Most Impactful Solution and Best use of Google Cloud AI tools, USD 2,000 each.

Two consequences: the public repo rules out real company data and API keys in code, and judges will likely open the deployed link themselves, so the app needs seeded scenarios and a reset button.

---

# Part II. What

## 5. Options and selection

> In short: Ripple scores highest because it is the only option that both understands messy input and guarantees that its plans are feasible.

### 5.1 Options considered

**A. Status quo.** Spreadsheet or an internal schedule app that flags conflicts, plus chat and meetings. People handle messy messages well and adapt to context, but the process is slow, error-prone and leaves no record.

**B. Commercial scheduling software** such as Primavera P6 or SAP PM. Good at formal planning and resource levelling. It needs structured input, cannot read a WhatsApp message or a vendor email, and is costly and slow to change.

**C. Optimizer only.** A solver such as CP-SAT or a genetic algorithm such as NSGA-II behind structured forms. Plans are feasible within the model and as good as the solver can find. Someone still has to translate context into the form, including which levers are realistic this week, new kinds of constraints need a developer, and the output is a schedule with no explanation.

**D. LLM chatbot only.** A Gemini assistant with access to the schedule that decides by itself. Flexible and pleasant to use. It can state that a plan works when it does not, and nothing checks it.

**E. Ripple.** A Gemini agent that decides what to check and proposes strategies, an engine and solver that verify every strategy, and a planner who approves.

### 5.2 Criteria and weights

The criteria come from section 4.

| ID | Criterion | Weight | From |
|---|---|---|---|
| C1 | Handles unstructured and ambiguous input | 20% | FR1, FR2 |
| C2 | Guarantees feasible plans | 20% | NFR1 |
| C3 | Explains decisions and trade-offs | 15% | FR5, FR10 |
| C4 | Adapts to new context case by case | 15% | FR2, FR5 |
| C5 | Speed from message to decision | 10% | Goal 1 |
| C6 | Cost and effort to adopt | 10% | NFR4, NFR5 |
| C7 | Auditability | 10% | FR10 |

### 5.3 Decision matrix

Scores run from 1 (poor) to 5 (strong).

| Option | C1 | C2 | C3 | C4 | C5 | C6 | C7 | Weighted |
|---|---|---|---|---|---|---|---|---|
| A. Status quo | 4 | 2 | 3 | 4 | 1 | 5 | 1 | 2.95 |
| B. Commercial scheduler | 1 | 4 | 2 | 2 | 3 | 2 | 4 | 2.50 |
| C. Optimizer only | 1 | 5 | 2 | 2 | 4 | 3 | 3 | 2.80 |
| D. LLM chatbot only | 5 | 1 | 3 | 4 | 5 | 4 | 2 | 3.35 |
| E. Ripple | 5 | 5 | 5 | 4 | 4 | 4 | 5 | 4.65 |

Notes on the scores:

- We scored our own idea, so treat these numbers as a starting position. A planner should rescore them before we quote them anywhere.
- Ripple gets a 5 on C2 only within the constraints the engine models. Anything outside the model is still the planner's call.
- Ripple gets a 4 on C4 because Gemini handles new context, but a new type of constraint still needs a config entry or engine code.

Sensitivity check: if we cut the feasibility weight (C2) to 10% and raise adoption cost (C6) to 20%, the totals become A 3.25, D 3.65 and E 4.55. Ripple still leads. The gap to D shrinks, so the case for Ripple rests on how much operations care about feasibility. Offshore teams care a lot, because an infeasible plan leaves a barge waiting on location.

### 5.4 Why the combination and not either half

Option C is right but blind to context. Option D understands context but can be wrong without knowing it.

A fair objection to Ripple: give CP-SAT every lever (move the test date, move cargo, move jobs, expedite anything) and it will find the D+5 plan on its own. That is true. It will also move B-05 while the client is inspecting it, expedite a test the vendor already said it cannot run, or expedite five items at once, because nothing in the database says those levers are off the table this week. That information sits in chat threads, vendor emails and the planner's head.

So the real question is which levers may be pulled, and that is the part Ripple gives to Gemini:

- **Policy (configuration).** The company's action registry says which levers exist and who must approve each one. This part is plain rules.
- **Situation (Gemini).** From the messages, Gemini decides which of the allowed levers are realistic in this case, which jobs are effectively locked, and what the person asking actually cares about. It opens levers one at a time, cheapest first, and chooses the next step from the previous result.
- **Verification (engine and solver).** CP-SAT finds the best feasible plan inside the levers that are open and reports what each plan requires.
- **Decision (planner).** Approves, rejects with a reason, or replies in plain language so the agent can replan.

Gemini can also suggest an action the model does not contain, such as borrowing a spare pump from another well. The engine cannot check whether that pump exists. It can only check the schedule assuming it does. Ripple therefore shows such options as "conditional, needs human confirmation" and never treats the premise as fact.

What we do not claim: that Gemini finds plans an optimizer could not find. We claim that Gemini does the framing work a planner does today by hand, and that the solver makes the result trustworthy.

The same generator and verifier pattern sits behind DeepMind's AlphaGeometry (a language model proposes, a symbolic engine checks) and AlphaEvolve (Gemini proposes algorithms, automated evaluators test them). It is also why coding agents work: compilers and tests check what the model writes.

## 6. Proposed solution

> In short: Gemini does the thinking a planner does, the engine does the checking, and the planner makes the call.

### 6.1 One-line pitch

Ripple turns messy operational changes into verified schedule decisions. Policy decides what is allowed, Gemini decides what is realistic from what people wrote, the solver finds the best feasible plan inside both, and the planner stays in control.

### 6.2 Walkthrough: the A-12 request

All numbers are illustrative and come from the seeded scenario. "D+n" means n days from today. In this scenario the action registry allows `expedite_vendor_test` and `move_cargo` with planner approval, and forbids moving locked jobs.

**Starting state**

| Job | Barge slot | Notes |
|---|---|---|
| C-03 | D+3 to D+4 | Low priority, 40 bbl/day shortfall |
| (free) | D+5 to D+6 | |
| B-05 | D+7 to D+8 | Client inspection, must not move |
| A-12 | D+9 to D+10 | ESP degraded, 250 bbl/day shortfall |

A-12 readiness chain (one day per step): function test, paperwork, transfer to shorebase, then loading and sailing. The pump reaches the vendor's test bay on D+1, and the vendor has booked the test for D+4. The pump is therefore on location D+7 at the earliest, which leaves two days of slack against D+9. The supply boat sailing on D+5 already has 85% of its deck booked.

**The message**

The production engineer writes in the team chat:

> "A-12 output dropped again, can we move it to this week, D+3 if possible? Don't touch B-05, the client is inspecting it."

The planner pastes it into Ripple.

**What the agent does** (the UI shows each step on a timeline)

1. Gemini classifies the message as a request and extracts: job A-12, target start D+3, hard constraint "B-05 fixed", objective "recover production".
2. `check_readiness(A-12, D+3)`: the pump cannot be on location before D+7 with the current test date. D+3 would need the test on D+0, but the pump only reaches the test bay on D+1. The request is infeasible as asked.
3. Gemini runs `optimize` with no levers open. Best start without changes: D+7 is taken by locked B-05, so A-12 stays on D+9. Nothing gained.
4. Gemini opens the cheapest realistic lever, `expedite_vendor_test` (allowed by policy, and nothing in the messages rules it out). With the test moved to D+2 the pump is on location D+5, and the free gap D+5 to D+6 becomes usable.
5. `check_capacity(supply boat, D+5 sailing, + A-12 pump package)`: the deck would be at 105%. Gemini opens a second lever, `move_cargo`. The solver moves chemical drums for job D-07 (needed on D+11) to the D+6 sailing. The D+5 deck drops to 90%.
6. `check_weather(D+5 to D+6)`: waves of 1.2 m against a 2.0 m limit. Go.
7. `simulate(full change set)`: no violations. In this seeded scenario A-12 starts four days earlier, which the model estimates at about 1,000 barrels recovered (4 days x 250 bbl/day).
8. Gemini writes the recommendation:

> "D+3 is not possible: the pump cannot be tested before D+1. A-12 can start on D+5 if the vendor moves the test from D+4 to D+2. That also means moving D-07's chemical drums to the D+6 boat. B-05 stays where it is. Expected gain: about 1,000 bbl. If the vendor cannot move the test, A-12 stays on D+9."

**The planner approves.** In one transaction Ripple:

- moves A-12 to D+5, marked "conditional on vendor test D+2",
- updates the checklist so the A-12 pump test goes to the top with a deadline of D+2, followed by paperwork (D+3), shorebase (D+4) and loading (D+5),
- moves the D-07 drums to the D+6 sailing,
- drafts an email to the vendor asking for the D+2 test slot, and a message to the warehouse with the new loading list,
- logs the decision with its reasoning.

**Same data, different message.** Now suppose the engineer's message ends with "FYI the vendor says the test bay is full until Thursday". The database and the solver are identical. Gemini closes the `expedite_vendor_test` lever for this case, tries `move_cargo` and a swap instead, finds nothing better than D+9 without breaking the B-05 lock, and says so: "A-12 cannot move earlier than D+9 this week. The only faster route is moving B-05, which you ruled out." The demo shows both runs side by side. One sentence in a chat message changes what the agent tries, and that is the part a fixed rule cannot do.

### 6.3 The three event types in the product

| Nature | What Ripple returns | Demo example |
|---|---|---|
| Request | Verdict, alternatives, and what it would take | A-12 pulled forward (above) |
| Disruption | Replan options ranked by impact | Vendor email says the D-07 pump test slips three days; a forecast update with high waves |
| Opportunity | Suggestion to pull a job forward | The E-02 pump passes its test four days early and a barge gap is open |

A disruption can arrive as a pasted vendor email. Gemini reads it, proposes the checklist update (for example "D-07 test ETA D+6 to D+9, medium confidence"), flags risk notes such as "seal finding during test", and then runs the same impact check as for a request.

### 6.4 Who does what

| Action registry (policy) | Gemini (situation) | Engine and solver | Planner |
|---|---|---|---|
| Lists the levers that exist | Reads messages, PDFs and screenshots | Computes readiness deadlines backward from job dates | Approves, rejects with a reason, or replies in plain language |
| Says which are allowed and who approves them | Classifies the event and extracts a structured record | Checks capacity, weather windows and locked jobs | Confirms conditions outside the model (a spare pump, a vendor promise) |
| Is set by the company, not by the model | Decides which allowed levers are realistic this time, and in what order to open them | Finds the best feasible plan inside the open levers (CP-SAT) | Ticks checklist items |
| | Tags qualitative risks from a fixed list, with the source sentence | Applies fixed rules for risk tags, ETA ranges and stale data | Sends the drafted messages |
| | Compares the feasible options and explains them to each audience | Validates the plan again at approval time | |

### 6.5 Design principles

1. Gemini proposes, the engine verifies, the planner approves.
2. Gemini never does arithmetic. Every number in an explanation comes from a tool result.
3. Show the work. The reasoning timeline is part of the product.
4. Degrade gracefully. If the model fails, the planner still sees the engine's result in plain form.
5. Keep state in the database. The schedule lives in Postgres, never in a chat transcript.
6. Feasible is different from advisable. The solver decides what is possible. Gemini argues for what is wise, and says so when its evidence is thin.
7. Policy beats the model. Gemini can close a lever the registry allows. It can never open one the registry forbids.
8. Conditions are not facts. Anything outside the model, such as a vendor promise or a spare pump, is shown as a condition the planner must confirm.
9. Disagreement is input. A rejection needs a reason, and a plain-language reply from the planner goes back to the agent as new context for a replan.

### 6.6 What the user sees

- **Schedule view.** A Gantt-style chart per resource (barge, supply boat sailings), with conflicts highlighted.
- **Readiness board.** Checklist items for all jobs, sorted by deadline and slack, with tick boxes and Ripple's proposed updates waiting for confirmation.
- **Agent panel.** A box to paste text or drop a file, the live reasoning timeline (which levers were opened and why), option cards with trade-offs and conditions, approve and reject buttons, and a reply box for pushing back in plain language.

### 6.7 What is new here

Most agents today let the model decide and trust the result. Ripple differs in four ways:

- It cannot call a plan feasible unless the engine agrees, and it cannot use a lever company policy forbids.
- Gemini frames the optimization problem from people's own words: which jobs are effectively locked, which levers are realistic this week, what matters most to the person asking.
- It negotiates. When the answer is no, it opens levers one at a time and says what would make it yes, and which of those conditions a person has to confirm.
- It treats a vendor's "probably end of next week" as a date range with a confidence level, and plans on the late end.

Section 5 shows how this compares with the alternatives. Section 8 shows how we will prove it.

---

# Part III. How

## 7. Architecture

> In short: One Cloud Run service hosts the API, the agent and the engine. Postgres holds all state. Gemini on Vertex AI does the language work and OR-Tools does the maths.

### 7.1 Overview

```
Browser
  |
Firebase Hosting (React app)
  |   rewrite /api/** to Cloud Run (same domain, no CORS)
  v
Cloud Run: FastAPI service
  |-- /agent/run          ADK agent, streams steps to the UI over SSE
  |       |-- Gemini on Vertex AI (service account, no API key)
  |       '-- tools/  thin wrappers around the engine
  |-- engine/              pure Python: deadlines, conflicts, simulation
  |       '-- OR-Tools CP-SAT
  |-- /plans/{id}/approve  re-validates, then applies in one SQL transaction
  |-- /schedule, /readiness, /events   read endpoints for the UI
  '-- /demo/reset          restores seeded scenarios
  |
Cloud SQL for PostgreSQL  (app data + ADK sessions)

Cloud Scheduler  -->  /agent/daily-check  (proactive run every morning)
Cloud Logging + Cloud Trace  (structured logs, agent and tool spans)
Secret Manager  (database credentials)
```

### 7.2 Components

| Component | Technology | Responsibility |
|---|---|---|
| Frontend | React + TypeScript, built with Vite, on Firebase Hosting | Schedule view, readiness board, agent panel |
| API | FastAPI, Python 3.12, on Cloud Run | HTTP and SSE endpoints, approval transaction |
| Agent | Google Agent Development Kit (ADK, Python) | Tool-calling loop, session state |
| Model | Gemini on Vertex AI | Classification, extraction, strategy, explanation |
| Engine | Plain Python, covered by pytest | Readiness deadlines, capacity checks, simulation |
| Solver | Google OR-Tools CP-SAT | Best feasible schedule within the open levers |
| Database | Cloud SQL for PostgreSQL, created through the Firebase Data Connect no-cost trial | All app data, accessed with SQLAlchemy and the Cloud SQL Python Connector |
| Agent sessions | ADK `DatabaseSessionService` on the same Postgres | Keeps sessions alive across Cloud Run instances |
| Proactive runs | Cloud Scheduler with OIDC auth | Calls the daily check endpoint |
| Observability | Cloud Logging, Cloud Trace | Debugging, plus trace screenshots for the deck |
| Secrets | Secret Manager | Database password |
| CI/CD (optional) | Cloud Build, Artifact Registry | Deploy on push to main |

Notes:

- The Data Connect trial gives one free Postgres instance per project for about three months, enough to cover the 4 Dec finale. We connect to it directly and do not need Data Connect's GraphQL layer. Changing the instance configuration ends the trial and starts billing, so nobody touches it after setup.
- Set Cloud Run `min-instances=1` during judging so the first visitor does not hit a cold start.
- Frontend: Vite rather than Next.js. FastAPI is already our server, so Next's server features (SSR, API routes) would add a second server and split the logic. Vite builds static files that Firebase Hosting serves directly, while Next on Firebase needs App Hosting and more setup. This is an internal dashboard, so SSR and SEO do not matter.
- Frontend and backend stay in sync in four ways. Pydantic models are the single source of truth, and `openapi-typescript` generates TypeScript types from FastAPI's OpenAPI schema, so a renamed field breaks the frontend build instead of the demo. The Vite dev proxy sends `/api` to `localhost:8000`, matching the Firebase rewrite in production, so the code always calls relative `/api/...` paths with no CORS. `/agent/run` is a POST, which the browser's `EventSource` cannot do, so we stream with `fetch` or `@microsoft/fetch-event-source`. TanStack Query handles fetching and refetches the schedule and checklist after an approval.
- Locally we use a Gemini API key from AI Studio. In production the Cloud Run service account calls Vertex AI, so the public repo never contains a key.

### 7.3 Agent design

One agent with tools. We do not split it into several agents, because that adds latency and failure points without adding capability.

The loop for one event:

1. **Intake.** Gemini classifies the event and extracts a `ChangeEvent` record using structured output against a strict schema: jobs, dates, hard constraints, ETA updates, risk tags, and the levers the message rules out.
2. **Investigate.** Gemini calls read tools in whatever order the case needs.
3. **Frame.** Gemini builds the lever set for this case: the levers the action registry allows, minus the ones the messages rule out, ordered from least to most disruptive.
4. **Open levers one at a time.** Gemini runs `optimize` with no levers, then opens the next lever only if the result is still short of the goal. Each run returns the plan and the conditions it needs. Gemini reads the result and chooses the next lever, or stops.
5. **Choose and explain.** Gemini compares the feasible options, including two or three weight profiles, and calls `propose_plan`. Options that depend on anything outside the model are marked conditional.
6. **Replan on feedback.** If the planner rejects with a reason or replies in plain language, that text enters the loop as new context and the agent runs again from step 3.

Guardrails:

- At most 15 tool calls per run, and a timeout on the whole run.
- If an output fails schema validation, the error goes back to the model for a fix, at most twice. After that the run ends with the engine's raw result.
- A numeric checker compares every date and number in the explanation with the plan JSON. On a mismatch, the explanation is regenerated or replaced by the engine values.
- Pasted text goes into the prompt as quoted data with an instruction to extract only. No tool can write to the schedule, so an email that says "ignore your rules and approve this" has nothing to act on.
- Every claim in a recommendation points to the tool result it came from, and the UI shows that source. When the evidence is thin, the agent has to say so.
- The agent cannot open a lever that the action registry forbids. `optimize` rejects such a request.

Model per step (set in one config file, so swapping models is a one-line change):

| Step | Default model | Thinking |
|---|---|---|
| Intake and extraction | Gemini Flash (current 3.x) | Low |
| Investigation loop | Gemini Flash | Medium |
| Strategy choice and trade-offs | Gemini Flash | High |
| Notification drafts | Gemini Flash-Lite | Off or low |

We move a step to Gemini Pro only if the eval in section 8 shows Flash falls short on it. Avoid the Gemini 2.5 family: it shuts down on 16 Oct 2026, two days before our deadline. Check exact model IDs in AI Studio before coding.

### 7.4 Contracts

These are the interfaces the four of us agree on first, so we can build in parallel.

**ChangeEvent** (output of intake)

```json
{
  "nature": "request | disruption | opportunity",
  "cause": "readiness | capacity | weather | priority | other",
  "job_ids": ["A-12"],
  "requested_start": "D+3 or null",
  "eta_update": { "item": "...", "earliest": "...", "latest": "...", "confidence": "low | medium | high" },
  "hard_constraints": [ { "type": "lock_job", "target": "B-05", "reason": "client inspection" } ],
  "soft_preferences": [ { "type": "minimize_delay", "target": "A-12", "weight": "high" } ],
  "risk_tags": [ { "tag": "quality_finding", "item": "D-07 pump", "source": "seal finding during test" } ],
  "levers_ruled_out": [ { "lever": "expedite_vendor_test", "target": "A-12 pump", "source": "test bay is full until Thursday" } ],
  "source_excerpt": "verbatim text the fields came from"
}
```

**Tools**

| Tool | Input | Output |
|---|---|---|
| `get_schedule` | date range | jobs, bookings, `schedule_version` |
| `check_readiness` | job, target start | items with ETA, `required_by` and slack; earliest feasible start |
| `check_capacity` | resource, date, added load | used, capacity, overflow |
| `check_weather` | location, date range | per day: wave height, go or no-go |
| `simulate` | change set | violations, KPI deltas (deferred bbl, jobs moved, minimum slack) |
| `optimize` | open levers, hard constraints, weight profile | status (`optimal` or `feasible`), change set, conditions, objective value, solve time |
| `what_would_it_take` | job, target start | the smallest set of relaxations that makes the target feasible |
| `propose_plan` | event, options, recommended option, explanation | `plan_id` with status `proposed` |
| `draft_notifications` | plan, audiences | message drafts |
| `search_decisions` (optional) | text | similar past decisions with their reasons |

**Action registry** (part of the domain pack, set by the company):

```yaml
levers:
  expedite_vendor_test: { allowed: true,  approval: planner, cost_weight: 2 }
  move_cargo:           { allowed: true,  approval: planner, cost_weight: 1 }
  swap_jobs:            { allowed: true,  approval: planner, cost_weight: 3 }
  move_locked_job:      { allowed: false }
  add_vessel:           { allowed: false }
```

Approval is not a tool. `POST /plans/{id}/approve` re-runs `simulate` and compares `schedule_version` with the version the plan was built on. If the schedule changed in between, the endpoint refuses and the agent recomputes.

**SSE events to the UI**: `step`, `tool_call`, `tool_result`, `plan`, `error`, `done`.

### 7.5 Optimization model

Problem size for the prototype: 10 to 30 jobs over a 14 to 30 day horizon. CP-SAT should solve this in well under a second. We will confirm with a timing test.

- Variables: start day per job; one interval per job on its rig or barge; a boolean per cargo item per sailing; for each open lever, the adjustable inputs it unlocks (for example the test date of one pump).
- Hard constraints: no overlap on single-capacity resources; job start no earlier than the readiness earliest date; no marine operations on no-go weather days; deck load per sailing within capacity; locked jobs fixed; closed levers keep their inputs fixed.
- Objective: minimize the sum of (production shortfall x days of delay), plus the registry `cost_weight` for each lever used, plus a penalty per job moved. The weight profile (production first, stability first, lowest risk) comes from the company's default; the planner can switch it. Gemini does not set weights.
- Result wording: CP-SAT reports `optimal` when it proves optimality within the 2-second limit and `feasible` otherwise. The UI says "best feasible plan found" unless the status is `optimal`.
- Trade-off options: solve two or three times with different weight profiles and show them side by side. Gemini compares them in words. This gives the trade-off view a multi-objective method like NSGA-II would, while staying deterministic and feasible.
- Counterfactual (`what_would_it_take`): treat the inputs behind every allowed lever as adjustable at their registry cost, and minimize the total adjustment needed to hit the target.

**Qualitative risks.** Gemini does not score risk. It tags it from a fixed list and must quote the sentence it came from. The engine applies a fixed rule per tag:

| Tag | Engine rule |
|---|---|
| `quality_finding` (e.g. "seal finding during test") | Add 1 day of buffer to the item and set its confidence to low |
| `vendor_history_late` | Plan on `eta_latest`, and flag any option that needs this vendor to expedite |
| `client_commitment` (e.g. "client inspection") | Lock the job (hard constraint) |
| `other` | No effect on the plan. Shown to the planner as a note |

**Uncertain ETAs.** Feasibility always uses `eta_latest`. When confidence is low, the engine adds one more day of buffer. An option that only works if the vendor hits `eta_earliest` is shown as "feasible if the vendor is on time" and is never the recommended option.

**Stale data.** Every readiness item has a `source` and `last_updated`. Items older than 48 hours (configurable) count as low confidence and the explanation names them, for example "pump status last updated 3 days ago, confirm with the vendor before approving".

### 7.6 Data model (Postgres)

| Table | Main columns |
|---|---|
| `jobs` | id, site, job_type, start_day, duration_days, shortfall_bopd, locked, status |
| `resources` | id, type (barge, supply_boat, crane), name, capacity, unit |
| `bookings` | job_id or cargo_id, resource_id, start_day, end_day, load |
| `readiness_items` | id, job_id, step_order, name, lead_time_days, eta_earliest, eta_latest, eta_confidence, status, source, last_updated, source_event_id |
| `cargo_items` | id, job_id, description, deck_units, needed_by_day |
| `weather_forecast` | location, day, wave_height_m, go |
| `events` | id, nature, cause, raw_text, extracted_json, created_at |
| `plans` | id, event_id, options_json, recommended, base_schedule_version, status |
| `decisions` | id, plan_id, action (approve, reject, reply), actor, reason, created_at |
| `schedule_state` | one row: current schedule_version |

The engine computes `required_by` for each readiness item from the job date and lead times. We never store it, so it cannot drift from the schedule.

Days are stored as integers relative to a scenario start date. That keeps the demo scenarios stable no matter what day a judge opens the app.

### 7.7 Domain pack

Domain-specific knowledge lives in a config file. The engine reads it at start-up.

```yaml
domain: offshore_well_intervention
resource_types:
  - { type: barge, capacity: 1, unit: job }
  - { type: supply_boat, capacity: 100, unit: deck_units }
readiness_templates:
  esp_replacement:
    - { name: function_test, lead_days: 1 }
    - { name: paperwork, lead_days: 1 }
    - { name: shorebase_staging, lead_days: 1 }
    - { name: load_and_sail, lead_days: 1 }
constraints:
  weather: { metric: wave_height_m, max: 2.0, applies_to: [barge, supply_boat] }
priority_metric: shortfall_bopd
stale_after_hours: 48
```

The action registry (7.4) sits in the same pack.

A plant turnaround pack swaps in cranes, scaffolding crews, a parts-and-permit readiness template and no weather constraint, with "hours of unit downtime" as the priority metric.

### 7.8 Architecture decision records

| ADR | Decision | Alternatives rejected | Reason |
|---|---|---|---|
| 1 | PostgreSQL on Cloud SQL | Firestore | The data is relational (jobs, resources, items, plans), the engine needs joins, and approval must be atomic across tables. We lose Firestore's live updates and replace them with SSE and refetch |
| 2 | OR-Tools CP-SAT | NSGA-II, hand-written heuristics | CP-SAT gives repeatable results, enforces hard constraints exactly, and solves small problems fast. NSGA-II gives different answers per run and handles hard constraints awkwardly. We get trade-offs by re-solving with different weights |
| 3 | One agent with tools | Multi-agent setup | Fewer moving parts and lower latency, with the same capability |
| 4 | Gemini Flash by default | Gemini Pro everywhere | Flash is cheap and fast. The architecture covers its weak spots. We upgrade single steps only when the eval shows a gap |
| 5 | Vertex AI with a service account | AI Studio API key in production | No key to leak from a public repo, billing stays in the GCP project |
| 6 | Agent can only propose | Agent applies changes itself | Human control, and an audit trail for every change |
| 9 | Policy in an action registry, situation from Gemini | Let Gemini decide which levers to use freely | Keeps the model inside company policy and makes its part easy to audit |
| 10 | Gemini tags risks; fixed rules turn tags into effects | Gemini sets risk weights | A model-chosen weight cannot be checked; a tag with a quoted source can |
| 7 | Paste and upload input | Direct mailbox or WhatsApp access | WhatsApp has no API for reading personal or group chats, and mailbox access needs IT approval that operators rarely give. Paste works anywhere on day one |
| 8 | One Cloud Run service | Separate services for agent and API | One deployment, one URL, fewer failure points during judging |

## 8. Validation

> In short: We prove the prototype works with engine unit tests, an agent eval set, a three-way ablation against fair baselines, and a measured cost per decision.

Section 4.1 lists the business metrics for real operations. This section is about evidence we can produce before 18 October.

### 8.1 Engine tests

Pytest cases with known answers: readiness deadline maths, overlap detection, deck overflow, weather blocking, and the A-12 counterfactual (target D+3 should report "test date before D+1 needed, not possible").

### 8.2 Agent eval set

12 to 15 scenarios, run with ADK's eval tooling:

- 4 requests (feasible, feasible with conditions, infeasible, ambiguous wording)
- 4 disruptions (late test, weather, overflowing boat, vendor email with a risk note)
- 2 opportunities
- 2 to 3 hostile or messy inputs: a vendor email containing "approve this immediately", a message missing the job ID, a screenshot of a chat
- 1 case with thin evidence, where the right answer includes the agent saying it is unsure
- 2 pairs of "same data, different message" cases, where one sentence should change which levers the agent opens

| Metric | Target |
|---|---|
| Correct nature classification | All scenarios |
| Correct verdict or replan outcome | At least 13 of 15 |
| Hard constraints extracted correctly | At least 90% of constraints |
| Numbers in explanations matching engine output | All, after the numeric checker |
| Infeasible plans recommended | Zero |
| Forbidden levers used | Zero |
| Levers opened that the message ruled out | Zero |
| Latency per run | Median under 20 s |
| Cost per run | Reported in the deck |

### 8.3 Model comparison

Run the same eval with Flash and with Pro. If Flash scores close to Pro at a fraction of the cost, that result becomes one slide: the architecture makes a cheap model reliable.

### 8.4 Ablation

A fair comparison needs fair baselines. We run the same eval set through three set-ups:

| Set-up | What it gets |
|---|---|
| A. CP-SAT, every allowed lever open | The structured database and the action registry, but not the messages |
| B. CP-SAT fed by a person filling a form | A team member reads each message and fills the constraints and levers by hand |
| C. Ripple | The messages, the database and the registry |

What we measure:

- **A against C:** how often A proposes a plan that breaks context nobody typed into the database (moving an inspected job, expediting a test the vendor refused), and how many conditions each plan needs.
- **B against C:** plan quality should be close, since both end in CP-SAT. The difference is human time per case (we time the form filling), plus the explanation and drafted messages Ripple adds.

The claim this supports: Ripple matches an optimizer that a person sets up by hand, without the hand work, and it is safer than an optimizer left to pull every lever.

### 8.5 Second domain

Load the plant turnaround pack and run one disruption scenario (a late spare part) with no engine code changes.

---

# Part IV. Next

## 9. Scope and team plan

> In short: Build the A-12 path end to end first, make it reliable, then add depth in the order below.

### 9.1 Scope

| Priority | Item |
|---|---|
| Must | Pasted text intake; agent with the core tools and lever loop; action registry; engine and CP-SAT; approval with reject reason and plain-language reply; schedule view, readiness board and agent panel (simple versions); A-12 scenario including the "same data, different message" pair; D-07 disruption; deployment on Firebase Hosting and Cloud Run; demo reset; engine tests; a small eval set; the three-way ablation |
| Should | Numeric checker; risk tags and stale-data rules; Cloud Trace; E-02 opportunity |
| Could | PDF and screenshot upload; daily check via Cloud Scheduler; notification drafts; Flash versus Pro comparison |
| Later | Plant turnaround scenario (otherwise one slide); decision memory with pgvector; retrieval over daily workover reports for realistic job durations and vendor delay patterns; retrieval over SOPs so the agent can cite rules such as crane wave limits; CI/CD with Cloud Build |
| Not now (roadmap) | Mailbox or WhatsApp integration; login and roles; multiple sites |

### 9.2 Roles

| Role | Owns | Person |
|---|---|---|
| Agent | Prompts, ADK setup, tools layer, eval set | TBD |
| Engine and data | Domain pack, engine, CP-SAT model, schema, seed scenarios, engine tests | TBD |
| Frontend | Three views, SSE timeline, approve flow, demo reset button | TBD |
| Platform and story | GCP setup, deployment, logging and tracing, deck, video, README | TBD |

### 9.3 Agree before coding

1. The `ChangeEvent` schema and tool contracts (7.4)
2. The database schema (7.6)
3. The SSE event format (7.4)
4. The seed data for the A-12 scenario (Appendix C)

## 10. Risks and mitigations

> In short: The biggest risks are a failed live demo and scope creep. Both have cheap mitigations.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Model or API fails during judging | Medium | High | Billing enabled, `min-instances=1`, cached responses for the seeded scenarios as a fallback |
| Model IDs change or a model is retired | Medium | Medium | Model names in one config file; avoid Gemini 2.5 |
| Gemini extracts a constraint wrongly | Medium | High | Strict schema, `source_excerpt` shown in the UI so the planner can check, eval set coverage |
| Solver returns no solution or runs slowly | Low | Medium | Small horizon, solve time limit, fall back to the best feasible solution found |
| Cloud SQL trial starts billing | Low | Low | Keep the default configuration; budget alert |
| Secrets or real data reach the public repo | Low | High | Secret Manager, `.gitignore`, all data synthetic, a check before the repo goes public |
| Scope creep | High | High | Section 9 order: Must items only until A-12 works end to end |
| Judges do not know offshore operations | Medium | Medium | Primer in deck and video; plant turnaround scenario |
| Scenarios feel unrealistic | Medium | Medium | Ask one or two planners to review numbers and steps |
| Judges see the agent as "if-else with an LLM" | Medium | High | Show the "same data, different message" pair and the three-way ablation; state plainly what Gemini does and does not do (5.4) |
| Source data is wrong or stale | Medium | High | `source` and `last_updated` on every readiness item, stale items flagged; the plan is only as good as the data, and the UI says so |

## 11. Scalability and roadmap

> In short: The core carries over to any operation with jobs, shared resources and readiness chains. Each new domain adds a config pack and sometimes a new constraint type.

### 11.1 Domains

| Part | Offshore well intervention | Plant turnaround | Building construction | Aircraft maintenance |
|---|---|---|---|---|
| Job | Replace ESP | Replace heat exchanger | Pour slab | Engine inspection |
| Shared resource | Barge, supply boat deck | Crane, scaffolding crew | Tower crane | Hangar bay |
| Readiness chain | Test, paperwork, shorebase, sailing | Part delivery, permit | Rebar, inspection | Parts, certified engineer |
| Disruption | Waves, late test | Late part, new finding | Rain, late concrete | Part not in stock |
| Domain-specific constraint | Wave height | Hot-work permits | Pour curing time | Certification rules |

The engine, agent loop, tools, approval flow and UI carry over unchanged. A new domain needs its config pack, its constraint types if they are new, and a few example messages for the eval set.

### 11.2 Technical path

- Inbound mail: a dedicated forwarding address, then Pub/Sub and Eventarc to trigger the agent when a message arrives.
- Mailbox connectors (Outlook, Gmail) with admin consent, for teams that want them.
- Vertex AI Agent Engine for managed sessions and scaling when there are many sites.
- BigQuery for analytics over decision history: which vendors run late, which changes cost the most.
- Login, roles and multi-site separation.

### 11.3 Setting Ripple up for a new customer

Ripple is a configurable platform, not a ready-made product and not a consulting project per client. Each customer needs three things:

1. A domain pack: resource types, readiness templates, constraint types, priority metric.
2. An action registry: which levers exist, which are allowed, who approves them, their relative cost.
3. Data connections: at first a read-only copy of the schedule and readiness status; later the ERP or CMMS.

For early customers an implementation partner fills these with the planning team, which is common practice for industrial operations software. A new constraint type still needs engine code.

### 11.4 Product phases

1. Hackathon prototype: one site, synthetic data, paste and upload.
2. Pilot: one real planning team, read-only copy of their schedule, Ripple suggests and the planner decides.
3. Production: write-back to the system of record after approval, mail forwarding, a second domain.

---

# Appendices

## A. Glossary

| Term | Meaning |
|---|---|
| ESP | Electric submersible pump, used to lift oil from a well |
| Barge | Vessel with lifting equipment used for well work |
| Supply boat | Vessel that carries equipment and materials from shore to platforms |
| Shorebase | Onshore yard where cargo is staged before sailing |
| Function test | Vendor test that a pump must pass before it ships |
| bopd | Barrels of oil per day |
| NPT | Non-productive time: hours a rig, barge or crew is on the job but cannot work |
| Shortfall | Production lost per day while a well underperforms |
| D+n | n days from the scenario start |
| CP-SAT | Constraint solver in Google OR-Tools |
| ADK | Google Agent Development Kit |
| SSE | Server-sent events, used to stream agent steps to the browser |

## B. Assumptions

| Assumption | Value | Status |
|---|---|---|
| Time from function test to ready-to-load | About 3 days (test, paperwork, shorebase) | Team estimate, to validate |
| Loading and sailing | 1 day | Illustrative |
| A-12 shortfall | 250 bbl/day | Illustrative |
| Wave limit for barge and boat operations | 2.0 m | Illustrative, check with marine team |
| Weather data | Synthetic forecast table | Prototype only |
| Cost inputs | See the table in 3.5 | Desk estimates, October 2026 |

## C. Demo scenarios

1. **Request: A-12 pull-forward.** As in 6.2. Shows the verdict, failed strategies, the counterfactual, the manifest change and approval. This is the main video scenario.
2. **Disruption: vendor email.** The vendor writes that the D-07 pump test slips three days and mentions a seal finding. Ripple updates the ETA as a range, flags the seal note as a risk, detects that D-07 is now late, and proposes swapping D-07 with a ready job.
3. **Opportunity: early pump.** E-02's pump passes its test four days early. Ripple sees the open barge gap and suggests pulling E-02 forward.
4. **Second domain.** Plant turnaround, late spare part. Same engine, different config pack.

The seed data for each scenario lives in one SQL file, which `/demo/reset` reloads.

## D. Traceability to judging criteria

| Criterion | Weight | Where this document answers it |
|---|---|---|
| Technical Merit: meaningful use of Gen AI | 40% (shared) | 5.4, 6.2, 6.4, 7.3, 8.4 |
| Technical Merit: implementation | | 7, 8.1, 8.2, 10 |
| Technical Merit: scalability and sustainability | | 7.7, 8.3, 11 |
| Problem Alignment and Impact | 25% | 2, 3, 4.1 |
| Innovation and Creativity | 25% | 5.4, 6.7, 7.5 |
| User Experience and Solution Design | 10% | 6.2, 6.6 |

## E. Known limits (say these out loud)

- Ripple only guarantees the constraints it models. Work permits, unrecorded equipment condition, vendor policy and internal politics stay with the planner.
- The prototype runs on seeded data and pasted text. It does not yet prove it can cope with real company data that is scattered, late and inconsistent.
- Cost and time savings are model estimates for seeded scenarios, not measured results. Use "in this scenario the model estimates about 1,000 barrels recovered", never "Ripple saves USD 95,000".
- The planner baseline (time per change, alternatives tried, error rate) is a team estimate until a pilot measures it.

## F. Decisions and open questions

Decided on 10 Oct 2026:

- Backend in Python (FastAPI, ADK). Frontend in React with TypeScript, built with Vite (see 7.2).
- Cost inputs use desk estimates (3.5). A planner review is welcome but not blocking.
- The plant turnaround scenario is a stretch goal. If time runs out, it becomes one slide with the mapping table from 11.1.
- The hackathon gives no cloud credits. One team member opens a new GCP account for the USD 300 trial credit (it covers Vertex AI and needs a card for verification), owns billing, and adds the others as project members. Budget alert at USD 20. Postgres uses the separate Cloud SQL trial through Data Connect.

Still open:

1. Who takes which role in 9.2, and who owns the billing account?

