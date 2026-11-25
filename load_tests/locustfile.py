import time
from locust import HttpUser, task, between
import json
import uuid

class DokSightsPortalUser(HttpUser):
    """
    Simulates a public visitor on a company portal.
    This user is unauthenticated.
    """
    
    # Wait between 1 and 4 seconds between tasks to simulate reading time
    wait_time = between(1, 4)
    
    # User-provided data for DokSights portal
    TEST_MANUAL_ID = "b48883c9-3c06-4590-b521-5ff0684bd357"
    TEST_COMPANY_SLUG = "chatmanuals"
    
    def on_start(self):
        """Called when a user starts a session."""
        self.session_id = str(uuid.uuid4())

    @task(10)
    def health_check(self):
        """Cheap baseline check to ensure backend is alive."""
        self.client.get("/health")

    @task(5)
    def chat_discovery(self):
        """
        Simulate a user asking the global portal chat 'What manual should I read?'.
        This uses the Natural Language Discovery endpoint.
        """
        payload = {
            "messages": [
                {"role": "user", "content": "I am looking for information on how to setup my device."}
            ],
            "company_slug": self.TEST_COMPANY_SLUG,
            "session_id": self.session_id,
            "max_recommendations": 3
        }
        
        # Group under /chat/discover for report aggregation
        with self.client.post("/api/v1/chat/discover", json=payload, catch_response=True, name="/chat/discover") as response:
            if response.status_code == 200:
                # Iterate through chunks to simulate consumer reading the stream
                for line in response.iter_lines():
                    if line:
                        pass
                response.success()
            elif response.status_code == 422:
                response.failure(f"Discovery Payload Error: {response.text}")
            elif response.status_code == 404:
                # This might happen if company_slug is wrong
                response.failure(f"Portal Not Found: {self.TEST_COMPANY_SLUG}")
            else:
                response.failure(f"Discovery failed with {response.status_code}")

    @task(4)
    def track_manual_view(self):
        """
        Simulate a user clicking on a manual and viewing its pages.
        Triggers the analytics service.
        """
        payload = {
            "manual_id": self.TEST_MANUAL_ID,
            "reading_duration_seconds": 30,
            "pages_viewed": 5,
            "total_pages": 40,
            "referrer": "http://localhost:8080/company/chatmanuals",
            "source": "portal"
        }
        
        with self.client.post("/api/v1/analytics/view", json=payload, catch_response=True, name="/analytics/view") as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 403:
                # Likely license or privacy rejection, which we want to know about
                response.failure(f"Analytics Rejected: {response.text}")
            else:
                response.failure(f"Analytics Error {response.status_code}")

    @task(2)
    def public_chat_streaming(self):
        """
        Simulate a user chatting with a specific PUBLIC manual inside the portal.
        This endpoint is open to the public if the manual is set to public.
        """
        payload = {
            "manual_id": self.TEST_MANUAL_ID,
            "session_id": self.session_id,
            "messages": [
                {"role": "user", "content": "How do I troubleshoot connection issues?"}
            ]
        }
        
        # Test the streaming endpoint (/chat/stream)
        with self.client.post("/api/v1/chat/stream", json=payload, stream=True, catch_response=True, name="/chat/stream") as response:
            if response.status_code == 200:
                for line in response.iter_lines():
                    if line:
                        pass
                response.success()
            elif response.status_code == 429:
                response.success() # Rate limit expected
            elif response.status_code == 403:
                response.failure("Public Chat Access Denied (Is the manual set to public?)")
            elif response.status_code == 404:
                response.failure(f"Manual {self.TEST_MANUAL_ID} not found")
            else:
                response.failure(f"Public Chat Stream failed with {response.status_code}")
