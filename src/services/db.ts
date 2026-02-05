import Database from "@tauri-apps/plugin-sql";

const DB_NAME = "phantom_chat.db";

export interface DBMessage {
  id?: number;
  uuid?: string;
  sender: string;
  content: string;
  channel: string;
  timestamp: number;
  replyTo?: string; // JSON string of { sender, content }
  type: 'text' | 'image' | 'file' | 'audio';
  status: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: string; // JSON string of Record<string, string[]> (emoji -> peerIds)
  lastEdited?: number;
  fileName?: string;
  fileSize?: string;
}

export interface DBContact {
  peerId: string;
  name: string;
  addedAt: number;
}

class DBService {
  private db: Database | null = null;

  async init() {
    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) {
      console.log("Skipping database initialization in browser mode");
      return;
    }

    try {
      this.db = await Database.load(`sqlite:${DB_NAME}`);
      await this.initTables();
      console.log("Database initialized successfully");
    } catch (error) {
      console.error("Failed to initialize database:", error);
    }
  }

  private async initTables() {
    if (!this.db) return;

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        channel TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        replyTo TEXT,
        type TEXT DEFAULT 'text',
        status TEXT DEFAULT 'sent',
        reactions TEXT DEFAULT '{}',
        lastEdited INTEGER,
        fileName TEXT,
        fileSize TEXT
      )
    `);

    // Migration for existing tables
    const migrations = [
       "ALTER TABLE messages ADD COLUMN replyTo TEXT",
       "ALTER TABLE messages ADD COLUMN uuid TEXT",
       "ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text'",
       "ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'sent'",
       "ALTER TABLE messages ADD COLUMN reactions TEXT DEFAULT '{}'",
       "ALTER TABLE messages ADD COLUMN lastEdited INTEGER",
       "ALTER TABLE messages ADD COLUMN fileName TEXT",
       "ALTER TABLE messages ADD COLUMN fileSize TEXT"
    ];

    for (const query of migrations) {
        try {
           await this.db.execute(query);
        } catch (e) {
           // Ignore error if column already exists
        }
    }

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS contacts (
        peerId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        addedAt INTEGER NOT NULL
      )
    `);
    
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  async saveMessage(message: Omit<DBMessage, "id">) {
    if (!this.db) await this.init();
    
    try {
      await this.db?.execute(
        "INSERT INTO messages (uuid, sender, content, channel, timestamp, replyTo, type, status, reactions, lastEdited, fileName, fileSize) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [
            message.uuid || crypto.randomUUID(), 
            message.sender, 
            message.content, 
            message.channel, 
            message.timestamp, 
            message.replyTo || null,
            message.type || 'text',
            message.status || 'sent',
            message.reactions || '{}',
            message.lastEdited || null,
            message.fileName || null,
            message.fileSize || null
        ]
      );
    } catch (error) {
      console.error("Failed to save message:", error);
    }
  }

  async updateMessageStatus(uuid: string, status: string) {
      if (!this.db) await this.init();
      try {
          await this.db?.execute("UPDATE messages SET status = $1 WHERE uuid = $2", [status, uuid]);
      } catch (e) {
          console.error("Failed to update message status:", e);
      }
  }
  
  async updateMessageContent(uuid: string, content: string) {
      if (!this.db) await this.init();
      try {
          await this.db?.execute("UPDATE messages SET content = $1, lastEdited = $2 WHERE uuid = $3", [content, Date.now(), uuid]);
      } catch (e) {
          console.error("Failed to update message content:", e);
      }
  }

  async updateMessageReactions(uuid: string, reactions: string) {
      if (!this.db) await this.init();
      try {
          await this.db?.execute("UPDATE messages SET reactions = $1 WHERE uuid = $2", [reactions, uuid]);
      } catch (e) {
          console.error("Failed to update message reactions:", e);
      }
  }

  async deleteMessage(uuid: string) {
      if (!this.db) await this.init();
      try {
          await this.db?.execute("DELETE FROM messages WHERE uuid = $1", [uuid]);
      } catch (e) {
          console.error("Failed to delete message:", e);
      }
  }

  async getMessages(channel: string): Promise<DBMessage[]> {
    if (!this.db) await this.init();

    try {
      return await this.db?.select<DBMessage[]>(
        "SELECT * FROM messages WHERE channel = $1 ORDER BY timestamp ASC",
        [channel]
      ) || [];
    } catch (error) {
      console.error("Failed to get messages:", error);
      return [];
    }
  }
  
  async getSetting(key: string): Promise<string | null> {
      if (!this.db) await this.init();
      try {
          const result = await this.db?.select<{value: string}[]>("SELECT value FROM settings WHERE key = $1", [key]);
          return result?.[0]?.value || null;
      } catch (e) {
          return null;
      }
  }
  
  async saveSetting(key: string, value: string) {
      if (!this.db) await this.init();
      try {
          await this.db?.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)", [key, value]);
      } catch (e) {
          console.error("Failed to save setting:", e);
      }
  }

  async addContact(peerId: string, name: string) {
    if (!this.db) await this.init();

    try {
      await this.db?.execute(
        "INSERT OR REPLACE INTO contacts (peerId, name, addedAt) VALUES ($1, $2, $3)",
        [peerId, name, Date.now()]
      );
    } catch (error) {
      console.error("Failed to add contact:", error);
    }
  }

  async getContacts(): Promise<DBContact[]> {
    if (!this.db) await this.init();

    try {
      return await this.db?.select<DBContact[]>(
        "SELECT * FROM contacts ORDER BY name ASC"
      ) || [];
    } catch (error) {
      console.error("Failed to get contacts:", error);
      return [];
    }
  }

  async deleteContact(peerId: string) {
    if (!this.db) await this.init();

    try {
      await this.db?.execute(
        "DELETE FROM contacts WHERE peerId = $1",
        [peerId]
      );
    } catch (error) {
      console.error("Failed to delete contact:", error);
    }
  }
}

export const dbService = new DBService();
