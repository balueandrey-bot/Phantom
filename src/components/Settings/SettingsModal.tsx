import { useState, useEffect } from "react";
import { X, Save, User, Key, Shield, Globe, Link as LinkIcon, Copy, Check } from "lucide-react";
import { dbService } from "../../services/db";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  localPeerId: string;
  onUpdateProfile: (name: string) => void;
  listenAddresses: string[];
  onConnectPeer: (addr: string) => void;
}

export function SettingsModal({ isOpen, onClose, localPeerId, onUpdateProfile, listenAddresses, onConnectPeer }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"profile" | "invites">("profile");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inputInviteCode, setInputInviteCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      generateInviteCode();
    }
  }, [isOpen, listenAddresses, localPeerId]);

  const generateInviteCode = () => {
    if (!localPeerId || listenAddresses.length === 0) return;
    
    // Create a simple JSON object with connection info
    // Prefer non-localhost addresses if available
    const publicAddrs = listenAddresses.filter(a => !a.includes("127.0.0.1") && !a.includes("::1"));
    const targetAddr = publicAddrs.length > 0 ? publicAddrs[0] : listenAddresses[0];
    
    // We only need one valid address to connect
    const payload = JSON.stringify({
      id: localPeerId,
      addr: targetAddr
    });
    
    // Encode to Base64 to make it look like a "Key"
    setInviteCode(btoa(payload));
  };

  const loadSettings = async () => {
    const name = await dbService.getSetting("displayName");
    if (name) setDisplayName(name);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await dbService.saveSetting("displayName", displayName);
    onUpdateProfile(displayName);
    setIsSaving(false);
    onClose();
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = () => {
    if (!inputInviteCode) return;
    
    try {
      const decoded = atob(inputInviteCode);
      const payload = JSON.parse(decoded);
      
      if (payload.addr) {
        // Construct full multiaddr with PeerID for secure verification
        const fullAddr = payload.addr.includes("/p2p/") 
          ? payload.addr 
          : payload.id ? `${payload.addr}/p2p/${payload.id}` : payload.addr;
          
        onConnectPeer(fullAddr);
        alert(`Подключение к ${payload.id?.substring(0,8)}... инициировано`);
        setInputInviteCode("");
        onClose();
      } else {
        alert("Неверный формат инвайт-кода (нет адреса)");
      }
    } catch (e) {
      // Fallback: maybe they pasted a raw multiaddr?
      if (inputInviteCode.startsWith("/")) {
         onConnectPeer(inputInviteCode);
         onClose();
      } else {
         alert("Ошибка чтения инвайт-кода");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[520px] bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Настройки
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-muted hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex px-6 pt-4 gap-4 border-b border-white/5">
          <button
            onClick={() => setActiveTab("profile")}
            className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
              activeTab === "profile" ? "text-primary" : "text-muted hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Профиль
            </div>
            {activeTab === "profile" && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("invites")}
            className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
              activeTab === "invites" ? "text-primary" : "text-muted hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Приглашения
            </div>
            {activeTab === "invites" && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {activeTab === "profile" ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted">Отображаемое имя</label>
                <div className="relative">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Введите ваше имя..."
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-muted/40 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                  <User className="absolute right-4 top-3.5 w-5 h-5 text-muted/50" />
                </div>
                <p className="text-xs text-muted/60">Это имя будут видеть другие пользователи вместо вашего PeerID.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted">Ваш PeerID (Ключ сети)</label>
                <div className="relative group">
                  <div className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-muted font-mono text-xs break-all cursor-copy hover:bg-black/50 transition-colors select-all">
                    {localPeerId}
                  </div>
                  <Key className="absolute right-4 top-3.5 w-4 h-4 text-muted/30 group-hover:text-primary transition-colors" />
                </div>
                <p className="text-xs text-muted/60 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-success" />
                  Используется для сквозного шифрования (E2EE)
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted">Ваш инвайт-код</label>
                <div className="relative">
                  <div className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 pr-12 text-muted font-mono text-xs break-all h-24 overflow-y-auto custom-scrollbar select-all">
                    {inviteCode || "Генерация..."}
                  </div>
                  <button 
                    onClick={handleCopyInvite}
                    className="absolute right-2 top-2 p-2 hover:bg-white/10 rounded-lg text-muted hover:text-white transition-colors"
                    title="Копировать код"
                  >
                    {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted/60">Отправьте этот код другу, чтобы он мог добавить вас.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted">Добавить друга</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={inputInviteCode}
                      onChange={(e) => setInputInviteCode(e.target.value)}
                      placeholder="Вставьте инвайт-код..."
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-muted/40 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono text-xs"
                    />
                    <Globe className="absolute right-4 top-3.5 w-5 h-5 text-muted/50" />
                  </div>
                  <button
                    onClick={handleConnect}
                    disabled={!inputInviteCode}
                    className="px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <LinkIcon className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-muted/60">Вставьте код, полученный от друга.</p>
              </div>
            </div>
          )}
        </div>

        {activeTab === "profile" && (
          <div className="p-6 pt-0 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary to-purple-600 text-white font-medium rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:from-primary-hover hover:to-purple-500 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Сохранение..." : "Сохранить изменения"}
              {!isSaving && <Save className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
