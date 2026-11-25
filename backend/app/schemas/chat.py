from pydantic import BaseModel, Field
from typing import List, Optional

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=10000)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_items=1, max_items=50)
    manual_id: str
    manual_title: Optional[str] = None
    manual_description: Optional[str] = None
    link_id: Optional[str] = None  # For public access via shareable links
    session_id: Optional[str] = None  # To track discussion sessions over time


class ChatResponse(BaseModel):
    content: str
