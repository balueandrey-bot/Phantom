import { useEffect, useRef, useState } from "react";
import { Hash, Check, CheckCheck, Reply, Clock, Smile, Pencil, Trash2, FileText, Download, X, Play, Pause, ZoomIn } from "lucide-react";
import Markdown from "react-markdown";

export interface Message {
  uuid?: string;
  sender: string;
  content: string;
  time: string;
  channel: string;
  replyTo?: { sender: string; content: string; uuid?: string } | null;
  type?: 'text' | 'image' | 'file' | 'audio';
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: Record<string, string[]>; // emoji -> array of sender names
  isEdited?: boolean;
  fileName?: string;
  fileSize?: string;
  timestamp?: number; // Added for date separators
}

interface MessageListProps {
  messages: Message[];
  activeChannel: string;
  localPeerId?: string; // For checking own reactions
  onReply: (msg: Message) => void;
  onReact?: (msg: Message, emoji: string) => void;
  onEdit?: (msg: Message, newContent: string) => void;
  onDelete?: (msg: Message) => void;
}

const REACTION_PRESETS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export function MessageList({ messages, activeChannel, localPeerId, onReply, onReact, onEdit, onDelete }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null); // uuid of playing audio
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const messageRefs = useRef<Record<string, HTMLDivElement>>({});

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth"
        });
    }
  }, [messages, activeChannel]);

  const scrollToMessage = (uuid: string) => {
    const el = messageRefs.current[uuid];
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bg-primary/20', 'transition-colors', 'duration-500');
        setTimeout(() => {
            el.classList.remove('bg-primary/20');
        }, 1000);
    }
  };

  const toggleAudio = (uuid: string) => {
      const audio = audioRefs.current[uuid];
      if (!audio) return;

      if (playingAudio === uuid) {
          audio.pause();
          setPlayingAudio(null);
      } else {
          // Stop others
          if (playingAudio && audioRefs.current[playingAudio]) {
              audioRefs.current[playingAudio].pause();
              audioRefs.current[playingAudio].currentTime = 0;
          }
          audio.play();
          setPlayingAudio(uuid);
      }
  };

  const handleEditStart = (msg: Message) => {
    if (msg.uuid) {
      setEditingId(msg.uuid);
      setEditContent(msg.content);
      setReactionTarget(null);
    }
  };

  const handleEditSave = (msg: Message) => {
    if (onEdit && msg.uuid) {
      onEdit(msg, editContent);
      setEditingId(null);
    }
  };

  const renderStatus = (status?: string) => {
    if (!status || status === 'sending') return <Clock className="w-3 h-3 text-white/50" />;
    if (status === 'sent') return <Check className="w-3 h-3 text-white/50" />;
    if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-white/50" />;
    if (status === 'read') return <CheckCheck className="w-3 h-3 text-blue-400" />;
    return null;
  };

  const renderDateSeparator = (date: Date) => {
    return (
      <div className="flex items-center justify-center my-4 opacity-50">
        <div className="h-px bg-white/10 w-full max-w-[100px]" />
        <span className="text-xs font-medium text-white/50 px-3">
          {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
        </span>
        <div className="h-px bg-white/10 w-full max-w-[100px]" />
      </div>
    );
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const filteredMessages = messages.filter(m => m.channel === activeChannel);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1 relative">
       {/* Lightbox */}
       {lightboxSrc && (
         <div 
           className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center animate-in fade-in duration-200"
           onClick={() => setLightboxSrc(null)}
         >
           <button 
             className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
             onClick={() => setLightboxSrc(null)}
           >
             <X className="w-6 h-6" />
           </button>
           <img 
             src={lightboxSrc} 
             alt="Full preview" 
             className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
             onClick={(e) => e.stopPropagation()}
           />
         </div>
       )}

       {/* Welcome Placeholder */}
       {filteredMessages.length === 0 && (
         <div className="flex-1 h-full flex flex-col items-center justify-center text-muted opacity-50 animate-in fade-in zoom-in duration-500">
            <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-surface-light to-surface flex items-center justify-center mb-6 rotate-12 shadow-2xl shadow-black/20 ring-1 ring-white/5 group">
               <Hash className="w-12 h-12 text-primary group-hover:scale-110 transition-transform duration-500" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 bg-gradient-to-r from-white to-white/50 bg-clip-text text-transparent">#{activeChannel || "Чат"}</h3>
            <p className="text-sm font-medium text-muted/60">Отправьте сообщение, чтобы начать общение</p>
         </div>
       )}

       {filteredMessages.map((msg, i) => {
         const isMe = msg.sender === "Я";
         const prevMsg = filteredMessages[i - 1];
         const nextMsg = filteredMessages[i + 1];
         
         const msgDate = new Date(msg.timestamp || msg.time); // Use timestamp if available, fallback to time string parsing if possible (but time string loses date info usually)
         // Assuming msg.time is just HH:MM string, we might need real timestamp. 
         // The Message interface was updated to include timestamp optional. App.tsx provides it.
         // If timestamp is missing (old messages), we might default to today or skip separator logic carefully.
         // Let's rely on timestamp if present.
         
         let showDateSeparator = false;
         if (msg.timestamp) {
             if (i === 0) {
                 showDateSeparator = true;
             } else {
                 const prevTimestamp = prevMsg?.timestamp;
                 if (prevTimestamp) {
                     const prevDate = new Date(prevTimestamp);
                     if (!isSameDay(msgDate, prevDate)) {
                         showDateSeparator = true;
                     }
                 }
             }
         }

         const isSequenceTop = prevMsg && prevMsg.sender === msg.sender && !showDateSeparator;
         const isSequenceBottom = nextMsg && nextMsg.sender === msg.sender && 
                                  (!nextMsg.timestamp || isSameDay(new Date(nextMsg.timestamp), msgDate));
         
         const isEditing = editingId === msg.uuid;

         return (
           <div key={msg.uuid || i}>
             {showDateSeparator && renderDateSeparator(msgDate)}
             
             <div 
               ref={el => { if (msg.uuid && el) messageRefs.current[msg.uuid] = el; }}
               className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isSequenceTop ? 'mt-1' : 'mt-4'} relative group/msg`}
               onMouseLeave={() => setReactionTarget(null)}
             >
             {!isSequenceTop && (
               <div className="flex items-center gap-2 mb-1 px-1">
                 <span className={`text-xs font-medium ${isMe ? 'text-primary' : 'text-white'}`}>
                   {msg.sender}
                 </span>
                 <span className="text-[10px] text-muted/60">{msg.time}</span>
               </div>
             )}

             <div className={`
               max-w-[85%] px-4 py-2.5 break-words relative shadow-md transition-all duration-200 hover:shadow-lg
               ${isMe 
                 ? 'bg-gradient-to-br from-primary to-purple-600 text-white rounded-2xl rounded-tr-sm shadow-primary/20' 
                 : 'bg-surface-light/40 backdrop-blur-md text-text rounded-2xl rounded-tl-sm border border-white/5'
               }
               ${isSequenceTop && isMe ? 'rounded-tr-2xl' : ''}
               ${isSequenceTop && !isMe ? 'rounded-tl-2xl' : ''}
               ${isSequenceBottom && isMe ? 'rounded-br-sm' : ''}
               ${isSequenceBottom && !isMe ? 'rounded-bl-sm' : ''}
             `}>
               {/* Reply Context */}
               {msg.replyTo && (
                  <div 
                    className={`mb-1 text-xs border-l-2 pl-2 py-1 rounded-r opacity-80 cursor-pointer hover:opacity-100 transition-opacity ${isMe ? 'border-white/50 bg-black/10' : 'border-primary bg-primary/5'}`}
                    onClick={() => msg.replyTo?.uuid && scrollToMessage(msg.replyTo.uuid)}
                  >
                      <span className="font-bold block mb-0.5">{msg.replyTo.sender}</span>
                      <span className="line-clamp-1">{msg.replyTo.content}</span>
                  </div>
               )}

               {/* Content */}
               {isEditing ? (
                 <div className="flex flex-col gap-2 min-w-[200px]">
                   <textarea 
                     value={editContent}
                     onChange={(e) => setEditContent(e.target.value)}
                     className="w-full bg-black/20 rounded p-2 text-sm focus:outline-none resize-none"
                     rows={2}
                     autoFocus
                   />
                   <div className="flex justify-end gap-2">
                     <button onClick={() => setEditingId(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
                     <button onClick={() => handleEditSave(msg)} className="p-1 hover:bg-white/10 rounded"><Check className="w-4 h-4" /></button>
                   </div>
                 </div>
               ) : (
                 <>
                   {msg.type === 'image' && (
                     <div className="relative group/img cursor-pointer" onClick={() => setLightboxSrc(msg.content)}>
                        <img src={msg.content} alt="Image" className="max-w-full rounded-lg mb-2 hover:opacity-90 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/20 rounded-lg">
                            <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
                        </div>
                     </div>
                   )}
                   {msg.type === 'audio' && (
                     <div className="flex items-center gap-2 p-2 bg-black/10 rounded-lg mb-2 min-w-[200px]">
                        <button 
                            onClick={() => msg.uuid && toggleAudio(msg.uuid)}
                            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                        >
                            {playingAudio === msg.uuid ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="h-1 bg-white/10 rounded-full w-full overflow-hidden">
                                <div className={`h-full bg-primary ${playingAudio === msg.uuid ? 'animate-pulse' : ''}`} style={{width: '50%'}} />
                            </div>
                            <span className="text-[10px] text-muted/70 mt-1">Голосовое сообщение</span>
                        </div>
                        <audio 
                            ref={el => { if (msg.uuid && el) audioRefs.current[msg.uuid] = el; }}
                            src={msg.content} 
                            onEnded={() => setPlayingAudio(null)}
                            className="hidden"
                        />
                     </div>
                   )}
                   {msg.type === 'file' && (
                     <div className="flex items-center gap-3 p-2 bg-black/10 rounded-lg mb-2">
                       <div className="p-2 bg-white/10 rounded-lg">
                         <FileText className="w-6 h-6" />
                       </div>
                       <div className="flex-1 overflow-hidden">
                         <div className="text-sm font-medium truncate">{msg.fileName || "File"}</div>
                         <div className="text-xs opacity-70">{msg.fileSize || "Unknown size"}</div>
                       </div>
                       <button className="p-1.5 hover:bg-white/10 rounded-full transition">
                         <Download className="w-4 h-4" />
                       </button>
                     </div>
                   )}
                   {msg.type !== 'image' && msg.type !== 'file' && msg.type !== 'audio' && (
                     <div className={`prose prose-sm max-w-none ${isMe ? 'prose-invert' : 'prose-invert'} prose-p:my-1 prose-pre:bg-black/20 prose-pre:rounded-lg`}>
                       <Markdown>{msg.content}</Markdown>
                     </div>
                   )}
                 </>
               )}

               {/* Footer: Time, Status, Edited */}
               <div className={`flex items-center gap-1 mt-1 justify-end ${isMe ? 'text-white/60' : 'text-muted/60'}`}>
                 {msg.isEdited && <span className="text-[9px] italic opacity-80 mr-1">изменено</span>}
                 <span className="text-[10px]">{msg.time}</span>
                 {isMe && renderStatus(msg.status)}
               </div>

               {/* Reactions Display */}
               {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                 <div className="absolute -bottom-3 left-2 flex gap-1 z-10">
                   {Object.entries(msg.reactions).map(([emoji, senders]) => {
                     const isMyReaction = localPeerId && senders.includes(localPeerId);
                     return (
                       <div 
                         key={emoji} 
                         className={`border rounded-full px-1.5 py-0.5 text-xs shadow-sm flex items-center gap-1 text-text transition-colors cursor-pointer ${
                           isMyReaction 
                             ? 'bg-primary/20 border-primary/50' 
                             : 'bg-surface border-white/10 hover:border-white/30'
                         }`}
                         onClick={() => onReact && onReact(msg, emoji)}
                       >
                         <span>{emoji}</span>
                         <span className={`text-[10px] ${isMyReaction ? 'opacity-100' : 'opacity-70'}`}>{senders.length}</span>
                       </div>
                     );
                   })}
                 </div>
               )}

               {/* Message Actions (Reply, React, Edit) */}
               <div className={`absolute -top-3 ${isMe ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'} flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity`}>
                  <button 
                    onClick={() => onReply(msg)}
                    className="p-1.5 rounded-full bg-surface/80 text-muted hover:text-white hover:bg-primary transition-all shadow-lg backdrop-blur-sm"
                    title="Ответить"
                  >
                    <Reply className="w-3 h-3" />
                  </button>
                  <div className="relative">
                    <button 
                      onClick={() => setReactionTarget(reactionTarget === msg.uuid ? null : (msg.uuid || null))}
                      className="p-1.5 rounded-full bg-surface/80 text-muted hover:text-white hover:bg-primary transition-all shadow-lg backdrop-blur-sm"
                      title="Реакция"
                    >
                      <Smile className="w-3 h-3" />
                    </button>
                    {/* Reaction Picker Popover */}
                    {reactionTarget === msg.uuid && (
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-surface border border-white/10 rounded-full p-1 flex gap-1 shadow-xl animate-in zoom-in-95 duration-200 z-50">
                        {REACTION_PRESETS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => {
                              if (onReact) onReact(msg, emoji);
                              setReactionTarget(null);
                            }}
                            className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-lg leading-none"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {isMe && onEdit && (
                    <button 
                      onClick={() => handleEditStart(msg)}
                      className="p-1.5 rounded-full bg-surface/80 text-muted hover:text-white hover:bg-primary transition-all shadow-lg backdrop-blur-sm"
                      title="Редактировать"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  {isMe && onDelete && (
                    <button 
                      onClick={() => onDelete(msg)}
                      className="p-1.5 rounded-full bg-surface/80 text-muted hover:text-red-400 hover:bg-red-500/10 transition-all shadow-lg backdrop-blur-sm"
                      title="Удалить"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
               </div>

             </div>
           </div>
         </div>
         );
       })}
    </div>
  );
}
