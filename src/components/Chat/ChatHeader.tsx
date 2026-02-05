import { Hash, Search, Bell, Users, MoreVertical, X } from "lucide-react";
import { useState } from "react";

interface ChatHeaderProps {
  channelName: string;
  channelDescription: string;
  peerCount: number;
  isTyping: boolean;
  onSearch: (query: string) => void;
}

export function ChatHeader({ channelName, channelDescription, peerCount, isTyping, onSearch }: ChatHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    onSearch(val);
  };

  const toggleSearch = () => {
     if (isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery("");
        onSearch("");
     } else {
        setIsSearchOpen(true);
     }
  };

  return (
    <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-white/[0.02] backdrop-blur-md z-10">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-surface-light to-surface flex items-center justify-center shadow-lg shadow-black/20 border border-white/5 ring-1 ring-white/5">
          <Hash className="w-5 h-5 text-muted" />
        </div>
        <div className="flex flex-col">
          <h2 className="font-bold text-white leading-tight">{channelName}</h2>
          <span className="text-xs text-muted flex items-center gap-2">
             {isTyping ? (
                 <span className="text-primary animate-pulse font-medium">Печатает...</span>
             ) : (
                 channelDescription
             )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
         {isSearchOpen ? (
            <div className="flex items-center bg-black/20 rounded-xl px-3 py-1.5 mr-2 animate-in slide-in-from-right-4 duration-200 border border-white/10">
               <Search className="w-4 h-4 text-muted mr-2" />
               <input 
                  autoFocus
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Поиск..."
                  className="bg-transparent border-none outline-none text-sm text-white w-40 placeholder:text-muted/50"
               />
               <button onClick={toggleSearch} className="ml-2 hover:text-white text-muted">
                  <X className="w-4 h-4" />
               </button>
            </div>
         ) : (
             <button onClick={toggleSearch} className="p-2 rounded-xl hover:bg-white/5 text-muted hover:text-white transition-colors">
                <Search className="w-5 h-5" />
             </button>
         )}
         
         <button className="p-2 rounded-xl hover:bg-white/5 text-muted hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
         </button>
         <div className="w-px h-6 bg-white/10 mx-2" />
         <button className="p-2 rounded-xl hover:bg-white/5 text-muted hover:text-white transition-colors relative group">
            <Users className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-success border border-background text-[8px] items-center justify-center text-black font-bold">
                {peerCount}
              </span>
            </span>
         </button>
         <button className="p-2 rounded-xl hover:bg-white/5 text-muted hover:text-white transition-colors">
            <MoreVertical className="w-5 h-5" />
         </button>
      </div>
    </div>
  );
}
