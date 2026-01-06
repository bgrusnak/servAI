-- Migration: Telegram Bot Infrastructure
-- Created: 2026-01-06
-- Description: Tables for Telegram bot users, conversations, context, and intents

-- Telegram users (link Telegram accounts to system users)
CREATE TABLE telegram_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL UNIQUE,
  telegram_username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  language_code VARCHAR(10) DEFAULT 'en',
  is_bot BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_telegram_users_user_id ON telegram_users(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_telegram_users_telegram_id ON telegram_users(telegram_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_telegram_users_active ON telegram_users(is_active) WHERE deleted_at IS NULL;

-- Conversations (dialog history)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
  message_id BIGINT,
  telegram_message_id BIGINT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  intent VARCHAR(100),
  intent_confidence DECIMAL(3,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_telegram_user ON conversations(telegram_user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX idx_conversations_intent ON conversations(intent) WHERE intent IS NOT NULL;

-- User context (conversation state and summary)
CREATE TABLE user_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_user_id UUID NOT NULL UNIQUE REFERENCES telegram_users(id) ON DELETE CASCADE,
  current_unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  conversation_summary TEXT,
  state VARCHAR(50) DEFAULT 'idle',
  state_data JSONB DEFAULT '{}',
  last_intent VARCHAR(100),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_context_telegram_user ON user_context(telegram_user_id);
CREATE INDEX idx_user_context_unit ON user_context(current_unit_id) WHERE current_unit_id IS NOT NULL;

-- Intents (configurable AI intents)
CREATE TABLE intents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  examples TEXT[], -- Example user phrases
  parameters JSONB DEFAULT '[]', -- Expected parameters structure
  handler VARCHAR(255), -- Backend handler/endpoint
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_intents_code ON intents(code) WHERE deleted_at IS NULL;
CREATE INDEX idx_intents_category ON intents(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_intents_active ON intents(is_active) WHERE deleted_at IS NULL;

-- System prompts (configurable AI system prompt)
CREATE TABLE system_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT FALSE,
  language_code VARCHAR(10) DEFAULT 'en',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_system_prompts_active ON system_prompts(is_active, language_code);
CREATE INDEX idx_system_prompts_version ON system_prompts(version DESC);

-- Ensure only one active prompt per language
CREATE UNIQUE INDEX idx_system_prompts_active_language 
  ON system_prompts(language_code) 
  WHERE is_active = TRUE;

-- Insert default intents
INSERT INTO intents (code, name, description, category, examples, parameters, handler, priority) VALUES
  ('meter_reading_text', 'Submit Meter Reading (Text)', 'User submits meter reading via text', 'meters', 
   ARRAY['cold water 123.4', 'electricity 5678', 'hot water reading is 234.5'], 
   '[{"name":"meter_type","type":"string","required":true},{"name":"value","type":"number","required":true}]',
   'meters.submitReading', 10),
  
  ('meter_reading_photo', 'Submit Meter Reading (Photo)', 'User submits meter reading via photo', 'meters',
   ARRAY['here is my meter', 'photo of water meter'], 
   '[{"name":"meter_type","type":"string","required":false},{"name":"photo_url","type":"string","required":true}]',
   'meters.submitReadingPhoto', 10),
  
  ('meter_history', 'View Meter History', 'User wants to see meter reading history', 'meters',
   ARRAY['show my readings', 'meter history', 'previous readings'], 
   '[{"name":"meter_type","type":"string","required":false},{"name":"period","type":"string","required":false}]',
   'meters.getHistory', 5),
  
  ('ticket_create', 'Create Ticket/Appeal', 'User reports a problem or request', 'tickets',
   ARRAY['broken faucet in kitchen', 'no hot water', 'need electrician', 'elevator not working'], 
   '[{"name":"description","type":"string","required":true},{"name":"category","type":"string","required":false}]',
   'tickets.create', 10),
  
  ('ticket_list', 'List My Tickets', 'User wants to see their tickets', 'tickets',
   ARRAY['my requests', 'show my appeals', 'ticket status'], 
   '[{"name":"status","type":"string","required":false}]',
   'tickets.list', 5),
  
  ('ticket_status', 'Check Ticket Status', 'User asks about specific ticket', 'tickets',
   ARRAY['what about my request', 'ticket status', 'is my problem fixed'], 
   '[{"name":"ticket_id","type":"string","required":false}]',
   'tickets.getStatus', 5),
  
  ('invoice_current', 'Get Current Invoice', 'User wants to see current bill', 'billing',
   ARRAY['my bill', 'current invoice', 'how much do I owe'], 
   '[]',
   'billing.getCurrentInvoice', 5),
  
  ('payment_history', 'Payment History', 'User wants to see payment history', 'billing',
   ARRAY['payment history', 'my payments', 'show payments'], 
   '[{"name":"period","type":"string","required":false}]',
   'billing.getHistory', 5),
  
  ('poll_list', 'List Active Polls', 'User wants to see active polls', 'polls',
   ARRAY['show polls', 'active surveys', 'what polls are open'], 
   '[]',
   'polls.listActive', 5),
  
  ('poll_vote', 'Vote in Poll', 'User wants to vote', 'polls',
   ARRAY['I want to vote', 'my vote is yes', 'vote for option 2'], 
   '[{"name":"poll_id","type":"string","required":false},{"name":"option","type":"string","required":false}]',
   'polls.vote', 5),
  
  ('access_temp_pass', 'Temporary Car Pass', 'User requests temporary access for a car', 'access',
   ARRAY['guest car AB1234', 'temporary pass for XX9999', 'visitor car coming'], 
   '[{"name":"plate_number","type":"string","required":true},{"name":"valid_until","type":"string","required":false}]',
   'access.createTempPass', 5),
  
  ('access_permanent', 'Manage Permanent Cars', 'User wants to add/remove permanent car', 'access',
   ARRAY['add my car AB1234', 'remove car XX9999', 'register permanent car'], 
   '[{"name":"action","type":"string","required":true},{"name":"plate_number","type":"string","required":true}]',
   'access.managePermanent', 5),
  
  ('info_contacts', 'Contact Information', 'User asks for contacts', 'info',
   ARRAY['contact management', 'phone number', 'how to reach admin'], 
   '[]',
   'info.getContacts', 2),
  
  ('info_faq', 'FAQ/Help', 'User needs general help', 'info',
   ARRAY['help', 'how does this work', 'what can you do'], 
   '[]',
   'info.getFAQ', 1);

-- Insert default system prompt (English)
INSERT INTO system_prompts (name, content, is_active, language_code) VALUES
('Default System Prompt v1', 
'You are an AI assistant for servAI - a property management platform for residential complexes.

Your role:
- Help residents submit meter readings, report issues, check bills, vote in polls, and manage car access
- Help workers view and update their assigned tasks
- Communicate naturally and understand context
- Always be helpful, polite, and professional

When processing user messages:
1. Determine the user''s intent from the available intents list
2. Extract required parameters
3. Respond in the user''s language
4. Update the conversation summary

Available intents:
{INTENTS_LIST}

Response format (JSON):
{
  "intent": "intent_code",
  "confidence": 0.95,
  "parameters": {
    "param1": "value1"
  },
  "response": "Your natural language response to user",
  "summary_update": "Brief update to conversation context"
}

If you cannot determine intent with confidence > 0.7, ask for clarification.
Always maintain conversation context and refer to previous messages when relevant.

Conversation history (last 20 messages):
{CONVERSATION_HISTORY}

Previous conversation summary:
{SUMMARY}

Current user message:
{USER_MESSAGE}',
TRUE,
'en');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_telegram_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER telegram_users_updated_at
  BEFORE UPDATE ON telegram_users
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_updated_at();

CREATE TRIGGER intents_updated_at
  BEFORE UPDATE ON intents
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_updated_at();

CREATE TRIGGER system_prompts_updated_at
  BEFORE UPDATE ON system_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_updated_at();

-- Update schema_migrations
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (11, '011_telegram_bot', NOW());
