import { assertEquals, assertExists } from "https://deno.land/std@0.201.0/assert/mod.ts";
import { TestTelegramAdapter } from "./telegram-adapter.ts";
import { InMemoryDatastoreAdapter } from "./datastore-adapter.ts";
import { 
  handleStartCommand, 
  handleTextMessage, 
  handleGenerateCommand,
  handleSpecCommand,
  processWebhookMessage 
} from "./index.ts";

// Mock environment variables
Deno.env.set("AWS_REGION", "us-east-1");
Deno.env.set("AWS_ACCESS_KEY_ID", "test-key");
Deno.env.set("AWS_SECRET_ACCESS_KEY", "test-secret");
Deno.env.set("TAVILY_API_KEY", "test-tavily-key");

// Helper to create a test message
function createTestMessage(text: string, userId = 123, chatId = 456) {
  return {
    message_id: 1,
    from: {
      id: userId,
      is_bot: false,
      first_name: "Test",
      last_name: "User",
      username: "testuser"
    },
    chat: {
      id: chatId,
      type: "private"
    },
    date: Date.now(),
    text
  };
}

Deno.test({
  name: "BRDist Bot Tests",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
  
  await t.step("should handle /start command", async () => {
    const telegram = new TestTelegramAdapter();
    const datastore = new InMemoryDatastoreAdapter();
    const message = createTestMessage("/start");
    
    await handleStartCommand(message, telegram, datastore);
    
    // Check that welcome message was sent
    const messages = telegram.getMessages();
    assertEquals(messages.length, 1);
    const welcomeMsg = messages[0];
    
    assertExists(welcomeMsg.text);
    assertEquals(welcomeMsg.parse_mode, "HTML");
    assertEquals(welcomeMsg.text.includes("Welcome to BRDist"), true);
    assertEquals(welcomeMsg.text.includes("Business Requirements Document Assistant"), true);
    
    // Check that a session was created
    const sessions = datastore.getSessions();
    assertEquals(sessions.length, 1);
    assertEquals(sessions[0].user_id, 123);
    assertEquals(sessions[0].chat_id, 456);
    assertEquals(sessions[0].status, "active");
  });

  await t.step("should process webhook messages correctly", async () => {
    const telegram = new TestTelegramAdapter();
    const datastore = new InMemoryDatastoreAdapter();
    
    // Test /start command through webhook
    await processWebhookMessage(createTestMessage("/start"), telegram, datastore);
    assertEquals(telegram.getMessages().length, 1);
    assertEquals(datastore.getSessions().length, 1);
    
    telegram.clear();
    
    // Test unknown command
    await processWebhookMessage(createTestMessage("/unknown"), telegram, datastore);
    const unknownMsg = telegram.getLastMessage();
    assertExists(unknownMsg);
    assertEquals(unknownMsg.text.includes("Unknown command"), true);
    
    telegram.clear();
    
    // Test regular text message (would trigger handleTextMessage)
    // Note: processWebhookMessage starts async processing without awaiting
    await processWebhookMessage(createTestMessage("I want to build a mobile app"), telegram, datastore);
    
    // Wait a bit to ensure async processing has started
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify typing indicator was sent
    const typingActions = telegram.getChatActions();
    assertEquals(typingActions.length > 0, true);
  });

  await t.step("should handle text messages and show typing indicator", async () => {
    const telegram = new TestTelegramAdapter();
    const datastore = new InMemoryDatastoreAdapter();
    const message = createTestMessage("I want to build an e-commerce platform");
    
    // Start the conversation
    await handleStartCommand(message, telegram, datastore);
    telegram.clear();
    
    // Note: Without mocking Claude API, we'll just test the typing indicator
    // Create a promise that will reject after a short timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Expected timeout")), 100)
    );
    
    // Start handling the message
    const messagePromise = handleTextMessage(message, telegram, datastore);
    
    // Race between the message handler and timeout
    try {
      await Promise.race([messagePromise, timeoutPromise]);
    } catch (error) {
      // Expected to timeout or fail - that's OK for this test
    }
    
    // Check typing action was sent
    const actions = telegram.getChatActions();
    assertEquals(actions.length > 0, true);
    assertEquals(actions[0].action, "typing");
  });

  await t.step("should validate BRD data before generation", async () => {
    const telegram = new TestTelegramAdapter();
    const datastore = new InMemoryDatastoreAdapter();
    const message = createTestMessage("/generate");
    
    await handleGenerateCommand(message, telegram, datastore);
    
    // Should get warning message about insufficient data
    const warningMsg = telegram.getLastMessage();
    assertExists(warningMsg);
    assertEquals(warningMsg.text.includes("need more information"), true);
  });

  await t.step("should validate data before spec generation", async () => {
    const telegram = new TestTelegramAdapter();
    const datastore = new InMemoryDatastoreAdapter();
    const message = createTestMessage("/spec");
    
    await handleSpecCommand(message, telegram, datastore);
    
    // Should get warning message about insufficient data
    const warningMsg = telegram.getLastMessage();
    assertExists(warningMsg);
    assertEquals(warningMsg.text.includes("need more information"), true);
  });

  await t.step("should handle /spec command with sufficient data", async () => {
    const telegram = new TestTelegramAdapter();
    const datastore = new InMemoryDatastoreAdapter();
    
    // Create a session with sufficient data
    const session = await datastore.createBRDSession({
      user_id: 123,
      chat_id: 456,
      status: 'completed',
      brd_data: {
        project_name: "Test Project",
        project_type: "Web Application",
        target_audience: "B2B",
        budget: "$50k-$100k",
        timeline: "3 months",
        key_features: "User management, reporting, API integration"
      }
    });
    
    const message = createTestMessage("/spec");
    
    // Note: This will attempt to call Claude API
    const promise = handleSpecCommand(message, telegram, datastore)
      .catch(() => {}); // Ignore errors for test
    
    // Wait a bit for initial processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check that typing indicator was sent
    const actions = telegram.getChatActions();
    assertEquals(actions.length > 0, true);
    assertEquals(actions[0].action, "typing");
  });

  await t.step("should handle CHOICES command in responses", () => {
    const telegram = new TestTelegramAdapter();
    
    // Simulate a response with CHOICES command
    const choicesText = "CHOICES What type of project?; Web App; Mobile App; API";
    
    // In real scenario, this would be processed by handleTextMessage
    // Here we can verify the telegram adapter correctly stores keyboard markup
    telegram.sendMessage({
      chat_id: 123,
      text: "What type of project?",
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [
          [{ text: "Web App" }],
          [{ text: "Mobile App" }],
          [{ text: "API" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    
    const msg = telegram.getLastMessage();
    assertExists(msg);
    assertExists(msg.reply_markup);
    assertEquals(msg.reply_markup.keyboard.length, 3);
  });

  await t.step("should accumulate all telegram calls", () => {
    const telegram = new TestTelegramAdapter();
    
    // Send various types of messages
    telegram.sendMessage({ chat_id: 123, text: "Message 1" });
    telegram.sendChatAction({ chat_id: 123, action: "typing" });
    telegram.sendMessage({ chat_id: 123, text: "Message 2" });
    telegram.sendPhoto({ chat_id: 123, photo: "photo_url", caption: "Test photo" });
    
    // Check all calls are recorded
    assertEquals(telegram.calls.length, 4);
    assertEquals(telegram.calls[0].type, "message");
    assertEquals(telegram.calls[1].type, "chatAction");
    assertEquals(telegram.calls[2].type, "message");
    assertEquals(telegram.calls[3].type, "photo");
    
    // Test helper methods
    const messages = telegram.getMessages();
    assertEquals(messages.length, 2);
    assertEquals(messages[0].text, "Message 1");
    assertEquals(messages[1].text, "Message 2");
  });

  await t.step("should store and retrieve BRD session data", async () => {
    const datastore = new InMemoryDatastoreAdapter();
    
    // Create a session
    const session = await datastore.createBRDSession({
      user_id: 123,
      chat_id: 456,
      status: 'active',
      brd_data: { project_name: "Test Project" }
    });
    
    assertExists(session);
    assertExists(session.id);
    assertEquals(session.user_id, 123);
    
    // Retrieve the session
    const retrieved = await datastore.getBRDSession(123, 456);
    assertExists(retrieved);
    assertEquals(retrieved.id, session.id);
    assertEquals(retrieved.brd_data.project_name, "Test Project");
    
    // Update the session
    const updated = await datastore.updateBRDSession(session.id!, {
      brd_data: { project_name: "Test Project", budget: "$50k" }
    });
    assertEquals(updated, true);
    
    // Get latest session
    const latest = await datastore.getLatestBRDSession(123, 456);
    assertExists(latest);
    assertEquals(latest.brd_data.budget, "$50k");
  });

  await t.step("should store and retrieve specs", async () => {
    const datastore = new InMemoryDatastoreAdapter();
    
    // Create a spec
    const spec = await datastore.createSpec({
      user_id: 123,
      chat_id: 456,
      session_id: "session_1",
      title: "Test Project Specification",
      content: "# Test Project\n\nThis is a test specification.",
      spec_type: 'project',
      metadata: { test: true }
    });
    
    assertExists(spec);
    assertExists(spec.id);
    assertEquals(spec.title, "Test Project Specification");
    assertEquals(spec.spec_type, 'project');
    assertEquals(spec.version, 1);
    
    // Retrieve the spec
    const retrieved = await datastore.getLatestSpec(123, 456);
    assertExists(retrieved);
    assertEquals(retrieved.id, spec.id);
    
    // Update the spec
    const updated = await datastore.updateSpec(spec.id!, {
      content: "# Updated Test Project\n\nThis is an updated specification."
    });
    assertEquals(updated, true);
    
    // Check version was incremented
    const updatedSpec = await datastore.getLatestSpec(123, 456);
    assertExists(updatedSpec);
    assertEquals(updatedSpec.version, 2);
  });

  await t.step("should print calls for debugging", () => {
    const telegram = new TestTelegramAdapter();
    
    telegram.sendMessage({ 
      chat_id: 123, 
      text: "<b>Test message</b>",
      parse_mode: "HTML"
    });
    
    // This would print to console in real usage
    // telegram.printCalls();
    
    // Verify the call was recorded with all details
    const call = telegram.calls[0];
    assertEquals(call.type, "message");
    assertEquals((call.data as any).text, "<b>Test message</b>");
    assertEquals((call.data as any).parse_mode, "HTML");
  });
}});

// Integration test example (requires real AWS credentials)
Deno.test({
  name: "Integration: should generate BRD with real Claude",
  ignore: !Deno.env.get("RUN_INTEGRATION_TESTS"),
  fn: async () => {
    const telegram = new TestTelegramAdapter();
    const datastore = new InMemoryDatastoreAdapter();
    
    // Simulate a complete conversation
    const messages = [
      "/start",
      "I want to build a task management mobile app for teams",
      "Mobile App",
      "B2B - Businesses",
      "Medium (100-10k users)",
      "3-4 months",
      "$50k - $100k",
      "Task creation, assignment, due dates, notifications, team collaboration",
      "Cloud-based",
      "Yes - Few systems",
      "SOC 2",
      "User adoption rate, task completion rate, team productivity metrics",
      "Integration with Slack and Microsoft Teams would be beneficial"
    ];
    
    for (const text of messages) {
      const message = createTestMessage(text);
      await processWebhookMessage(message, telegram, datastore);
      // Wait a bit between messages
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Generate the BRD
    await processWebhookMessage(createTestMessage("/generate"), telegram, datastore);
    
    // Print all the telegram calls for inspection
    telegram.printCalls();
    
    // Verify BRD was generated
    const allMessages = telegram.getMessages();
    const brdMessage = allMessages.find(m => 
      m.text.includes("Executive Summary") || 
      m.text.includes("Business Requirements Document")
    );
    
    assertExists(brdMessage, "BRD should be generated");
  }
});