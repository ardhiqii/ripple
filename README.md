# Ripple

Ripple is a hackathon concept for AI-assisted schedule replanning in offshore operations.

It reads a planner's pasted change request, identifies the relevant constraints, opens only policy-approved levers, and asks a deterministic engine/solver to find the best feasible plan. A human planner remains the final decision-maker.

## Project status

This repository currently contains the product proposal, technical plan, and team summary. Implementation is intentionally not started yet.

## Documents

- [`RINGKASAN_ripple.md`](./RINGKASAN_ripple.md) — short team summary and demo narrative
- [`ripple-proposal.md`](./ripple-proposal.md) — full product and architecture proposal
- [`TECH_PLAN_ripple.md`](./TECH_PLAN_ripple.md) — technical plan, contracts, lanes, and delivery checklist

## Planned stack

- Backend: Python, FastAPI, Google ADK, Cloud Run
- Model: Gemini Flash through Vertex AI
- Solver: OR-Tools CP-SAT
- Database: PostgreSQL / Cloud SQL
- Frontend: React, TypeScript, Vite, Firebase Hosting

## Scope principles

- Gemini interprets the situation; it does not calculate schedule numbers or weights.
- The engine and solver verify feasibility.
- Policy-approved actions are controlled by an action registry.
- The planner must approve any schedule change.
- The public repository must contain synthetic data only and no secrets.

## Team

See the repository collaborators and the role table in [`ripple-proposal.md`](./ripple-proposal.md).
