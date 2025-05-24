// Datastore adapter interface for testing and production

export interface BRDSession {
  id?: string;
  user_id: number;
  chat_id: number;
  status: 'active' | 'completed' | 'exported';
  current_step?: string;
  brd_data: Record<string, any>;
  created_at?: number;
  updated_at?: number;
}

export interface Message {
  id?: string;
  user_id: number;
  chat_id: number;
  role: 'user' | 'assistant' | 'system';
  message_text: string;
  created_at?: number;
}

export interface Spec {
  id?: string;
  user_id: number;
  chat_id: number;
  session_id?: string;
  title: string;
  content: string;
  spec_type: 'project' | 'feature' | 'architecture' | 'implementation';
  metadata: Record<string, any>;
  version?: number;
  created_at?: number;
  updated_at?: number;
}

export interface DatastoreAdapter {
  // BRD Sessions
  getBRDSession(userId: number, chatId: number): Promise<BRDSession | null>;
  createBRDSession(session: Omit<BRDSession, 'id' | 'created_at' | 'updated_at'>): Promise<BRDSession | null>;
  updateBRDSession(sessionId: string, updates: Partial<BRDSession>): Promise<boolean>;
  getLatestBRDSession(userId: number, chatId: number): Promise<BRDSession | null>;
  
  // Messages
  createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<boolean>;
  
  // Specs
  createSpec(spec: Omit<Spec, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Spec | null>;
  updateSpec(specId: string, updates: Partial<Spec>): Promise<boolean>;
  getLatestSpec(userId: number, chatId: number): Promise<Spec | null>;
  getSpecsBySession(sessionId: string): Promise<Spec[]>;
  
  // Cleanup
  deleteMessages(userId: number, chatId: number): Promise<boolean>;
  deleteBRDSessions(userId: number, chatId: number): Promise<boolean>;
}

// Production adapter using Supabase
export class SupabaseDatastoreAdapter implements DatastoreAdapter {
  private supabase: any;
  
  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }
  
  async getBRDSession(userId: number, chatId: number): Promise<BRDSession | null> {
    const { data, error } = await this.supabase
      .from('brd_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .eq('status', 'active')
      .single();
      
    if (error || !data) {
      return null;
    }
    
    return data;
  }
  
  async createBRDSession(session: Omit<BRDSession, 'id' | 'created_at' | 'updated_at'>): Promise<BRDSession | null> {
    const { data, error } = await this.supabase
      .from('brd_sessions')
      .insert(session)
      .select()
      .single();
      
    if (error) {
      console.error('Error creating BRD session:', error);
      return null;
    }
    
    return data;
  }
  
  async updateBRDSession(sessionId: string, updates: Partial<BRDSession>): Promise<boolean> {
    const { error } = await this.supabase
      .from('brd_sessions')
      .update(updates)
      .eq('id', sessionId);
      
    if (error) {
      console.error('Error updating BRD session:', error);
      return false;
    }
    
    return true;
  }
  
  async getLatestBRDSession(userId: number, chatId: number): Promise<BRDSession | null> {
    const { data, error } = await this.supabase
      .from('brd_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      
    return error ? null : data;
  }
  
  async createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<boolean> {
    const { error } = await this.supabase
      .from('messages')
      .insert(message);
      
    if (error) {
      console.error('Error storing message:', error);
      return false;
    }
    
    return true;
  }
  
  async createSpec(spec: Omit<Spec, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Spec | null> {
    const { data, error } = await this.supabase
      .from('specs')
      .insert(spec)
      .select()
      .single();
      
    if (error) {
      console.error('Error creating spec:', error);
      return null;
    }
    
    return data;
  }
  
  async updateSpec(specId: string, updates: Partial<Spec>): Promise<boolean> {
    const { error } = await this.supabase
      .from('specs')
      .update(updates)
      .eq('id', specId);
      
    if (error) {
      console.error('Error updating spec:', error);
      return false;
    }
    
    return true;
  }
  
  async getLatestSpec(userId: number, chatId: number): Promise<Spec | null> {
    const { data, error } = await this.supabase
      .from('specs')
      .select('*')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      
    return error ? null : data;
  }
  
  async getSpecsBySession(sessionId: string): Promise<Spec[]> {
    const { data, error } = await this.supabase
      .from('specs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error getting specs:', error);
      return [];
    }
    
    return data || [];
  }
  
  async deleteMessages(userId: number, chatId: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('messages')
      .delete()
      .eq('user_id', userId)
      .eq('chat_id', chatId);
      
    if (error) {
      console.error('Error deleting messages:', error);
      return false;
    }
    
    return true;
  }
  
  async deleteBRDSessions(userId: number, chatId: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('brd_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('chat_id', chatId);
      
    if (error) {
      console.error('Error deleting sessions:', error);
      return false;
    }
    
    return true;
  }
}

// In-memory adapter for testing
export class InMemoryDatastoreAdapter implements DatastoreAdapter {
  private sessions: Map<string, BRDSession> = new Map();
  private messages: Message[] = [];
  private specs: Map<string, Spec> = new Map();
  private idCounter = 1;
  
  async getBRDSession(userId: number, chatId: number): Promise<BRDSession | null> {
    for (const session of this.sessions.values()) {
      if (session.user_id === userId && 
          session.chat_id === chatId && 
          session.status === 'active') {
        return session;
      }
    }
    return null;
  }
  
  async createBRDSession(session: Omit<BRDSession, 'id' | 'created_at' | 'updated_at'>): Promise<BRDSession | null> {
    const newSession: BRDSession = {
      ...session,
      id: `session_${this.idCounter++}`,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    this.sessions.set(newSession.id!, newSession);
    return newSession;
  }
  
  async updateBRDSession(sessionId: string, updates: Partial<BRDSession>): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    
    const updatedSession = { 
      ...session, 
      ...updates,
      updated_at: Date.now()
    };
    this.sessions.set(sessionId, updatedSession);
    return true;
  }
  
  async getLatestBRDSession(userId: number, chatId: number): Promise<BRDSession | null> {
    const userSessions = Array.from(this.sessions.values())
      .filter(s => s.user_id === userId && s.chat_id === chatId)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      
    return userSessions[0] || null;
  }
  
  async createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<boolean> {
    const newMessage: Message = {
      ...message,
      id: `msg_${this.idCounter++}`,
      created_at: Date.now()
    };
    
    this.messages.push(newMessage);
    return true;
  }
  
  async createSpec(spec: Omit<Spec, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Spec | null> {
    const newSpec: Spec = {
      ...spec,
      id: `spec_${this.idCounter++}`,
      version: 1,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    this.specs.set(newSpec.id!, newSpec);
    return newSpec;
  }
  
  async updateSpec(specId: string, updates: Partial<Spec>): Promise<boolean> {
    const spec = this.specs.get(specId);
    if (!spec) {
      return false;
    }
    
    const updatedSpec = { 
      ...spec, 
      ...updates,
      version: (spec.version || 1) + 1,
      updated_at: Date.now()
    };
    this.specs.set(specId, updatedSpec);
    return true;
  }
  
  async getLatestSpec(userId: number, chatId: number): Promise<Spec | null> {
    const userSpecs = Array.from(this.specs.values())
      .filter(s => s.user_id === userId && s.chat_id === chatId)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      
    return userSpecs[0] || null;
  }
  
  async getSpecsBySession(sessionId: string): Promise<Spec[]> {
    return Array.from(this.specs.values())
      .filter(s => s.session_id === sessionId)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }
  
  async deleteMessages(userId: number, chatId: number): Promise<boolean> {
    this.messages = this.messages.filter(
      m => !(m.user_id === userId && m.chat_id === chatId)
    );
    return true;
  }
  
  async deleteBRDSessions(userId: number, chatId: number): Promise<boolean> {
    for (const [id, session] of this.sessions.entries()) {
      if (session.user_id === userId && session.chat_id === chatId) {
        this.sessions.delete(id);
      }
    }
    return true;
  }
  
  // Helper methods for testing
  clear() {
    this.sessions.clear();
    this.messages = [];
    this.specs.clear();
    this.idCounter = 1;
  }
  
  getSessions(): BRDSession[] {
    return Array.from(this.sessions.values());
  }
  
  getMessages(): Message[] {
    return this.messages;
  }
  
  getSpecs(): Spec[] {
    return Array.from(this.specs.values());
  }
}