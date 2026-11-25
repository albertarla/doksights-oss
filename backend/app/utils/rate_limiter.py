"""
Rate Limiter

Simple in-memory rate limiting for API protection.
For production, consider Redis-based rate limiting.
"""

from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List
import threading


class RateLimiter:
    """
    Token bucket rate limiter.
    
    Tracks requests per IP address within a sliding window.
    """
    
    def __init__(self, requests_per_minute: int = 20):
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60
        self.requests: Dict[str, List[datetime]] = defaultdict(list)
        self._lock = threading.Lock()
    
    def is_limited(self, identifier: str) -> bool:
        """
        Check if an identifier (usually IP) is rate limited.
        
        Args:
            identifier: Unique identifier (e.g., IP address)
            
        Returns:
            True if rate limited, False otherwise
        """
        now = datetime.utcnow()
        window_start = now - timedelta(seconds=self.window_seconds)
        
        with self._lock:
            # Clean old requests
            self.requests[identifier] = [
                req_time for req_time in self.requests[identifier]
                if req_time > window_start
            ]
            
            # Check if over limit
            if len(self.requests[identifier]) >= self.requests_per_minute:
                return True
            
            # Record this request
            self.requests[identifier].append(now)
            return False
    
    def reset(self, identifier: str):
        """Reset rate limit for an identifier."""
        with self._lock:
            self.requests[identifier] = []