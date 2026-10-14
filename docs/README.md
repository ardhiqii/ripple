# Ripple Documentation

This directory is the single entry point for product, design, and engineering documentation.

## Recommended reading order

1. [Team summary](product/ripple-summary-id.md) - five-minute Indonesian overview.
2. [Product proposal](product/ripple-proposal.md) - problem, goals, solution, validation, and scope.
3. [Product build plan](product/product-build-plan.md) - product architecture, screens, navigation, stack, and delivery sequence.
4. [Design system](design/design-system.md) - visual tokens, typography, spacing, components, and usage rules.
5. [UI/UX interaction specification](design/uiux-interaction-spec.md) - screen contracts, controls, flows, page integration, and frontend behavior.
6. [Backend and agentic specification](engineering/backend-agentic-spec.md) - backend, agent, solver, persistence, API, reliability, and deployment details.
7. [Implementation control](implementation/README.md) - frozen MVP decisions and small-model execution protocol.
8. [Technical plan](engineering/technical-plan.md) - original four-lane planning context and early contracts.

## By role

### Product and pitch

- [Team summary](product/ripple-summary-id.md)
- [Product proposal](product/ripple-proposal.md)
- [Product build plan](product/product-build-plan.md)

### Frontend and design

- [Design system](design/design-system.md)
- [UI/UX interaction specification](design/uiux-interaction-spec.md)
- [Product build plan](product/product-build-plan.md)

### Backend, agent, and platform

- [Technical plan](engineering/technical-plan.md)
- [Backend and agentic specification](engineering/backend-agentic-spec.md)
- [Product proposal](product/ripple-proposal.md)

### Coding agents

- [Implementation control](implementation/README.md)
- [Frontend task catalog](implementation/frontend-tasks.md)
- [Backend task catalog](implementation/backend-tasks.md)
- [Integration and release task catalog](implementation/integration-tasks.md)

## Source-of-truth order

For coding work, `implementation/README.md` and the assigned task packet define frozen scope first. The relevant current specification then defines detailed behavior.

For product and specification review, use this ownership order:

1. Business intent and product claims: `product/ripple-proposal.md`.
2. Visual rules: `design/design-system.md`.
3. Frontend interaction behavior: `design/uiux-interaction-spec.md`.
4. Backend and agent behavior: `engineering/backend-agentic-spec.md`.
5. Build scope and sequence: `product/product-build-plan.md`.
6. Historical four-lane planning context: `engineering/technical-plan.md`.

If two current specifications disagree outside an already-frozen implementation decision, stop the task and update both specifications before coding.

## Documentation conventions

- Keep repository root Markdown limited to standard project files such as `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and agent instructions.
- Use lowercase kebab-case filenames.
- Put product and business documents in `docs/product/`.
- Put UX, interaction, and visual-system documents in `docs/design/`.
- Put architecture, API, backend, infrastructure, and technical plans in `docs/engineering/`.
- Keep generated API documentation out of this directory. Generate frontend types from FastAPI OpenAPI.
- Add future architecture decisions under `docs/engineering/adr/` with names such as `0001-python-backend.md`.
- Keep temporary meeting notes out of the main specification folders unless their decisions are merged into the source-of-truth documents.
