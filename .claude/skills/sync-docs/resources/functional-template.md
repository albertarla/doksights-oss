# [Feature Name]
**Status:** [Draft | Dev | Stable]
**Last Updated:** YYYY-MM-DD
**Related ADR:** ADR-[ID] (or N/A)

## Objective
A brief description of why this feature exists and what problem it solves for the user.

## User Stories
- As a [role], I want to [action], so that [benefit].

## Functional Requirements
- [Requirement 1]
- [Requirement 2]

### AI Token Tracking (if applicable)
- **Token Consolidation**: [Describe if embedding tokens are added to the prompt count]
- **Logging**: [Specify when tokens are logged to ai_token_usage_logs]

## API Surface

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| GET | /api/v1/... | JWT | ... |

## Data Model
Tables or fields in the database that this feature reads from or writes to.

- **Table `table_name`:** [brief description of usage]

## Acceptance Criteria
- [ ] Criterion A
- [ ] Criterion B