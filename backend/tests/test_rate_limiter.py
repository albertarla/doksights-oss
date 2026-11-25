"""
Tests for the Rate Limiter utility.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
import threading
import time

from app.utils.rate_limiter import RateLimiter


class TestRateLimiterInit:
    """Tests for RateLimiter initialization."""
    
    def test_default_requests_per_minute(self):
        """Test default rate limit is 20 requests per minute."""
        limiter = RateLimiter()
        assert limiter.requests_per_minute == 20
    
    def test_custom_requests_per_minute(self):
        """Test custom rate limit configuration."""
        limiter = RateLimiter(requests_per_minute=100)
        assert limiter.requests_per_minute == 100
    
    def test_window_seconds_is_60(self):
        """Test that window is 60 seconds (1 minute)."""
        limiter = RateLimiter()
        assert limiter.window_seconds == 60
    
    def test_empty_requests_on_init(self):
        """Test that requests dict is empty on initialization."""
        limiter = RateLimiter()
        assert len(limiter.requests) == 0


class TestRateLimiterIsLimited:
    """Tests for the is_limited method."""
    
    def test_first_request_not_limited(self):
        """Test that the first request is not rate limited."""
        limiter = RateLimiter(requests_per_minute=5)
        assert limiter.is_limited("192.168.1.1") is False
    
    def test_requests_within_limit_not_blocked(self):
        """Test that requests within limit are allowed."""
        limiter = RateLimiter(requests_per_minute=5)
        
        for i in range(5):
            result = limiter.is_limited("192.168.1.1")
        
        # First 5 requests should be allowed (returns False for not limited)
        # Actually, is_limited returns False and records the request
        # So after 5 calls, we should have 5 requests recorded
        assert len(limiter.requests["192.168.1.1"]) == 5
    
    def test_request_exceeding_limit_blocked(self):
        """Test that request exceeding limit is blocked."""
        limiter = RateLimiter(requests_per_minute=3)
        
        # Make 3 requests (allowed)
        assert limiter.is_limited("192.168.1.1") is False
        assert limiter.is_limited("192.168.1.1") is False
        assert limiter.is_limited("192.168.1.1") is False
        
        # 4th request should be blocked
        assert limiter.is_limited("192.168.1.1") is True
    
    def test_different_identifiers_tracked_separately(self):
        """Test that different IPs are tracked independently."""
        limiter = RateLimiter(requests_per_minute=2)
        
        # IP 1 makes 2 requests
        assert limiter.is_limited("192.168.1.1") is False
        assert limiter.is_limited("192.168.1.1") is False
        assert limiter.is_limited("192.168.1.1") is True  # Blocked
        
        # IP 2 should still be allowed
        assert limiter.is_limited("192.168.1.2") is False
        assert limiter.is_limited("192.168.1.2") is False
    
    def test_old_requests_cleaned_up(self):
        """Test that old requests outside window are cleaned up."""
        limiter = RateLimiter(requests_per_minute=2)
        
        # Manually add old requests
        old_time = datetime.utcnow() - timedelta(seconds=120)  # 2 minutes ago
        limiter.requests["192.168.1.1"] = [old_time, old_time]
        
        # New request should be allowed (old ones cleaned up)
        assert limiter.is_limited("192.168.1.1") is False
        
        # Should only have 1 request now (the new one)
        assert len(limiter.requests["192.168.1.1"]) == 1
    
    def test_request_recorded_when_not_limited(self):
        """Test that request is recorded when not limited."""
        limiter = RateLimiter(requests_per_minute=5)
        
        limiter.is_limited("test-ip")
        
        assert len(limiter.requests["test-ip"]) == 1
    
    def test_request_not_recorded_when_limited(self):
        """Test that request is NOT recorded when limited."""
        limiter = RateLimiter(requests_per_minute=1)
        
        # First request allowed
        limiter.is_limited("test-ip")
        assert len(limiter.requests["test-ip"]) == 1
        
        # Second request blocked - should not be recorded
        limiter.is_limited("test-ip")
        assert len(limiter.requests["test-ip"]) == 1  # Still 1


class TestRateLimiterReset:
    """Tests for the reset method."""
    
    def test_reset_clears_requests(self):
        """Test that reset clears all requests for an identifier."""
        limiter = RateLimiter(requests_per_minute=5)
        
        # Make some requests
        limiter.is_limited("192.168.1.1")
        limiter.is_limited("192.168.1.1")
        limiter.is_limited("192.168.1.1")
        
        assert len(limiter.requests["192.168.1.1"]) == 3
        
        # Reset
        limiter.reset("192.168.1.1")
        
        assert len(limiter.requests["192.168.1.1"]) == 0
    
    def test_reset_only_affects_specified_identifier(self):
        """Test that reset only affects the specified identifier."""
        limiter = RateLimiter(requests_per_minute=5)
        
        # Make requests for two IPs
        limiter.is_limited("192.168.1.1")
        limiter.is_limited("192.168.1.2")
        
        # Reset only IP 1
        limiter.reset("192.168.1.1")
        
        assert len(limiter.requests["192.168.1.1"]) == 0
        assert len(limiter.requests["192.168.1.2"]) == 1
    
    def test_reset_nonexistent_identifier(self):
        """Test that resetting a nonexistent identifier doesn't error."""
        limiter = RateLimiter()
        
        # Should not raise an error
        limiter.reset("nonexistent")
        assert len(limiter.requests["nonexistent"]) == 0


class TestRateLimiterThreadSafety:
    """Tests for thread safety."""
    
    def test_concurrent_requests_thread_safe(self):
        """Test that concurrent requests are handled safely."""
        limiter = RateLimiter(requests_per_minute=100)
        results = []
        
        def make_request():
            result = limiter.is_limited("shared-ip")
            results.append(result)
        
        # Create multiple threads
        threads = [threading.Thread(target=make_request) for _ in range(50)]
        
        # Start all threads
        for t in threads:
            t.start()
        
        # Wait for all threads
        for t in threads:
            t.join()
        
        # All 50 requests should have been processed
        assert len(results) == 50
        
        # Should have 50 requests recorded for this IP
        assert len(limiter.requests["shared-ip"]) == 50
