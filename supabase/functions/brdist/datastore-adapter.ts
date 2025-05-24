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
  getAllBRDSessions(userId: number, chatId: number): Promise<BRDSession[]>;
  
  // Messages
  createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<boolean>;
  getMessages(userId: number, chatId: number): Promise<Message[]>;
  
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
    console.log(`[${new Date().toISOString()}] SupabaseDatastoreAdapter initialized with client:`, {
      url: supabaseClient?.supabaseUrl || 'unknown',
      hasAuthHeader: !!supabaseClient?.headers?.Authorization
    });
  }
  
  async getBRDSession(userId: number, chatId: number): Promise<BRDSession | null> {
    console.log(`[${new Date().toISOString()}] getBRDSession called with:`, { userId, chatId });
    
    try {
      const { data, error } = await this.supabase
        .from('brd_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .eq('status', 'active')
        .single();
      
      console.log(`[${new Date().toISOString()}] getBRDSession query result:`, {
        hasData: !!data,
        error: error ? { message: error.message, code: error.code, details: error.details } : null,
        dataPreview: data ? { id: data.id, status: data.status, current_step: data.current_step } : null
      });
      
      if (error || !data) {
        console.log(`[${new Date().toISOString()}] getBRDSession returning null due to:`, error ? 'error' : 'no data');
        return null;
      }
      
      return data;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] getBRDSession unexpected error:`, e);
      return null;
    }
  }
  
  async createBRDSession(session: Omit<BRDSession, 'id' | 'created_at' | 'updated_at'>): Promise<BRDSession | null> {
    console.log(`[${new Date().toISOString()}] createBRDSession called with input:`, {
      user_id: session.user_id,
      chat_id: session.chat_id,
      status: session.status,
      current_step: session.current_step,
      brd_data_keys: Object.keys(session.brd_data || {}),
      brd_data: session.brd_data
    });
    
    try {
      console.log(`[${new Date().toISOString()}] Executing createBRDSession insert query...`);
      
      const { data, error } = await this.supabase
        .from('brd_sessions')
        .insert(session)
        .select()
        .single();
      
      console.log(`[${new Date().toISOString()}] createBRDSession query result:`, {
        hasData: !!data,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          statusCode: error.statusCode
        } : null,
        createdSession: data ? {
          id: data.id,
          status: data.status,
          created_at: data.created_at,
          user_id: data.user_id,
          chat_id: data.chat_id
        } : null
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error creating BRD session - Full error object:`, JSON.stringify(error, null, 2));
        console.error(`[${new Date().toISOString()}] Session data that failed to insert:`, JSON.stringify(session, null, 2));
        return null;
      }
      
      console.log(`[${new Date().toISOString()}] Successfully created BRD session with ID:`, data?.id);
      return data;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] createBRDSession unexpected error:`, e);
      console.error(`[${new Date().toISOString()}] Stack trace:`, e instanceof Error ? e.stack : 'No stack trace');
      return null;
    }
  }
  
  async updateBRDSession(sessionId: string, updates: Partial<BRDSession>): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] updateBRDSession called with:`, {
      sessionId,
      updateKeys: Object.keys(updates),
      updates
    });
    
    try {
      const { error } = await this.supabase
        .from('brd_sessions')
        .update(updates)
        .eq('id', sessionId);
      
      console.log(`[${new Date().toISOString()}] updateBRDSession query result:`, {
        success: !error,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details
        } : null
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error updating BRD session:`, JSON.stringify(error, null, 2));
        return false;
      }
      
      console.log(`[${new Date().toISOString()}] Successfully updated BRD session:`, sessionId);
      return true;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] updateBRDSession unexpected error:`, e);
      return false;
    }
  }
  
  async getLatestBRDSession(userId: number, chatId: number): Promise<BRDSession | null> {
    console.log(`[${new Date().toISOString()}] getLatestBRDSession called with:`, { userId, chatId });
    
    try {
      const { data, error } = await this.supabase
        .from('brd_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      console.log(`[${new Date().toISOString()}] getLatestBRDSession query result:`, {
        hasData: !!data,
        error: error ? { message: error.message, code: error.code } : null,
        sessionPreview: data ? {
          id: data.id,
          status: data.status,
          created_at: data.created_at
        } : null
      });
      
      return error ? null : data;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] getLatestBRDSession unexpected error:`, e);
      return null;
    }
  }
  
  async getAllBRDSessions(userId: number, chatId: number): Promise<BRDSession[]> {
    console.log(`[${new Date().toISOString()}] getAllBRDSessions called with:`, { userId, chatId });
    
    try {
      const { data, error } = await this.supabase
        .from('brd_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false });
      
      console.log(`[${new Date().toISOString()}] getAllBRDSessions query result:`, {
        sessionCount: data?.length || 0,
        error: error ? { message: error.message, code: error.code } : null,
        sessionPreviews: data ? data.map(s => ({
          id: s.id,
          status: s.status,
          created_at: s.created_at
        })) : []
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error getting all BRD sessions:`, JSON.stringify(error, null, 2));
        return [];
      }
      
      return data || [];
    } catch (e) {
      console.error(`[${new Date().toISOString()}] getAllBRDSessions unexpected error:`, e);
      return [];
    }
  }
  
  async createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] createMessage called with:`, {
      user_id: message.user_id,
      chat_id: message.chat_id,
      role: message.role,
      message_preview: message.message_text.substring(0, 100) + (message.message_text.length > 100 ? '...' : '')
    });
    
    try {
      const { error } = await this.supabase
        .from('messages')
        .insert(message);
      
      console.log(`[${new Date().toISOString()}] createMessage query result:`, {
        success: !error,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details
        } : null
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error storing message:`, JSON.stringify(error, null, 2));
        return false;
      }
      
      console.log(`[${new Date().toISOString()}] Successfully created message`);
      return true;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] createMessage unexpected error:`, e);
      return false;
    }
  }
  
  async getMessages(userId: number, chatId: number): Promise<Message[]> {
    console.log(`[${new Date().toISOString()}] getMessages called with:`, { userId, chatId });
    
    try {
      const { data, error } = await this.supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      
      console.log(`[${new Date().toISOString()}] getMessages query result:`, {
        messageCount: data?.length || 0,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details
        } : null,
        messagePreviews: data ? data.slice(0, 3).map(m => ({
          id: m.id,
          role: m.role,
          preview: m.message_text.substring(0, 50) + (m.message_text.length > 50 ? '...' : ''),
          created_at: m.created_at
        })) : []
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error getting messages:`, JSON.stringify(error, null, 2));
        return [];
      }
      
      console.log(`[${new Date().toISOString()}] Successfully retrieved ${data?.length || 0} messages for user ${userId} in chat ${chatId}`);
      return data || [];
    } catch (e) {
      console.error(`[${new Date().toISOString()}] getMessages unexpected error:`, e);
      return [];
    }
  }
  
  async createSpec(spec: Omit<Spec, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Spec | null> {
    console.log(`[${new Date().toISOString()}] createSpec called with:`, {
      user_id: spec.user_id,
      chat_id: spec.chat_id,
      session_id: spec.session_id,
      title: spec.title,
      spec_type: spec.spec_type,
      metadata_keys: Object.keys(spec.metadata || {})
    });
    
    try {
      const { data, error } = await this.supabase
        .from('specs')
        .insert(spec)
        .select()
        .single();
      
      console.log(`[${new Date().toISOString()}] createSpec query result:`, {
        hasData: !!data,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details
        } : null,
        createdSpec: data ? {
          id: data.id,
          title: data.title,
          version: data.version
        } : null
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error creating spec:`, JSON.stringify(error, null, 2));
        return null;
      }
      
      console.log(`[${new Date().toISOString()}] Successfully created spec with ID:`, data?.id);
      return data;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] createSpec unexpected error:`, e);
      return null;
    }
  }
  
  async updateSpec(specId: string, updates: Partial<Spec>): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] updateSpec called with:`, {
      specId,
      updateKeys: Object.keys(updates)
    });
    
    try {
      const { error } = await this.supabase
        .from('specs')
        .update(updates)
        .eq('id', specId);
      
      console.log(`[${new Date().toISOString()}] updateSpec query result:`, {
        success: !error,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details
        } : null
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error updating spec:`, JSON.stringify(error, null, 2));
        return false;
      }
      
      console.log(`[${new Date().toISOString()}] Successfully updated spec:`, specId);
      return true;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] updateSpec unexpected error:`, e);
      return false;
    }
  }
  
  async getLatestSpec(userId: number, chatId: number): Promise<Spec | null> {
    console.log(`[${new Date().toISOString()}] getLatestSpec called with:`, { userId, chatId });
    
    try {
      const { data, error } = await this.supabase
        .from('specs')
        .select('*')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      console.log(`[${new Date().toISOString()}] getLatestSpec query result:`, {
        hasData: !!data,
        error: error ? { message: error.message, code: error.code } : null,
        specPreview: data ? {
          id: data.id,
          title: data.title,
          spec_type: data.spec_type
        } : null
      });
      
      return error ? null : data;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] getLatestSpec unexpected error:`, e);
      return null;
    }
  }
  
  async getSpecsBySession(sessionId: string): Promise<Spec[]> {
    console.log(`[${new Date().toISOString()}] getSpecsBySession called with sessionId:`, sessionId);
    
    try {
      const { data, error } = await this.supabase
        .from('specs')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
      
      console.log(`[${new Date().toISOString()}] getSpecsBySession query result:`, {
        specCount: data?.length || 0,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details
        } : null,
        specTitles: data?.map(s => s.title) || []
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error getting specs:`, JSON.stringify(error, null, 2));
        return [];
      }
      
      return data || [];
    } catch (e) {
      console.error(`[${new Date().toISOString()}] getSpecsBySession unexpected error:`, e);
      return [];
    }
  }
  
  async deleteMessages(userId: number, chatId: number): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] deleteMessages called with:`, { userId, chatId });
    
    try {
      const { error } = await this.supabase
        .from('messages')
        .delete()
        .eq('user_id', userId)
        .eq('chat_id', chatId);
      
      console.log(`[${new Date().toISOString()}] deleteMessages query result:`, {
        success: !error,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details
        } : null
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error deleting messages:`, JSON.stringify(error, null, 2));
        return false;
      }
      
      console.log(`[${new Date().toISOString()}] Successfully deleted messages for user ${userId} in chat ${chatId}`);
      return true;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] deleteMessages unexpected error:`, e);
      return false;
    }
  }
  
  async deleteBRDSessions(userId: number, chatId: number): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] deleteBRDSessions called with:`, { userId, chatId });
    
    try {
      const { error } = await this.supabase
        .from('brd_sessions')
        .delete()
        .eq('user_id', userId)
        .eq('chat_id', chatId);
      
      console.log(`[${new Date().toISOString()}] deleteBRDSessions query result:`, {
        success: !error,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details
        } : null
      });
      
      if (error) {
        console.error(`[${new Date().toISOString()}] Error deleting sessions:`, JSON.stringify(error, null, 2));
        return false;
      }
      
      console.log(`[${new Date().toISOString()}] Successfully deleted BRD sessions for user ${userId} in chat ${chatId}`);
      return true;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] deleteBRDSessions unexpected error:`, e);
      return false;
    }
  }
}

// In-memory adapter for testing
export class InMemoryDatastoreAdapter implements DatastoreAdapter {
  private sessions: Map<string, BRDSession> = new Map();
  private messages: Message[] = [];
  private specs: Map<string, Spec> = new Map();
  private idCounter = 1;
  
  async getBRDSession(userId: number, chatId: number): Promise<BRDSession | null> {
    console.log(`[${new Date().toISOString()}] [InMemory] getBRDSession called with:`, { userId, chatId });
    console.log(`[${new Date().toISOString()}] [InMemory] Current sessions count:`, this.sessions.size);
    
    for (const session of this.sessions.values()) {
      if (session.user_id === userId && 
          session.chat_id === chatId && 
          session.status === 'active') {
        console.log(`[${new Date().toISOString()}] [InMemory] Found active session:`, {
          id: session.id,
          status: session.status,
          current_step: session.current_step
        });
        return session;
      }
    }
    
    console.log(`[${new Date().toISOString()}] [InMemory] No active session found for user ${userId} in chat ${chatId}`);
    return null;
  }
  
  async createBRDSession(session: Omit<BRDSession, 'id' | 'created_at' | 'updated_at'>): Promise<BRDSession | null> {
    console.log(`[${new Date().toISOString()}] [InMemory] createBRDSession called with:`, {
      user_id: session.user_id,
      chat_id: session.chat_id,
      status: session.status,
      current_step: session.current_step,
      brd_data_keys: Object.keys(session.brd_data || {}),
      brd_data: session.brd_data
    });
    
    const newSession: BRDSession = {
      ...session,
      id: `session_${this.idCounter++}`,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    console.log(`[${new Date().toISOString()}] [InMemory] Creating new session with ID:`, newSession.id);
    
    this.sessions.set(newSession.id!, newSession);
    
    console.log(`[${new Date().toISOString()}] [InMemory] Successfully created session. Total sessions:`, this.sessions.size);
    console.log(`[${new Date().toISOString()}] [InMemory] Created session details:`, {
      id: newSession.id,
      user_id: newSession.user_id,
      chat_id: newSession.chat_id,
      status: newSession.status,
      created_at: newSession.created_at
    });
    
    return newSession;
  }
  
  async updateBRDSession(sessionId: string, updates: Partial<BRDSession>): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] [InMemory] updateBRDSession called with:`, {
      sessionId,
      updateKeys: Object.keys(updates),
      updates
    });
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[${new Date().toISOString()}] [InMemory] Session not found:`, sessionId);
      return false;
    }
    
    console.log(`[${new Date().toISOString()}] [InMemory] Current session state:`, {
      id: session.id,
      status: session.status,
      current_step: session.current_step
    });
    
    const updatedSession = { 
      ...session, 
      ...updates,
      updated_at: Date.now()
    };
    
    this.sessions.set(sessionId, updatedSession);
    
    console.log(`[${new Date().toISOString()}] [InMemory] Successfully updated session:`, {
      id: updatedSession.id,
      status: updatedSession.status,
      current_step: updatedSession.current_step,
      updated_at: updatedSession.updated_at
    });
    
    return true;
  }
  
  async getLatestBRDSession(userId: number, chatId: number): Promise<BRDSession | null> {
    console.log(`[${new Date().toISOString()}] [InMemory] getLatestBRDSession called with:`, { userId, chatId });
    
    const userSessions = Array.from(this.sessions.values())
      .filter(s => s.user_id === userId && s.chat_id === chatId)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    
    console.log(`[${new Date().toISOString()}] [InMemory] Found ${userSessions.length} sessions for user`);
    
    if (userSessions[0]) {
      console.log(`[${new Date().toISOString()}] [InMemory] Latest session:`, {
        id: userSessions[0].id,
        status: userSessions[0].status,
        created_at: userSessions[0].created_at
      });
    } else {
      console.log(`[${new Date().toISOString()}] [InMemory] No sessions found`);
    }
    
    return userSessions[0] || null;
  }
  
  async getAllBRDSessions(userId: number, chatId: number): Promise<BRDSession[]> {
    console.log(`[${new Date().toISOString()}] [InMemory] getAllBRDSessions called with:`, { userId, chatId });
    
    const userSessions = Array.from(this.sessions.values())
      .filter(s => s.user_id === userId && s.chat_id === chatId)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    
    console.log(`[${new Date().toISOString()}] [InMemory] Found ${userSessions.length} sessions for user`);
    console.log(`[${new Date().toISOString()}] [InMemory] Session previews:`, userSessions.map(s => ({
      id: s.id,
      status: s.status,
      created_at: s.created_at
    })));
    
    return userSessions;
  }
  
  async createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] [InMemory] createMessage called with:`, {
      user_id: message.user_id,
      chat_id: message.chat_id,
      role: message.role,
      message_preview: message.message_text.substring(0, 100) + (message.message_text.length > 100 ? '...' : '')
    });
    
    const newMessage: Message = {
      ...message,
      id: `msg_${this.idCounter++}`,
      created_at: Date.now()
    };
    
    this.messages.push(newMessage);
    
    console.log(`[${new Date().toISOString()}] [InMemory] Successfully created message. Total messages:`, this.messages.length);
    return true;
  }
  
  async createSpec(spec: Omit<Spec, 'id' | 'created_at' | 'updated_at' | 'version'>): Promise<Spec | null> {
    console.log(`[${new Date().toISOString()}] [InMemory] createSpec called with:`, {
      user_id: spec.user_id,
      chat_id: spec.chat_id,
      session_id: spec.session_id,
      title: spec.title,
      spec_type: spec.spec_type,
      metadata_keys: Object.keys(spec.metadata || {})
    });
    
    const newSpec: Spec = {
      ...spec,
      id: `spec_${this.idCounter++}`,
      version: 1,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    this.specs.set(newSpec.id!, newSpec);
    
    console.log(`[${new Date().toISOString()}] [InMemory] Successfully created spec with ID:`, newSpec.id);
    return newSpec;
  }
  
  async updateSpec(specId: string, updates: Partial<Spec>): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] [InMemory] updateSpec called with:`, {
      specId,
      updateKeys: Object.keys(updates)
    });
    
    const spec = this.specs.get(specId);
    if (!spec) {
      console.log(`[${new Date().toISOString()}] [InMemory] Spec not found:`, specId);
      return false;
    }
    
    const updatedSpec = { 
      ...spec, 
      ...updates,
      version: (spec.version || 1) + 1,
      updated_at: Date.now()
    };
    
    this.specs.set(specId, updatedSpec);
    
    console.log(`[${new Date().toISOString()}] [InMemory] Successfully updated spec:`, {
      id: updatedSpec.id,
      version: updatedSpec.version,
      updated_at: updatedSpec.updated_at
    });
    
    return true;
  }
  
  async getLatestSpec(userId: number, chatId: number): Promise<Spec | null> {
    console.log(`[${new Date().toISOString()}] [InMemory] getLatestSpec called with:`, { userId, chatId });
    
    const userSpecs = Array.from(this.specs.values())
      .filter(s => s.user_id === userId && s.chat_id === chatId)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    
    console.log(`[${new Date().toISOString()}] [InMemory] Found ${userSpecs.length} specs for user`);
    
    if (userSpecs[0]) {
      console.log(`[${new Date().toISOString()}] [InMemory] Latest spec:`, {
        id: userSpecs[0].id,
        title: userSpecs[0].title,
        spec_type: userSpecs[0].spec_type
      });
    }
    
    return userSpecs[0] || null;
  }
  
  async getSpecsBySession(sessionId: string): Promise<Spec[]> {
    console.log(`[${new Date().toISOString()}] [InMemory] getSpecsBySession called with sessionId:`, sessionId);
    
    const specs = Array.from(this.specs.values())
      .filter(s => s.session_id === sessionId)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    
    console.log(`[${new Date().toISOString()}] [InMemory] Found ${specs.length} specs for session`);
    console.log(`[${new Date().toISOString()}] [InMemory] Spec titles:`, specs.map(s => s.title));
    
    return specs;
  }
  
  async deleteMessages(userId: number, chatId: number): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] [InMemory] deleteMessages called with:`, { userId, chatId });
    
    const initialCount = this.messages.length;
    this.messages = this.messages.filter(
      m => !(m.user_id === userId && m.chat_id === chatId)
    );
    
    const deletedCount = initialCount - this.messages.length;
    console.log(`[${new Date().toISOString()}] [InMemory] Deleted ${deletedCount} messages. Remaining:`, this.messages.length);
    
    return true;
  }
  
  async deleteBRDSessions(userId: number, chatId: number): Promise<boolean> {
    console.log(`[${new Date().toISOString()}] [InMemory] deleteBRDSessions called with:`, { userId, chatId });
    
    const initialCount = this.sessions.size;
    const deletedIds: string[] = [];
    
    for (const [id, session] of this.sessions.entries()) {
      if (session.user_id === userId && session.chat_id === chatId) {
        this.sessions.delete(id);
        deletedIds.push(id);
      }
    }
    
    console.log(`[${new Date().toISOString()}] [InMemory] Deleted ${deletedIds.length} sessions. Remaining:`, this.sessions.size);
    console.log(`[${new Date().toISOString()}] [InMemory] Deleted session IDs:`, deletedIds);
    
    return true;
  }
  
  // Helper methods for testing
  clear() {
    console.log(`[${new Date().toISOString()}] [InMemory] Clearing all data...`);
    console.log(`[${new Date().toISOString()}] [InMemory] Before clear - Sessions: ${this.sessions.size}, Messages: ${this.messages.length}, Specs: ${this.specs.size}`);
    
    this.sessions.clear();
    this.messages = [];
    this.specs.clear();
    this.idCounter = 1;
    
    console.log(`[${new Date().toISOString()}] [InMemory] Data cleared successfully`);
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