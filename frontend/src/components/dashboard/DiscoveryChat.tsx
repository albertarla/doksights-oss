import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, Sparkles, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { chatService } from '@/services/chatService';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface DiscoveryChatProps {
    isOpen: boolean;
    onClose: () => void;
    companySlug?: string; // For public portal mode
}

const DiscoveryChat = ({ isOpen, onClose, companySlug }: DiscoveryChatProps) => {
    const { session } = useAuth();
    const navigate = useNavigate();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: companySlug
                ? `Hi! I'm your AI assistant for finding the right manual. Describe your problem or what you're looking for, and I'll recommend the most relevant manuals.`
                : `Hi! I'm your AI assistant for finding the right manual. Describe your problem or what you're looking for, and I'll recommend the most relevant manuals from your library.`,
        },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const sessionIdRef = useRef<string>(crypto.randomUUID());

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        const assistantId = (Date.now() + 1).toString();
        setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

        let assistantContent = '';

        await chatService.discoverManuals(
            {
                messages: [...messages.slice(1), userMessage].map(m => ({
                    role: m.role,
                    content: m.content
                })),
                company_slug: companySlug,
                sessionId: sessionIdRef.current,
            },
            session?.access_token ?? null,
            (chunk) => {
                assistantContent += chunk;
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantId ? { ...m, content: assistantContent } : m
                    )
                );
            },
            (error) => {
                console.error('Discovery chat error:', error);
                toast.error(error);
            },
            () => {
                setIsLoading(false);
            }
        );
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className={`w-full bg-card flex flex-col h-full border-l border-border ${!isOpen ? 'hidden' : ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <div className="rounded-full bg-primary/10 p-1.5">
                        <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium">Find a Manual</span>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
                <div className="space-y-4">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            /* Fixed: Enforces row-level container constraints */
                            className={`flex gap-3 w-full min-w-0 ${message.role === 'user' ? 'flex-row-reverse' : ''
                                }`}
                        >
                            <div
                                className={`flex-shrink-0 rounded-full p-2 h-8 w-8 flex items-center justify-center ${message.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted'
                                    }`}
                            >
                                {message.role === 'user' ? (
                                    <span className="text-xs font-medium">You</span>
                                ) : (
                                    <Bot className="h-4 w-4" />
                                )}
                            </div>

                            {/* Fixed: Bubble constraints swapped from max-w-[80%] to max-w-[85%] w-full min-w-0 */}
                            <div
                                className={`rounded-lg p-3 max-w-[85%] min-w-0 w-full ${message.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-foreground'
                                    }`}
                            >
                                {message.content ? (
                                    /* Fixed: Extended breaking utilities and list indentation modifiers added below */
                                    <div className="text-sm prose prose-sm max-w-none w-full break-all [word-break:break-word] prose-ol:pl-4 prose-ul:pl-4 prose-p:my-1 prose-headings:my-2 text-inherit">
                                        <ReactMarkdown>{message.content}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <span className="flex items-center gap-2 text-sm">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Thinking...
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Describe what you're looking for..."
                        className="flex-1"
                        disabled={isLoading}
                    />
                    <Button onClick={handleSend} size="icon" disabled={!input.trim() || isLoading}>
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default DiscoveryChat;