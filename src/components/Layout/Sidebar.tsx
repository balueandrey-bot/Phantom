import { useState } from "react";
import { 
  Hash, 
  Users, 
  Ghost, 
  Search,
  Plus,
  Shield,
  Settings,
  UserPlus,
  X,
  Check,
  Trash2
} from "lucide-react";
import { DBContact } from "../../services/db";
import { SettingsModal } from "../Settings/SettingsModal";

interface SidebarProps {
  activeChannel: string;
  activePeer: string | null;
  peers: string[];
  contacts: DBContact[];
  localPeerId: string;
  onSelectChannel: (channel: string) => void;
  onSelectPeer: (peer: string) => void;
  onAddContact: (peerId: string, name: string) => Promise<void>;
  onDeleteContact: (peerId: string) => Promise<void>;
  onUpdateProfile: (name: string) => void;
  listenAddresses: string[];
  onConnectPeer: (addr: string) => void;
}

type Tab = "channels" | "peers";

export function Sidebar({ 
  activeChannel, 
  activePeer, 
  peers, 
  contacts,
  localPeerId, 
  onSelectChannel, 
  onSelectPeer,
  onAddContact,
  onDeleteContact,
  onUpdateProfile,
  listenAddresses,
  onConnectPeer
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>("channels");
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContactId, setNewContactId] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSaveContact = async () => {
    if (newContactId && newContactName) {
      await onAddContact(newContactId, newContactName);
      setIsAddingContact(false);
      setNewContactId("");
      setNewContactName("");
    }
  };


  const getPeerDisplayName = (peerId: string) => {
    const contact = contacts.find(c => c.peerId === peerId);
    return contact ? contact.name : peerId;
  };

  const isContact = (peerId: string) => {
    return contacts.some(c => c.peerId === peerId);
  };


  const channels = [
    { id: "global-gossip", name: "Общий чат", type: "text" },
    { id: "encrypted-chat", name: "Зашифрованный чат", type: "encrypted" },
  ];

  return (
    <div className="w-80 h-full flex flex-col glass-panel-dark border-r border-white/5 bg-[#0b0a15]/90 backdrop-blur-xl">
      {/* App Header */}
      <div className="h-16 flex items-center px-6 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3 group cursor-default">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300 ring-1 ring-white/10">
            <Ghost className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-tight tracking-tight text-white">
              Phantom
            </span>
            <span className="text-[10px] text-primary font-medium tracking-wider uppercase">Secure P2P Chat</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-4 mt-6">
        <div className="flex p-1.5 bg-black/40 rounded-xl border border-white/5 shadow-inner">
          <button
            onClick={() => setActiveTab("peers")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
              activeTab === "peers" 
                ? "bg-surface-light text-white shadow-lg shadow-black/20 ring-1 ring-white/5" 
                : "text-muted hover:text-white hover:bg-white/5"
            }`}
          >
            <Users className="w-4 h-4" />
            Личные
            {peers.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                activeTab === "peers" ? "bg-primary text-white" : "bg-white/10 text-muted"
              }`}>
                {peers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("channels")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
              activeTab === "channels" 
                ? "bg-surface-light text-white shadow-lg shadow-black/20 ring-1 ring-white/5" 
                : "text-muted hover:text-white hover:bg-white/5"
            }`}
          >
            <Hash className="w-4 h-4" />
            Каналы
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 mt-4 mb-2">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Поиск..." 
            className="w-full bg-surface/30 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-sm outline-none focus:bg-surface/50 focus:border-primary/30 transition-all placeholder:text-muted/50"
          />
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {activeTab === "channels" && (
          <>
            <div className="px-3 py-2 text-xs font-semibold text-muted/50 uppercase tracking-wider flex items-center justify-between group">
              Публичные
              <Plus className="w-3 h-3 cursor-pointer opacity-0 group-hover:opacity-100 hover:text-white transition-opacity" />
            </div>
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => onSelectChannel(channel.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden mb-1 ${
                  activeChannel === channel.id
                    ? "bg-gradient-to-r from-primary/20 to-transparent text-white ring-1 ring-primary/20"
                    : "text-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                {activeChannel === channel.id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
                )}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                   activeChannel === channel.id 
                     ? "bg-primary text-white shadow-lg shadow-primary/20" 
                     : "bg-surface border border-white/5 group-hover:border-white/10 group-hover:bg-surface-light"
                }`}>
                  {channel.type === "encrypted" ? <Shield className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                </div>
                <div className="flex flex-col items-start">
                  <span className={`font-medium text-sm transition-colors ${activeChannel === channel.id ? "text-white" : "text-muted-foreground group-hover:text-white"}`}>{channel.name}</span>
                  <span className="text-[10px] text-muted/50 group-hover:text-muted/70 transition-colors truncate max-w-[140px]">
                    {channel.type === "encrypted" ? "Сквозное шифрование" : "Глобальный чат"}
                  </span>
                </div>
              </button>
            ))}
          </>
        )}

        {activeTab === "peers" && (
          <>
            <div className="px-3 py-2 text-xs font-semibold text-muted/50 uppercase tracking-wider flex items-center justify-between group">
              В сети ({peers.length})
              <UserPlus 
                className="w-3 h-3 cursor-pointer opacity-0 group-hover:opacity-100 hover:text-white transition-opacity" 
                onClick={() => setIsAddingContact(true)}
              />
            </div>

            {isAddingContact && (
              <div className="mx-3 mb-3 p-3 bg-surface/50 rounded-xl border border-white/10 space-y-2">
                <input
                  type="text"
                  placeholder="ID пира"
                  value={newContactId}
                  onChange={(e) => setNewContactId(e.target.value)}
                  className="w-full bg-black/20 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-muted/50 focus:border-primary/50 outline-none"
                />
                <input
                  type="text"
                  placeholder="Имя"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full bg-black/20 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-muted/50 focus:border-primary/50 outline-none"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button 
                    onClick={() => setIsAddingContact(false)}
                    className="p-1 hover:bg-white/10 rounded text-muted hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={handleSaveContact}
                    disabled={!newContactId || !newContactName}
                    className="p-1 bg-primary/20 hover:bg-primary/30 text-primary rounded disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {peers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-surface/50 flex items-center justify-center mb-3">
                  <Ghost className="w-6 h-6 text-muted/30" />
                </div>
                <p className="text-sm text-muted">Нет активных пиров.</p>
                <p className="text-xs text-muted/50 mt-1">Они появятся здесь автоматически.</p>
              </div>
            ) : (
              peers.map((peer) => (
                <button
                  key={peer}
                  onClick={() => onSelectPeer(peer)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group mb-1 border border-transparent ${
                    activePeer === peer
                      ? "bg-gradient-to-r from-primary/20 to-transparent text-white border-primary/20 shadow-lg shadow-black/20"
                      : "text-muted hover:bg-white/5 hover:text-white hover:border-white/5"
                  }`}
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-surface-light to-surface border border-white/10 flex items-center justify-center font-bold text-xs text-white/80 shadow-md group-hover:scale-105 transition-transform duration-300">
                      {getPeerDisplayName(peer).substring(0, 2).toUpperCase()}
                    </div>
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-[#181625] shadow-sm" />
                  </div>
                  <div className="flex flex-col items-start flex-1 min-w-0">
                    <span className={`font-medium text-sm truncate w-full text-left transition-colors ${activePeer === peer ? "text-white" : "text-muted-foreground group-hover:text-white"}`}>
                      {getPeerDisplayName(peer)}
                    </span>
                    <span className="text-[10px] text-muted/60 flex items-center gap-1 w-full group-hover:text-muted/80 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
                      {isContact(peer) ? (
                        <span className="truncate">ID: {peer.substring(0, 8)}...</span>
                      ) : (
                        "В сети"
                      )}
                    </span>
                  </div>
                  {!isContact(peer) && (
                    <div 
                      className="opacity-0 group-hover:opacity-100 transition-all duration-300 p-2 hover:bg-primary/20 rounded-lg text-muted hover:text-primary active:scale-90"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewContactId(peer);
                        setIsAddingContact(true);
                      }}
                      title="Добавить в контакты"
                    >
                      <UserPlus className="w-4 h-4" />
                    </div>
                  )}
                  {isContact(peer) && (
                    <div 
                      className="opacity-0 group-hover:opacity-100 transition-all duration-300 p-2 hover:bg-red-500/20 rounded-lg text-muted hover:text-red-500 active:scale-90"
                      onClick={(e) => {
                        e.stopPropagation();
                        if(confirm('Удалить контакт?')) onDeleteContact(peer);
                      }}
                      title="Удалить контакт"
                    >
                      <Trash2 className="w-4 h-4" />
                    </div>
                  )}
                </button>
              ))
            )}

            {/* Offline Contacts Section */}
            {contacts.length > 0 && (
              <>
                <div className="px-3 py-2 mt-4 text-xs font-semibold text-muted/50 uppercase tracking-wider">
                  Контакты ({contacts.length})
                </div>
                {contacts
                  .filter(c => !peers.includes(c.peerId)) // Only show offline contacts here
                  .map((contact) => (
                  <button
                    key={contact.peerId}
                    onClick={() => onSelectPeer(contact.peerId)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group mb-1 border border-transparent ${
                      activePeer === contact.peerId
                        ? "bg-gradient-to-r from-primary/20 to-transparent text-white border-primary/20 shadow-lg shadow-black/20"
                        : "text-muted hover:bg-white/5 hover:text-white hover:border-white/5"
                    }`}
                  >
                    <div className="relative group-hover:scale-105 transition-transform duration-300">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-surface-light to-surface border border-white/10 flex items-center justify-center font-bold text-xs text-white/50 shadow-md">
                        {contact.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-muted/50 rounded-full border-2 border-[#0b0a15]" />
                    </div>
                    <div className="flex flex-col items-start flex-1 min-w-0">
                      <span className="font-medium text-sm truncate w-full text-left">
                        {contact.name}
                      </span>
                      <span className="text-[10px] text-muted/50 flex items-center gap-1 group-hover:text-muted/70 transition-colors">
                        Не в сети
                      </span>
                    </div>
                    <div 
                      className="opacity-0 group-hover:opacity-100 transition-all duration-300 p-2 hover:bg-red-500/20 rounded-lg text-muted hover:text-red-500 active:scale-90"
                      onClick={(e) => {
                        e.stopPropagation();
                        if(confirm('Удалить контакт?')) onDeleteContact(contact.peerId);
                      }}
                      title="Удалить контакт"
                    >
                      <Trash2 className="w-4 h-4" />
                    </div>
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* User Footer */}
      <div className="p-4 border-t border-white/5 bg-black/20">
        <button 
           onClick={() => setIsSettingsOpen(true)}
           className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-white/10 group-hover:scale-105 transition-transform duration-300">
             <Settings className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col items-start flex-1 min-w-0">
             <span className="text-sm font-bold text-white truncate w-full text-left">Настройки</span>
             <span className="text-[10px] text-muted/60 truncate w-full text-left flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                В сети
             </span>
          </div>
        </button>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        localPeerId={localPeerId}
        onUpdateProfile={onUpdateProfile}
        listenAddresses={listenAddresses}
        onConnectPeer={onConnectPeer}
      />
    </div>
  );
}
