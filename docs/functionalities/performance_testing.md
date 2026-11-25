# Performance Testing & Scalability

**Last Updated:** 2026-03-20  
**Status:** Stable

## Objective
Ensure the system handles public traffic (high concurrency) without degradation and identified bottlenecks.

## Functional Requirements
- Simulate multiple concurrent users chatting with manuals.
- Track 429 errors to verify rate-limiting efficiency.
- Measure latency for public discovery and private chat.
- Identify database connection spikes.

## API Surface
- `GET /health` (Baseline)
- `POST /api/v1/chat/stream` (AI Chat)
- `POST /api/v1/chat/discover` (Natural language search)

## Data Model (Metrics)
| Metric | Target | Warning |
| :--- | :--- | :--- |
| RPS (Healthy) | > 50 | < 10 |
| Median Latency | < 500ms | > 2s |
| Error Rate | < 1% | > 5% |

## Testing Protocols
1. **Stress Test**: Gradually increase concurrent users (up to 200).
2. **Endurance Test**: Sustained load of 20 concurrent users for 60 minutes.
3. **Peak Load**: Sudden spike of 50 users in 5 seconds.

### Dockerized Environment
A fully isolated testing environment is provided in `./load_tests/`, allowing for consistent testing conditions:
- **Dockerfile**: Contains `locust` and its dependencies.
- **Run Script**: Use `./load_tests/run_load_test.sh` to trigger tests with CLI parameters (users, spawn, duration).

## Bottlenecks & Mitigations
- **In-memory Rate Limiting**: Limit only works per container replica. Fix: Introduce Redis.
- **LLM Token Limits**: External provider caps. Fix: Load balancer with fallback API keys.
- **DB Pool**: Supabase connection limit (e.g., 60-90 for free tier). Fix: Use Supabase PgBouncer (6543) if needed.
