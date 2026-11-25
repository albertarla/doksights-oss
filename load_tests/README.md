# Load Testing Guide

This directory contains a **Locust** script to stress test the DokSights backend.

## Prerequisites
1. Install Locust:
   ```bash
   pip install locust
   ```

## Running the Test

### Option 1: Docker (Recommended)
Use the included bash script to run tests with configurable parameters. This version is isolated and doesn't require Python/Locust on your machine (only Docker).

1. From the project root, run:
   ```bash
   ./load_tests/run_load_test.sh -u 10 -s 1 -h http://host.docker.internal:8000
   ```
2. Open your browser at `http://localhost:8089`.

**Parameters for `run_load_test.sh`:**
- `-u, --users`: Number of concurrent users (default: 10).
- `-s, --spawn`: Users spawned per second (default: 1).
- `-t, --time`: Duration of the test (e.g., `10m` or `1h`).
- `-h, --host`: Target host URL (default: `http://host.docker.internal:8000`).
- `--headless`: Run without web UI (useful for CI/CD or endurance tests).

### Option 2: Local Python
1. Start the backend as usual.
2. From the project root, run:
   ```bash
   locust -f load_tests/locustfile.py
   ```
3. Open your browser at `http://localhost:8089`.

## Key Metrics to Watch
- **RPS (Requests Per Second)**: How many concurrent users the backend can sustain.
- **Median Response Time**: Keep an eye on latency spikes as users increase.
- **Error Rate**: 429 errors are expected as the rate limiter kicks in. 500 errors indicate server crashes or DB connection exhaustion.

## Testing Different Scenarios
- **Stress Test**: Increase user count until the system fails or latency becomes unacceptable (>5s).
- **Endurance Test**: Run a constant load for 30-60 minutes to check for memory leaks.
- **Peak Load**: Test how the system recovers after a sudden burst of 100+ concurrent requests.

> [!TIP]
> To get real results, update the `TEST_MANUAL_ID` and `TEST_COMPANY_SLUG` in `locustfile.py` with IDs existing in your database.
