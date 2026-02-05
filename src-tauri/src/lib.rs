use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::Duration;
use tauri::{Emitter, Manager};
use libp2p::{
    gossipsub, mdns, noise, swarm::NetworkBehaviour, swarm::SwarmEvent, tcp, yamux,
    futures::StreamExt, identity,
};
use std::error::Error;
use tokio::sync::mpsc;
use tokio::select;
use std::sync::{Arc, Mutex};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce 
};
use rand::{rngs::OsRng, RngCore};
use base64::{Engine as _, engine::general_purpose};
use std::collections::HashMap;
use x25519_dalek::{StaticSecret, PublicKey};
use std::fs;

// Hardcoded key for global encrypted chat (32 bytes)
const GLOBAL_ENCRYPTION_KEY: &[u8; 32] = b"phantom-super-secret-key-2024!!!"; 

fn load_or_generate_keypair(app_handle: &tauri::AppHandle) -> Result<identity::Keypair, Box<dyn Error>> {
    let app_data_dir = app_handle.path().app_data_dir()?;
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)?;
    }
    
    let key_path = app_data_dir.join("identity.key");
    
    if key_path.exists() {
        let bytes = fs::read(&key_path)?;
        match identity::Keypair::from_protobuf_encoding(&bytes) {
            Ok(keypair) => {
                println!("Loaded existing identity from {:?}", key_path);
                return Ok(keypair);
            },
            Err(e) => {
                eprintln!("Failed to load identity key: {}. Generating new one.", e);
            }
        }
    }
    
    let keypair = identity::Keypair::generate_ed25519();
    let bytes = keypair.to_protobuf_encoding()?;
    fs::write(&key_path, bytes)?;
    println!("Generated and saved new identity to {:?}", key_path);
    
    Ok(keypair)
}

fn load_or_generate_ecdh_key(app_handle: &tauri::AppHandle) -> Result<StaticSecret, Box<dyn Error>> {
    let app_data_dir = app_handle.path().app_data_dir()?;
    let key_path = app_data_dir.join("ecdh.key");

    if key_path.exists() {
        let bytes = fs::read(&key_path)?;
        if bytes.len() == 32 {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            return Ok(StaticSecret::from(arr));
        }
    }

    let secret = StaticSecret::random_from_rng(OsRng);
    fs::write(&key_path, secret.to_bytes())?;
    println!("Generated and saved new ECDH key to {:?}", key_path);
    Ok(secret)
}

fn encrypt_message(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let nonce = Nonce::from_slice(&nonce);
    
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;
    
    let mut combined = nonce.to_vec();
    combined.extend(ciphertext);
    
    Ok(general_purpose::STANDARD.encode(combined))
}

fn decrypt_message(encrypted_msg: &str, key: &[u8; 32]) -> Result<String, String> {
    let decoded = general_purpose::STANDARD.decode(encrypted_msg)
        .map_err(|e| e.to_string())?;
    
    if decoded.len() < 12 {
        return Err("Message too short".to_string());
    }
    
    let (nonce_bytes, ciphertext_bytes) = decoded.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new(key.into());
    
    let plaintext = cipher.decrypt(nonce, ciphertext_bytes)
        .map_err(|e| e.to_string())?;
        
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum P2PMessage {
    Handshake { pub_key: String, is_reply: bool },
    Message { content: String },
    Typing { is_typing: bool },
}

// Define the Network Behaviour
#[derive(NetworkBehaviour)]
struct MyBehaviour {
    gossipsub: gossipsub::Behaviour,
    mdns: mdns::tokio::Behaviour,
}

struct P2PState {
    tx: mpsc::Sender<(String, String)>,
    local_peer_id: Arc<Mutex<Option<String>>>,
    shared_keys: Arc<Mutex<HashMap<String, [u8; 32]>>>,
    ecdh_key: Arc<Mutex<StaticSecret>>,
    listen_addresses: Arc<Mutex<Vec<String>>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_local_peer_id(state: tauri::State<'_, P2PState>) -> String {
    let id = state.local_peer_id.lock().unwrap();
    id.clone().unwrap_or_else(|| "Initializing...".to_string())
}

#[tauri::command]
fn get_listen_addresses(state: tauri::State<'_, P2PState>) -> Vec<String> {
    let addrs = state.listen_addresses.lock().unwrap();
    addrs.clone()
}

#[tauri::command]
async fn send_message(channel: String, message: String, state: tauri::State<'_, P2PState>) -> Result<(), String> {
    // Check if channel is a PeerID (simple heuristic: starts with 12D or similar, or just check length)
    // Ed25519 PeerIDs are usually ~52 chars in base58.
    // Topics are usually kebab-case words.
    
    // Better heuristic: if it's NOT a known channel.
    if channel != "global-gossip" && channel != "phantom-global" && channel != "encrypted-chat" {
        // Assume 1-on-1
        let peer_id = channel.clone();
        
        // Scope the lock to get the secret
        let secret_opt = {
            let keys = state.shared_keys.lock().map_err(|e| e.to_string())?;
            keys.get(&peer_id).copied()
        };
        
        if let Some(secret) = secret_opt {
             let encrypted = encrypt_message(&message, &secret)?;
             let msg_struct = P2PMessage::Message { content: encrypted };
             let json = serde_json::to_string(&msg_struct).map_err(|e| e.to_string())?;
             
             // Send via tx to the P2P loop to publish
             state.tx.send((peer_id, json)).await.map_err(|e| e.to_string())?;
             return Ok(());
        } else {
             // No key, initiate handshake
             // Scope the lock to get the ECDH key
             let (my_pub_hex, _my_pub_bytes) = {
                let ecdh_key = state.ecdh_key.lock().map_err(|_| "Failed to lock ECDH key".to_string())?;
                let my_pub = PublicKey::from(&*ecdh_key);
                (hex::encode(my_pub.as_bytes()), *my_pub.as_bytes())
             };
             
             let handshake = P2PMessage::Handshake { pub_key: my_pub_hex, is_reply: false };
             let json = serde_json::to_string(&handshake).map_err(|e| e.to_string())?;
             
             // Send handshake
             state.tx.send((peer_id.clone(), json)).await.map_err(|e| e.to_string())?;
             
             return Err("Establishing secure connection (Handshake sent). Please retry in a moment.".to_string());
        }
    }

    state.tx.send((channel, message)).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn send_typing_indicator(channel: String, is_typing: bool, state: tauri::State<'_, P2PState>) -> Result<(), String> {
    if channel == "global-gossip" || channel == "phantom-global" || channel == "encrypted-chat" {
        // Typing indicators only supported for 1-on-1 for now to avoid spam
        return Ok(());
    }

    let peer_id = channel;
    
    // Scope the lock to get the secret
    let secret_opt = {
        let keys = state.shared_keys.lock().map_err(|e| e.to_string())?;
        keys.get(&peer_id).copied()
    };

    if let Some(_secret) = secret_opt {
        // Encrypt the typing status? Not strictly necessary, but good for privacy metadata.
        // Actually, P2PMessage::Typing has no sensitive content, but we wrap it in encryption if we want to be consistent?
        // Wait, the `P2PMessage` structure is the container. 
        // If we want to hide that we are typing, we should encrypt the whole P2PMessage?
        // Current architecture: `P2PMessage` is the payload.
        // `send_message` encrypts the content inside `P2PMessage::Message`.
        // So `Typing` is visible as a type.
        // To fix this properly, we should encrypt the serialized P2PMessage.
        // But for now, let's just send it.
        
        let msg_struct = P2PMessage::Typing { is_typing };
        let json = serde_json::to_string(&msg_struct).map_err(|e| e.to_string())?;
        
        // Send via tx
        state.tx.send((peer_id, json)).await.map_err(|e| e.to_string())?;
    }
    // If no key, we don't send typing indicators (handshake needed first)
    
    Ok(())
}

#[tauri::command]
async fn connect_peer(addr: String, state: tauri::State<'_, P2PState>) -> Result<(), String> {
    state.tx.send(("cmd:dial".to_string(), addr)).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let (tx, rx) = mpsc::channel(32);
            let local_peer_id = Arc::new(Mutex::new(None));
            let shared_keys = Arc::new(Mutex::new(HashMap::new()));
            let listen_addresses = Arc::new(Mutex::new(Vec::new()));
            
            // Load ECDH key
            let ecdh_key = load_or_generate_ecdh_key(app.handle()).expect("Failed to load ECDH key");
            let ecdh_key_arc = Arc::new(Mutex::new(ecdh_key.clone()));

            app.manage(P2PState { 
                tx, 
                local_peer_id: local_peer_id.clone(),
                shared_keys: shared_keys.clone(),
                ecdh_key: ecdh_key_arc.clone(),
                listen_addresses: listen_addresses.clone(),
            });

            let handle = app.handle().clone();
            
            // Spawn the P2P task
            tauri::async_runtime::spawn(async move {
                if let Err(e) = run_p2p_node(handle, rx, local_peer_id, shared_keys, ecdh_key, listen_addresses).await {
                    eprintln!("P2P Node Error: {:?}", e);
                }
            });
            
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet, send_message, get_local_peer_id, send_typing_indicator, connect_peer, get_listen_addresses])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn run_p2p_node(
    app: tauri::AppHandle, 
    mut rx: mpsc::Receiver<(String, String)>,
    peer_id_store: Arc<Mutex<Option<String>>>,
    shared_keys: Arc<Mutex<HashMap<String, [u8; 32]>>>,
    ecdh_key: StaticSecret,
    listen_addr_store: Arc<Mutex<Vec<String>>>,
) -> Result<(), Box<dyn Error>> {
    let local_key = load_or_generate_keypair(&app)?;

    let mut swarm = libp2p::SwarmBuilder::with_existing_identity(local_key)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )?
        .with_behaviour(|key| {
            // Gossipsub configuration
            let message_id_fn = |message: &gossipsub::Message| {
                let mut s = DefaultHasher::new();
                message.data.hash(&mut s);
                gossipsub::MessageId::from(s.finish().to_string())
            };
            let gossipsub_config = gossipsub::ConfigBuilder::default()
                .heartbeat_interval(Duration::from_secs(10)) 
                .validation_mode(gossipsub::ValidationMode::Strict)
                .message_id_fn(message_id_fn) 
                .build()
                .map_err(|msg| std::io::Error::new(std::io::ErrorKind::Other, msg))?; 

            let gossipsub = gossipsub::Behaviour::new(
                gossipsub::MessageAuthenticity::Signed(key.clone()),
                gossipsub_config,
            )?;

            // MDNS configuration
            let mdns = mdns::tokio::Behaviour::new(
                mdns::Config::default(),
                key.public().to_peer_id()
            )?;

            Ok(MyBehaviour { gossipsub, mdns })
        })?
        .build();

    // Subscribe to topics
    let topic_global = gossipsub::IdentTopic::new("phantom-global");
    let topic_encrypted = gossipsub::IdentTopic::new("encrypted-chat");
    let local_peer_id_str = swarm.local_peer_id().to_string();
    let topic_inbox = gossipsub::IdentTopic::new(format!("inbox-{}", local_peer_id_str));
    
    swarm.behaviour_mut().gossipsub.subscribe(&topic_global)?;
    swarm.behaviour_mut().gossipsub.subscribe(&topic_encrypted)?;
    swarm.behaviour_mut().gossipsub.subscribe(&topic_inbox)?;

    // Listen on all interfaces
    swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse()?)?;

    let local_peer_id = swarm.local_peer_id().to_string();
    println!("Local Peer ID: {}", local_peer_id);
    
    // Store ID in state
    *peer_id_store.lock().unwrap() = Some(local_peer_id.clone());
    
    // Emit event just in case UI is already listening
    let _ = app.emit("local-peer-id", local_peer_id.clone());

    // Event Loop
    loop {
        select! {
            event = swarm.select_next_some() => match event {
                SwarmEvent::NewListenAddr { address, .. } => {
                     println!("Listening on {:?}", address);
                     let addr_str = address.to_string();
                     // Store in state
                     listen_addr_store.lock().unwrap().push(addr_str.clone());
                     let _ = app.emit("listen-address", addr_str);
                }
                SwarmEvent::Behaviour(MyBehaviourEvent::Mdns(mdns::Event::Discovered(list))) => {
                    for (peer_id, _multiaddr) in list {
                        println!("mDNS discovered a new peer: {peer_id}");
                        swarm.behaviour_mut().gossipsub.add_explicit_peer(&peer_id);
                        let _ = app.emit("peer-discovered", peer_id.to_string());
                    }
                }
                SwarmEvent::Behaviour(MyBehaviourEvent::Mdns(mdns::Event::Expired(list))) => {
                    for (peer_id, _multiaddr) in list {
                        println!("mDNS discover peer has expired: {peer_id}");
                        swarm.behaviour_mut().gossipsub.remove_explicit_peer(&peer_id);
                        let _ = app.emit("peer-expired", peer_id.to_string());
                    }
                }
                SwarmEvent::Behaviour(MyBehaviourEvent::Gossipsub(gossipsub::Event::Message {
                    propagation_source: peer_id,
                    message_id: _id,
                    message,
                })) => {
                    let msg_content = String::from_utf8_lossy(&message.data);
                    let topic_hash = message.topic;
                    
                    let mut channel = "unknown";
                    let mut final_content = msg_content.to_string();
                    let sender_id = peer_id.to_string();

                    if topic_hash == topic_global.hash() {
                        channel = "phantom-global";
                    } else if topic_hash == topic_encrypted.hash() {
                        channel = "encrypted-chat";
                        final_content = match decrypt_message(&msg_content, GLOBAL_ENCRYPTION_KEY) {
                             Ok(decrypted) => decrypted,
                             Err(_) => format!("(Encrypted: {})", msg_content),
                        };
                    } else if topic_hash == topic_inbox.hash() {
                        // Private message or Handshake!
                        channel = &sender_id; // For UI, channel is the sender ID
                        
                        // Parse JSON
                        if let Ok(p2p_msg) = serde_json::from_str::<P2PMessage>(&msg_content) {
                            match p2p_msg {
                                P2PMessage::Handshake { pub_key, is_reply } => {
                                    println!("Received Handshake from {}", sender_id);
                                    if let Ok(their_pub_bytes) = hex::decode(pub_key) {
                                        if their_pub_bytes.len() == 32 {
                                            let mut arr = [0u8; 32];
                                            arr.copy_from_slice(&their_pub_bytes);
                                            let their_pub = PublicKey::from(arr);
                                            let shared = ecdh_key.diffie_hellman(&their_pub);
                                            
                                            // Store shared secret
                                            shared_keys.lock().unwrap().insert(sender_id.clone(), *shared.as_bytes());
                                            println!("Shared secret established with {}", sender_id);
                                            let _ = app.emit("handshake-complete", sender_id.clone());

                                            if !is_reply {
                                                // Send Handshake Ack (Reply)
                                                let my_pub = PublicKey::from(&ecdh_key);
                                                let my_pub_hex = hex::encode(my_pub.as_bytes());
                                                let reply = P2PMessage::Handshake { pub_key: my_pub_hex, is_reply: true };
                                                let reply_json = serde_json::to_string(&reply).unwrap();
                                                
                                                // Send back to their inbox
                                                let reply_topic = gossipsub::IdentTopic::new(format!("inbox-{}", sender_id));
                                                let _ = swarm.behaviour_mut().gossipsub.publish(reply_topic, reply_json.as_bytes().to_vec());
                                            }
                                            
                                            // Don't emit message to UI yet
                                            continue; 
                                        }
                                    }
                                },
                                P2PMessage::Message { content } => {
                                    // Decrypt
                                    if let Some(secret) = shared_keys.lock().unwrap().get(&sender_id) {
                                        match decrypt_message(&content, secret) {
                                            Ok(decrypted) => {
                                                final_content = decrypted;
                                            },
                                            Err(e) => {
                                                final_content = format!("(Decryption Failed: {})", e);
                                            }
                                        }
                                    } else {
                                        final_content = "(No shared key established)".to_string();
                                    }
                                },
                                P2PMessage::Typing { is_typing } => {
                                    let payload = serde_json::json!({
                                        "peerId": sender_id,
                                        "isTyping": is_typing
                                    });
                                    let _ = app.emit("peer-typing", payload.to_string());
                                    continue; // Don't process as a chat message
                                }
                            }
                        } else {
                            final_content = format!("(Unknown Format: {})", msg_content);
                        }
                    }

                    println!("Got message on channel {}: {}", channel, final_content);
                    
                    let payload = serde_json::json!({
                        "sender": peer_id.to_string(),
                        "content": final_content,
                        "channel": channel
                    });
                    let _ = app.emit("new-message", payload.to_string());
                }
                _ => {}
            },
            Some((channel, msg)) = rx.recv() => {
                if channel == "cmd:dial" {
                    if let Ok(addr) = msg.parse::<libp2p::Multiaddr>() {
                         println!("Dialing {}", addr);
                         let _ = swarm.dial(addr);
                    } else {
                        eprintln!("Invalid multiaddr: {}", msg);
                    }
                    continue;
                }

                // Determine topic
                // If channel is a peer ID (long string), it's a private message handled in send_message
                // But send_message passes JSON for private messages.
                // Wait, `send_message` in my previous edit calls `state.tx.send`.
                // If it's a private message, `msg` is the JSON P2PMessage.
                // `channel` is the PeerID.
                
                let topic_str = if channel == "global-gossip" { 
                    "phantom-global".to_string()
                } else if channel == "encrypted-chat" {
                    "encrypted-chat".to_string()
                } else {
                    // It's a PeerID
                    format!("inbox-{}", channel)
                };
                
                let topic = gossipsub::IdentTopic::new(&topic_str);

                let msg_to_publish = if topic_str == "encrypted-chat" {
                    match encrypt_message(&msg, GLOBAL_ENCRYPTION_KEY) {
                        Ok(encrypted) => encrypted,
                        Err(e) => {
                            eprintln!("Encryption error: {}", e);
                            msg.clone() 
                        }
                    }
                } else {
                    // It's either global (plain) or private (already JSON encoded in send_message)
                    msg.clone()
                };

                if let Err(e) = swarm.behaviour_mut().gossipsub.publish(topic, msg_to_publish.as_bytes().to_vec()) {
                     println!("Publish error: {:?}", e);
                } else {
                     // Only emit to UI if it's NOT a handshake
                     // Check if it looks like JSON handshake?
                     let is_handshake = msg.contains("\"type\":\"handshake\"");
                     
                     if !is_handshake {
                        // For UI, we need to show what we sent.
                        // If private, we sent P2PMessage::Message { content: encrypted }.
                        // We want to show plaintext in UI.
                        // But `msg` here is the encrypted JSON or plain text.
                        // If channel is private, we can't easily get plaintext back here unless we passed it.
                        // But `send_message` optimistically updates UI? 
                        // Actually `App.tsx` optimistically updates UI.
                        // So we don't strictly need to emit "new-message" for self.
                        // But existing code did:
                        /*
                            let payload = serde_json::json!({
                                "sender": local_peer_id,
                                "content": msg,
                                "channel": topic_str
                            });
                            let _ = app.emit("new-message", payload.to_string());
                        */
                        // If we keep this, we might double-show or show encrypted.
                        // Let's remove self-emit for private messages or ensure it's clean.
                        // `App.tsx` handles optimistic update.
                        // Backend echo is good for confirmation, but `gossipsub` publish is async fire-and-forget.
                     }
                }
            }
        }
    }
}
