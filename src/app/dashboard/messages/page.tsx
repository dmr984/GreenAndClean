"use client";

import * as React from "react";
import { useSearchParams } from 'next/navigation';
import { Send, User, MessageSquare, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Message = {
  id: string;
  sender: 'admin' | string; // user ID or 'admin'
  text: string;
  timestamp: string;
  read: boolean;
};

type User = {
  id: string;
  name: string;
};

type Conversation = Message[];

// Generic function to get data from localStorage
const getFromStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

// Generic function to save data to localStorage
const saveToStorage = <T,>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('storage'));
};

const getAvatarFallback = (name?: string) => {
    if (!name) return "??";
    const parts = name.split(' ');
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export default function MessagesPage() {
    const searchParams = useSearchParams();
    const operatorIdFromQuery = searchParams.get('userId');

    const [userRole, setUserRole] = React.useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
    
    const [allMessages, setAllMessages] = React.useState<Record<string, Conversation>>({});
    const [operators, setOperators] = React.useState<User[]>([]);
    
    const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(operatorIdFromQuery);
    const [newMessage, setNewMessage] = React.useState("");
    const scrollAreaRef = React.useRef<HTMLDivElement>(null);


    React.useEffect(() => {
        const role = getFromStorage<string|null>('userRole', null);
        const userId = getFromStorage<string|null>('userId', null);
        setUserRole(role);
        setCurrentUserId(userId);
        setAllMessages(getFromStorage<Record<string, Conversation>>('private-messages', {}));
        setOperators(getFromStorage<User[]>('app-users', []));

        if(role === 'operator' && userId) {
            setSelectedConversationId(userId);
        }
    }, []);

    // Mark messages as read when a conversation is opened
    React.useEffect(() => {
        if (selectedConversationId && allMessages[selectedConversationId]) {
            const hasUnread = allMessages[selectedConversationId].some(m => !m.read);
            if (hasUnread) {
                const updatedMessages = {
                    ...allMessages,
                    [selectedConversationId]: allMessages[selectedConversationId].map(m => ({ ...m, read: true }))
                };
                saveToStorage('private-messages', updatedMessages);
                setAllMessages(updatedMessages);
            }
        }
    }, [selectedConversationId, allMessages]);
    
    React.useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight });
        }
    }, [allMessages, selectedConversationId]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversationId || !currentUserId) return;
        
        const message: Message = {
            id: `MSG${Date.now()}`,
            sender: currentUserId,
            text: newMessage.trim(),
            timestamp: new Date().toISOString(),
            read: false,
        };

        const updatedConversation = [...(allMessages[selectedConversationId] || []), message];
        const updatedAllMessages = { ...allMessages, [selectedConversationId]: updatedConversation };

        setAllMessages(updatedAllMessages);
        saveToStorage('private-messages', updatedAllMessages);
        setNewMessage("");
    };

    const isAdmin = userRole === 'admin';
    const selectedConversation = selectedConversationId ? allMessages[selectedConversationId] || [] : [];
    const selectedOperator = operators.find(op => op.id === selectedConversationId);
    
    const getConversationsWithUnread = () => {
       return operators.map(op => {
         const conversation = allMessages[op.id] || [];
         const unreadCount = conversation.filter(m => !m.read && m.sender !== 'admin').length;
         const lastMessage = conversation[conversation.length - 1];
         return {
            user: op,
            unreadCount,
            lastMessage: lastMessage?.text,
            lastMessageDate: lastMessage?.timestamp,
         }
       }).sort((a,b) => (b.lastMessageDate || '').localeCompare(a.lastMessageDate || ''));
    }

    if (isAdmin && !selectedConversationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Messaggi Privati</CardTitle>
                    <CardDescription>Seleziona una conversazione per visualizzare i messaggi.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2">
                        {getConversationsWithUnread().map(({ user, unreadCount, lastMessage }) => (
                            <li key={user.id}>
                                <button 
                                  className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors flex items-center gap-4"
                                  onClick={() => setSelectedConversationId(user.id)}
                                >
                                    <Avatar>
                                        <AvatarFallback>{getAvatarFallback(user.name)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <div className="flex justify-between">
                                            <p className="font-semibold">{user.name}</p>
                                            {unreadCount > 0 && <Badge variant="destructive">{unreadCount}</Badge>}
                                        </div>
                                        <p className="text-sm text-muted-foreground truncate">{lastMessage || 'Nessun messaggio'}</p>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        );
    }


    return (
        <Card className="h-full flex flex-col" style={{maxHeight: 'calc(100vh - 120px)'}}>
            <CardHeader className="flex-shrink-0">
                <div className="flex items-center gap-4">
                    {isAdmin && (
                        <Button variant="ghost" size="icon" className="mr-2" onClick={() => setSelectedConversationId(null)}>
                            <ArrowLeft className="h-5 w-5"/>
                        </Button>
                    )}
                    <Avatar>
                        <AvatarFallback>{getAvatarFallback(isAdmin ? selectedOperator?.name : 'AD')}</AvatarFallback>
                    </Avatar>
                    <div>
                        <CardTitle>{isAdmin ? selectedOperator?.name : 'Amministratore'}</CardTitle>
                        <CardDescription>Conversazione privata</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent ref={scrollAreaRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedConversation.map(msg => (
                    <div key={msg.id} className={cn("flex items-end gap-2", msg.sender === currentUserId ? "justify-end" : "justify-start")}>
                         {msg.sender !== currentUserId && <Avatar className="h-8 w-8"><AvatarFallback>{getAvatarFallback(isAdmin ? selectedOperator?.name : 'AD')}</AvatarFallback></Avatar>}
                        <div className={cn(
                            "p-3 rounded-lg max-w-xs md:max-w-md",
                             msg.sender === currentUserId ? "bg-primary text-primary-foreground" : "bg-muted"
                        )}>
                            <p className="text-sm">{msg.text}</p>
                            <p className="text-xs text-right opacity-70 mt-1">{new Date(msg.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                    </div>
                ))}
                {selectedConversation.length === 0 && (
                    <div className="text-center text-muted-foreground pt-16">
                        <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-2">Nessun messaggio ancora. Inizia la conversazione!</p>
                    </div>
                )}
            </CardContent>
            <div className="p-4 border-t flex-shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <Input 
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Scrivi un messaggio..."
                      autoComplete="off"
                    />
                    <Button type="submit" size="icon" disabled={!newMessage.trim()}>
                        <Send className="h-5 w-5" />
                        <span className="sr-only">Invia</span>
                    </Button>
                </form>
            </div>
        </Card>
    );
}
