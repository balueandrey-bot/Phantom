import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/Layout/Sidebar";
import { ChatHeader } from "./components/Chat/ChatHeader";
import { MessageList, Message } from "./components/Chat/MessageList";
import { MessageInput } from "./components/Chat/MessageInput";
import { dbService, DBContact } from "./services/db";

function App() {
  const [activeChannel, setActiveChannel] = useState("global-gossip");
  const [activePeer, setActivePeer] = useState<string | null>(null);
  const [localPeerId, setLocalPeerId] = useState<string>("Инициализация...");
  const [peers, setPeers] = useState<string[]>([]);
  const [contacts, setContacts] = useState<DBContact[]>([]);
  const [userProfile, setUserProfile] = useState<{name: string} | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [replyingTo, setReplyingTo] = useState<{sender: string, content: string} | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typingPeers, setTypingPeers] = useState<Record<string, number>>({});
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [listenAddresses, setListenAddresses] = useState<string[]>([]);

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1000, audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  // Initialize DB and load messages & contacts
  useEffect(() => {
    const initDB = async () => {
      await dbService.init();
      loadContacts();
      loadProfile();

      // Fetch initial listen addresses
      try {
        const addrs = await invoke<string[]>("get_listen_addresses");
        setListenAddresses(prev => {
            const newAddrs = addrs.filter(a => !prev.includes(a));
            return [...prev, ...newAddrs];
        });
        
        const pid = await invoke<string>("get_local_peer_id");
        if (pid && pid !== "Initializing...") {
            setLocalPeerId(pid);
        }
      } catch (e) {
        console.error("Failed to get p2p info", e);
      }
    };
    initDB();
  }, []);

  const loadProfile = async () => {
    const name = await dbService.getSetting("displayName");
    if (name) {
      setUserProfile({ name });
    }
  };

  const handleUpdateProfile = (name: string) => {
    setUserProfile({ name });
  };

  const handleConnectPeer = async (addr: string) => {
    try {
        await invoke("connect_peer", { addr });
        alert("Запрос на подключение отправлен");
    } catch (e) {
        console.error("Connection failed", e);
        alert("Ошибка подключения: " + e);
    }
  };

  const loadContacts = async () => {

    const loadedContacts = await dbService.getContacts();
    setContacts(loadedContacts);
  };

  const handleAddContact = async (peerId: string, name: string) => {
    await dbService.addContact(peerId, name);
    await loadContacts();
  };

  const handleDeleteContact = async (peerId: string) => {
    await dbService.deleteContact(peerId);
    await loadContacts();
  };

  // Load messages when active channel changes
  useEffect(() => {
    const loadMessages = async () => {
      const dbMessages = await dbService.getMessages(activeChannel);
      const formattedMessages: Message[] = dbMessages.map(msg => {
        let replyTo = undefined;
        if (msg.replyTo) {
           try {
             replyTo = JSON.parse(msg.replyTo);
           } catch(e) {}
        }
        
        let reactions = {};
        if (msg.reactions) {
          try {
            reactions = JSON.parse(msg.reactions);
          } catch(e) {}
        }

        return {
          uuid: msg.uuid,
          sender: msg.sender,
          content: msg.content,
          channel: msg.channel,
          time: new Date(msg.timestamp).toLocaleTimeString(),
          replyTo,
          type: msg.type as any,
          status: msg.status as any,
          reactions,
          isEdited: !!msg.lastEdited
        };
      });
      setMessages(formattedMessages);
    };
    loadMessages();
  }, [activeChannel]);

  useEffect(() => {
    // Check if running in Tauri environment
    // @ts-ignore
    const isTauri = !!(window.__TAURI_INTERNALS__);
    
    if (!isTauri) {
        console.log("Running in browser mode - P2P features disabled");
        setLocalPeerId("Браузерный режим (без P2P)");
        return;
    }

    // Fetch initial local peer ID
    invoke<string>("get_local_peer_id")
      .then(id => {
        if (id !== "Initializing...") setLocalPeerId(id);
      })
      .catch(console.error);

    // Listen for local peer ID updates
    const unlistenLocal = listen<string>("local-peer-id", (event) => {
        setLocalPeerId(event.payload);
    });
    
    // Listen for discovered peers
    const unlistenDiscovery = listen<string>("peer-discovered", (event) => {
        setPeers(prev => {
            if (prev.includes(event.payload)) return prev;
            return [...prev, event.payload];
        });
    });

    // Listen for listen addresses
    const unlistenAddress = listen<string>("listen-address", (event) => {
        setListenAddresses(prev => {
            if (prev.includes(event.payload)) return prev;
            return [...prev, event.payload];
        });
    });

    // Listen for incoming messages
    const unlistenMsg = listen<string>("new-message", async (event) => {
        try {
            const payload = JSON.parse(event.payload);
            const channel = payload.channel === "phantom-global" ? "global-gossip" : payload.channel;
            const senderName = payload.sender === localPeerId ? "Я" : payload.sender.substring(0, 8) + "...";
            
            if (payload.sender !== localPeerId) {
                playNotificationSound();
            }

            let content = payload.content;
            let replyTo = undefined;
            let type = 'text';
            let uuid = undefined;
            let targetUuid = undefined;
            
            // Try to parse structured message
            try {
                const json = JSON.parse(content);
                if (json && typeof json === 'object') {
                    // Check if it's our new protocol
                    if ('type' in json) {
                        type = json.type;
                        content = json.content || json.text;
                        replyTo = json.replyTo;
                        uuid = json.uuid;
                        targetUuid = json.targetUuid;
                    } 
                    // Fallback for older messages
                    else if ('text' in json) {
                        content = json.text;
                        replyTo = json.replyTo;
                    }
                }
            } catch (e) {
                // Not JSON or plain text, treat as content
            }

            // Handle Special Types (Edit, Reaction, Delete)
            if (type === 'edit' && targetUuid) {
                 // Update DB
                 await dbService.updateMessageContent(targetUuid, content);
                 // Update UI
                 setMessages(prev => prev.map(m => 
                    m.uuid === targetUuid ? { ...m, content: content, isEdited: true } : m
                 ));
                 return;
            }

            if (type === 'delete' && targetUuid) {
                 // Delete from DB
                 await dbService.deleteMessage(targetUuid);
                 // Update UI
                 setMessages(prev => prev.filter(m => m.uuid !== targetUuid));
                 return;
            }

            if (type === 'reaction' && targetUuid) {
                 // Update DB logic needs to be robust. 
                 // For now, let's just update UI and assume next load will sync or we do simple append?
                 // Reactions are complex to sync without full history.
                 // We will just update UI for now.
                 setMessages(prev => prev.map(m => {
                    if (m.uuid === targetUuid) {
                        const reactions = { ...(m.reactions || {}) };
                        const currentReactors = reactions[content] || [];
                        if (currentReactors.includes(senderName)) {
                            reactions[content] = currentReactors.filter(r => r !== senderName);
                            if (reactions[content].length === 0) delete reactions[content];
                        } else {
                            reactions[content] = [...currentReactors, senderName];
                        }
                        // Async update DB
                        dbService.updateMessageReactions(targetUuid, JSON.stringify(reactions));
                        return { ...m, reactions };
                    }
                    return m;
                 }));
                 return;
            }

            // Regular Message
            // Save to DB
            await dbService.saveMessage({
              uuid: uuid,
              sender: senderName,
              content: content,
              channel: channel,
              timestamp: Date.now(),
              replyTo: replyTo ? JSON.stringify(replyTo) : undefined,
              type: type as any,
              status: 'delivered' // Received messages are delivered
            });

            // Only update UI if message belongs to active channel or active peer
            // Note: If channel is a peer ID, it should match activePeer
            const currentView = activePeer || activeChannel;
            if (channel === currentView) {
                setMessages(prev => [...prev, { 
                    uuid: uuid,
                    sender: senderName, 
                    content: content, 
                    channel: channel,
                    time: new Date().toLocaleTimeString(),
                    replyTo,
                    type: type as any,
                    status: 'delivered'
                }]);
            }
        } catch (e) {
            console.error("Failed to parse message:", e);
        }
    });

    // Listen for handshake completion
    const unlistenHandshake = listen<string>("handshake-complete", (event) => {
        console.log("Secure connection established with", event.payload);
        const peerId = event.payload;
        // Add system message
        const sysMsg = {
            sender: "Система",
            content: "🔒 Защищенное соединение установлено",
            channel: peerId,
            time: new Date().toLocaleTimeString()
        };
        
        // Save system message to DB? Maybe not. Just show it.
        if (activePeer === peerId) {
             setMessages(prev => [...prev, sysMsg]);
        }
    });

    // Listen for typing indicators
    const unlistenTyping = listen<string>("peer-typing", (event) => {
        try {
            const payload = JSON.parse(event.payload);
            const { peerId, isTyping } = payload;
            
            setTypingPeers(prev => {
                const next = { ...prev };
                if (isTyping) {
                    next[peerId] = Date.now();
                } else {
                    delete next[peerId];
                }
                return next;
            });

            // Auto-clear typing status after 3 seconds if no stop signal received
            if (isTyping) {
                setTimeout(() => {
                    setTypingPeers(prev => {
                        const next = { ...prev };
                        if (next[peerId] && Date.now() - next[peerId] > 2500) {
                            delete next[peerId];
                            return next;
                        }
                        return prev; // No change
                    });
                }, 3000);
            }
        } catch (e) {
            console.error("Failed to parse typing event:", e);
        }
    });

    return () => {
        unlistenLocal.then(f => f());
        unlistenDiscovery.then(f => f());
        unlistenMsg.then(f => f());
        unlistenHandshake.then(f => f());
        unlistenTyping.then(f => f());
        unlistenAddress.then(f => f());
    }
  }, [localPeerId, activeChannel, activePeer]);

  const handleInputChange = (value: string) => {
      setInputValue(value);
      
      const targetChannel = activePeer; // Only for direct messages
      if (!targetChannel) return;
      
      // @ts-ignore
      if (!window.__TAURI_INTERNALS__) return;

      // Send "started typing"
      if (value.length > 0 && !typingTimeoutRef.current) {
          invoke("send_typing_indicator", { channel: targetChannel, isTyping: true }).catch(console.error);
      }

      // Debounce "stopped typing"
      if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
          invoke("send_typing_indicator", { channel: targetChannel, isTyping: false }).catch(console.error);
          typingTimeoutRef.current = null;
      }, 1000);
  };

  const handleEditMessage = async (msg: Message, newContent: string) => {
    if (!msg.uuid) return;
    
    // Optimistic update
    setMessages(prev => prev.map(m => 
      m.uuid === msg.uuid ? { ...m, content: newContent, isEdited: true } : m
    ));

    // Update DB
    await dbService.updateMessageContent(msg.uuid, newContent);

    // Send update to peers
    const targetChannel = activePeer || activeChannel;
    if (activePeer) {
      // P2P update
      const payload = {
        uuid: crypto.randomUUID(),
        type: 'edit',
        content: newContent,
        targetUuid: msg.uuid,
        timestamp: Date.now()
      };
      await invoke("send_message", { 
        channel: targetChannel, 
        message: JSON.stringify(payload) 
      }).catch(console.error);
    }
  };

  const handleReactMessage = async (msg: Message, emoji: string) => {
    if (!msg.uuid) return;

    // Optimistic update
    const myName = userProfile?.name || localPeerId;
    setMessages(prev => prev.map(m => {
      if (m.uuid === msg.uuid) {
        const reactions = { ...(m.reactions || {}) };
        const currentReactors = reactions[emoji] || [];
        
        // Toggle reaction
        if (currentReactors.includes(myName)) {
          reactions[emoji] = currentReactors.filter(r => r !== myName);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...currentReactors, myName];
        }
        return { ...m, reactions };
      }
      return m;
    }));

    // Calculate new reactions string for DB
    const message = messages.find(m => m.uuid === msg.uuid);
    if (message) {
        // Need to get the updated state, but state update is async.
        // Re-calculate logic for DB save
        const reactions = { ...(message.reactions || {}) };
        const currentReactors = reactions[emoji] || [];
        if (currentReactors.includes(myName)) {
            reactions[emoji] = currentReactors.filter(r => r !== myName);
             if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
            reactions[emoji] = [...currentReactors, myName];
        }
        await dbService.updateMessageReactions(msg.uuid, JSON.stringify(reactions));
    }

    // Send reaction to peers
    const targetChannel = activePeer || activeChannel;
    if (activePeer) {
      const payload = {
        uuid: crypto.randomUUID(),
        type: 'reaction',
        content: emoji,
        targetUuid: msg.uuid,
        timestamp: Date.now()
      };
      await invoke("send_message", { 
        channel: targetChannel, 
        message: JSON.stringify(payload) 
      }).catch(console.error);
    }
  };

  const handleDeleteMessage = async (msg: Message) => {
    if (!msg.uuid) return;
    
    if (!confirm("Вы уверены, что хотите удалить это сообщение?")) return;

    // Optimistic update
    setMessages(prev => prev.filter(m => m.uuid !== msg.uuid));

    // Update DB
    await dbService.deleteMessage(msg.uuid);

    // Send P2P delete
    const targetChannel = activePeer || activeChannel;
    if (activePeer) {
      const payload = {
        uuid: crypto.randomUUID(),
        type: 'delete',
        targetUuid: msg.uuid,
        timestamp: Date.now()
      };
      await invoke("send_message", { 
        channel: targetChannel, 
        message: JSON.stringify(payload) 
      }).catch(console.error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    
    // Clear typing status immediately
    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
        if (activePeer) {
             invoke("send_typing_indicator", { channel: activePeer, isTyping: false }).catch(console.error);
        }
    }

    const targetChannel = activePeer || activeChannel;
    if (!targetChannel) return;

    const messageUuid = crypto.randomUUID();
    const senderName = userProfile?.name || "Я"; // Local display name

    const messagePayload = {
        uuid: messageUuid,
        type: 'text',
        text: inputValue,
        replyTo: replyingTo,
        timestamp: Date.now()
    };
    
    const messageToSend = JSON.stringify(messagePayload);

    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) {
        console.warn("Cannot send message in browser mode");
        // Mock message for browser testing
        const mockMsg: Message = {
            uuid: messageUuid,
            sender: senderName,
            content: inputValue,
            channel: targetChannel,
            time: new Date().toLocaleTimeString(),
            replyTo: replyingTo || undefined,
            type: 'text',
            status: 'sent'
        };
        setMessages(prev => [...prev, mockMsg]);
        setInputValue("");
        setReplyingTo(null);
        return;
    }
    try {
        await invoke("send_message", { 
            channel: targetChannel, 
            message: messageToSend 
        });

        // Save to DB
        await dbService.saveMessage({
            uuid: messageUuid,
            sender: senderName,
            content: inputValue,
            channel: targetChannel,
            timestamp: Date.now(),
            replyTo: replyingTo ? JSON.stringify(replyingTo) : undefined,
            type: 'text',
            status: 'sent'
        });

        // Optimistically add to UI
        setMessages(prev => [...prev, {
            uuid: messageUuid,
            sender: senderName,
            content: inputValue,
            channel: targetChannel,
            time: new Date().toLocaleTimeString(),
            replyTo: replyingTo || undefined,
            type: 'text',
            status: 'sent'
        }]);

        setInputValue("");
        setReplyingTo(null);
    } catch (e) {
        console.error("Failed to send message:", e);
        if (typeof e === 'string' && e.includes("Handshake sent")) {
             setMessages(prev => [...prev, {
                sender: "Система",
                content: "⏳ Установка защищенного соединения... Повторите отправку после подтверждения.",
                channel: targetChannel,
                time: new Date().toLocaleTimeString()
             }]);
        }
    }
  };

  const handleFileSelect = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      alert("Файл слишком большой (макс. 2МБ)");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const type = file.type.startsWith('image/') ? 'image' : 'file';
      const targetChannel = activePeer || activeChannel;
      if (!targetChannel) return;

      const messageUuid = crypto.randomUUID();
      const senderName = userProfile?.name || "Я";

      const messagePayload = {
        uuid: messageUuid,
        type: type,
        content: content, // Base64
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(1) + ' KB',
        replyTo: replyingTo,
        timestamp: Date.now()
      };

      const messageToSend = JSON.stringify(messagePayload);

      // Save locally
      await dbService.saveMessage({
        uuid: messageUuid,
        sender: senderName,
        content: content,
        channel: targetChannel,
        timestamp: Date.now(),
        replyTo: replyingTo ? JSON.stringify(replyingTo) : undefined,
        type: type,
        status: 'sent',
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(1) + ' KB'
      });

      // Update UI
      setMessages(prev => [...prev, {
        uuid: messageUuid,
        sender: senderName,
        content: content,
        channel: targetChannel,
        time: new Date().toLocaleTimeString(),
        replyTo: replyingTo || undefined,
        type: type,
        status: 'sent',
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(1) + ' KB',
        timestamp: Date.now()
      }]);

      setReplyingTo(null);

      // Send P2P
      try {
        await invoke("send_message", { 
            channel: targetChannel, 
            message: messageToSend 
        });
      } catch (e) {
         console.error("Failed to send file:", e);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSendAudio = async (blob: Blob) => {
    const targetChannel = activePeer || activeChannel;
    if (!targetChannel) return;

    const reader = new FileReader();
    reader.onload = async () => {
        const base64Audio = reader.result as string;
        const messageUuid = crypto.randomUUID();
        const senderName = userProfile?.name || "Я";
        
        const messagePayload = {
            uuid: messageUuid,
            type: 'audio',
            content: base64Audio,
            timestamp: Date.now()
        };

        const messageToSend = JSON.stringify(messagePayload);

        try {
             // Save to DB
             await dbService.saveMessage({
                uuid: messageUuid,
                sender: senderName,
                content: base64Audio,
                channel: targetChannel,
                timestamp: Date.now(),
                type: 'audio',
                status: 'sent'
             });

             // Update UI
             setMessages(prev => [...prev, {
                uuid: messageUuid,
                sender: senderName,
                content: base64Audio,
                channel: targetChannel,
                time: new Date().toLocaleTimeString(),
                type: 'audio',
                status: 'sent',
                timestamp: Date.now()
             }]);

             // Send P2P
             await invoke("send_message", { 
                channel: targetChannel, 
                message: messageToSend 
             });
        } catch (e) {
            console.error("Failed to send audio:", e);
        }
    };
    reader.readAsDataURL(blob);
  };

  const getPeerDisplayName = (peerId: string) => {
    const contact = contacts.find(c => c.peerId === peerId);
    return contact ? contact.name : `Участник ${peerId.substring(0, 8)}...`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
        for (const file of files) {
            await handleFileSelect(file);
        }
    }
  };

  const filteredMessages = messages.filter(msg => {
     if (!searchQuery) return true;
     return msg.content.toLowerCase().includes(searchQuery.toLowerCase()) || 
            msg.sender.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div 
      className="flex h-screen w-screen bg-transparent text-text overflow-hidden font-sans select-none p-4 gap-4 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm border-2 border-primary border-dashed rounded-3xl flex items-center justify-center animate-in fade-in duration-200 m-4">
           <div className="text-2xl font-bold text-white bg-black/50 px-8 py-4 rounded-2xl shadow-xl backdrop-blur-md">
              Отпустите файл для отправки
           </div>
        </div>
      )}
      {/* Unified Sidebar */}
      <div className="flex-shrink-0 h-full rounded-3xl overflow-hidden shadow-glass ring-1 ring-white/10">
        <Sidebar 
          peers={peers} 
          localPeerId={localPeerId}
          activeChannel={activeChannel}
          activePeer={activePeer}
          contacts={contacts}
          listenAddresses={listenAddresses}
          onConnectPeer={handleConnectPeer}
          onSelectChannel={(id) => {
            setActiveChannel(id);
            setActivePeer(null);
          }}
          onSelectPeer={(id) => {
            setActivePeer(id);
            setActiveChannel("");
          }}
          onAddContact={handleAddContact}
          onDeleteContact={handleDeleteContact}
          onUpdateProfile={handleUpdateProfile}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 h-full flex flex-col rounded-3xl overflow-hidden shadow-glass glass-panel ring-1 ring-white/10 relative">
        <ChatHeader 
           channelName={activeChannel || (activePeer ? getPeerDisplayName(activePeer) : "Выберите чат")}
           channelDescription={activeChannel ? "Глобальный публичный канал" : "Прямое P2P соединение"}
           peerCount={peers.length}
           isTyping={activePeer ? !!typingPeers[activePeer] : false}
           onSearch={setSearchQuery}
        />
        <MessageList 
          messages={filteredMessages} 
          activeChannel={activePeer || activeChannel}
          localPeerId={userProfile?.name || localPeerId}
          onReply={(msg) => setReplyingTo({sender: msg.sender, content: msg.content})}
          onReact={handleReactMessage}
          onEdit={handleEditMessage}
          onDelete={handleDeleteMessage}
        />
        <MessageInput 
          value={inputValue}
          onChange={handleInputChange}
          onSend={handleSendMessage}
          onFileSelect={handleFileSelect}
          onSendAudio={handleSendAudio}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </div>
    </div>
  );
}

export default App;
