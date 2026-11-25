# Manual Hub - Python Backend

This folder contains the Python FastAPI backend for advanced AI capabilities.

## Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI entry point
│   ├── config.py        # Configuration settings
│   ├── auth/            # JWT validation
│   ├── routers/         # API endpoints
│   ├── services/        # Business logic
│   └── schemas/         # Pydantic models
├── requirements.txt
├── .env.example
└── Dockerfile
```

## Setup

1. Create virtual environment:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. Run development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

## Deployment

The backend is deployed separately from the frontend.
Recommended platforms: Railway, Render, Google Cloud Run, AWS Lambda.

## Integration with the frontend

The frontend calls this backend via the `VITE_API_URL` environment variable (including the `/api/v1` prefix).
