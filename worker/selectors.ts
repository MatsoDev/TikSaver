export const MESSAGES_URL = "https://www.tiktok.com/messages?lang=en";
export const PROFILE_URL = "https://www.tiktok.com/@";

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
    'div[role="listitem"]',
    'div[class*="DivItemContainer"]',
    'a[href*="/messages/"]',
  ],
  messageInput: [
    'div[contenteditable="true"][data-placeholder="Send a message..."]',
    '[contenteditable="true"][aria-label="Send a message..."]',
    'textarea[placeholder="Send a message..."]',
    'input[placeholder="Send a message..."]',
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
  outgoingMessage: [
    '[data-e2e="chat-message"][data-is-own="true"]',
    '[data-e2e="chat-message"][data-direction="outgoing"]',
    '[data-e2e="message-bubble"][data-is-own="true"]',
    '[class*="outgoing" i]',
    '[class*="sender" i]',
  ],
  profileReady: [
    'main',
    '[data-e2e="user-profile"]',
  ],
  profileMessageButton: [
    'button[data-e2e="message-button"]',
    'a[data-e2e="message-button"]',
    'button:has-text("Message")',
    'a:has-text("Message")',
  ],
  skeleton: [
    '[class*="skeleton" i]',
    '[class*="Skeleton"]',
    '[aria-busy="true"]',
  ],
  profileDisplayLink: [
    'a[href*="/@"]',
    '[data-e2e="chat-item"] a[href*="/@"]',
    '[data-e2e="conversation-item"] a[href*="/@"]',
  ],
};
