import { useRef, useState, useEffect } from "react";
import { Plus, Smile, Send, Mic, X, Reply } from "lucide-react";

interface MessageInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  onFileSelect?: (file: File) => void;
  onSendAudio?: (blob: Blob) => void;
  placeholder?: string;
  replyingTo?: { sender: string; content: string } | null;
  onCancelReply?: () => void;
}

export function MessageInput({ value, onChange, onSend, onFileSelect, onSendAudio, placeholder = "Напишите сообщение...", replyingTo, onCancelReply }: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          if (onSendAudio) onSendAudio(blob);
          stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
          setRecordingTime(t => t + 1);
      }, 1000);

    } catch (err) {
      console.error("Mic access denied", err);
      alert("Нет доступа к микрофону");
    }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
          if (timerRef.current) clearInterval(timerRef.current);
      }
  };

  const cancelRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.onstop = null; // Prevent sending
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
          setIsRecording(false);
          if (timerRef.current) clearInterval(timerRef.current);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onFileSelect) {
      onFileSelect(e.target.files[0]);
      e.target.value = ""; // Reset
    }
  };

  return (
    <div className="px-6 pb-6 pt-2 bg-gradient-to-t from-background/80 via-background/40 to-transparent">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileChange}
      />
      {replyingTo && (
        <div className="mb-2 flex items-center justify-between bg-surface/60 backdrop-blur-md p-3 rounded-2xl border-l-4 border-primary shadow-lg animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col min-w-0">
             <span className="text-xs font-bold text-primary flex items-center gap-1">
               <Reply className="w-3 h-3" />
               Ответ {replyingTo.sender}
             </span>
             <span className="text-sm text-muted truncate">{replyingTo.content}</span>
          </div>
          <button onClick={onCancelReply} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-muted hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className={`bg-surface/40 backdrop-blur-xl rounded-2xl flex items-center p-2 gap-2 ring-1 ring-white/10 shadow-glass hover:ring-white/20 transition-all duration-300 ${isRecording ? 'ring-red-500/50 bg-red-500/10' : 'focus-within:ring-primary/50 focus-within:bg-surface/60 focus-within:shadow-[0_0_20px_rgba(139,92,246,0.1)]'}`}>
        {!isRecording && (
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl text-muted hover:text-white hover:bg-white/10 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
        
        {isRecording ? (
             <div className="flex-1 flex items-center gap-3 px-2">
                 <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                 <span className="text-red-400 font-mono font-medium">{formatTime(recordingTime)}</span>
                 <span className="text-sm text-muted/60">Запись голосового сообщения...</span>
             </div>
        ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              placeholder={placeholder}
              className="bg-transparent flex-1 outline-none text-text placeholder:text-muted/40 text-sm py-2 px-1 font-medium"
            />
        )}

        <div className="flex items-center gap-1.5 text-muted">
           {!isRecording && (
               <button className="p-2.5 rounded-xl hover:text-white hover:bg-white/10 transition-all active:scale-95">
                 <Smile className="w-5 h-5" />
               </button>
           )}
           
           {isRecording ? (
               <>
                   <button 
                       onClick={cancelRecording}
                       className="p-2.5 rounded-xl text-muted hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
                       title="Отменить"
                   >
                       <X className="w-5 h-5" />
                   </button>
                   <button 
                       onClick={stopRecording}
                       className="p-2.5 rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-all active:scale-90 animate-in fade-in zoom-in"
                       title="Отправить"
                   >
                       <Send className="w-4 h-4" />
                   </button>
               </>
           ) : (
               value.trim() ? (
                 <button 
                    onClick={onSend}
                    className="p-2.5 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:from-primary-hover hover:to-purple-500 transition-all duration-300 transform active:scale-90 animate-in fade-in zoom-in"
                 >
                    <Send className="w-4 h-4" />
                 </button>
               ) : (
                 <button 
                    onClick={startRecording}
                    className="p-2.5 rounded-xl hover:text-white hover:bg-white/10 transition-all active:scale-95"
                 >
                   <Mic className="w-5 h-5" />
                 </button>
               )
           )}
        </div>
      </div>
    </div>
  );
}
