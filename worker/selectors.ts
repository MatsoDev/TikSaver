export const MESSAGES_URL = "https://www.tiktok.com/messages?lang=en";

export const SELECTORS = {
  loginWall: [
    '[data-e2e="login-modal"]',
    '[data-e2e="login-button"]',
    'div[role="dialog"] a[href*="/login"]',
    'button[data-e2e="login"]',
  ],
  captcha: [
    "#captcha-verify-container",
    '[data-e2e="captcha"]',
    'iframe[src*="captcha"]',
    'div[class*="captcha_verify"]',
  ],
  searchInput: [
    'input[data-e2e="search-user-input"]',
    'input[placeholder*="Search" i]',
    'input[placeholder*="search" i]',
    'input[type="search"]',
  ],
  conversationItem: [
    '[data-e2e="chat-item"]',
    '[data-e2e="conversation-item"]',
    'div[class*="conversation-item"]',
    'div[class*="ConversationItem"]',
  ],
  messageInput: [
    'div[contenteditable="true"][data-e2e*="message"]',
    'div[contenteditable="true"][class*="message"]',
    'textarea[data-e2e="message-input"]',
    'div[contenteditable="true"]',
  ],
  sendButton: [
    'button[data-e2e="send-button"]',
    'button[class*="send"]',
    'button[type="submit"]',
  ],
  messageBubble: [
    '[data-e2e="chat-message"]',
    '[data-e2e="message-bubble"]',
    'div[class*="message-content"]',
    'div[class*="MessageContent"]',
  ],
};
