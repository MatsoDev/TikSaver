export function isTelegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID,
  );
}

export type TelegramSendResult = {
  httpStatus: number;
  ok: boolean;
  errorCode?: number;
  description?: string;
};

export async function sendTelegram(text: string): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { httpStatus: 0, ok: false, description: "Telegram is not configured." };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
        cache: "no-store",
      },
    );

    const body = (await response.json().catch(() => null)) as {
      ok?: unknown;
      error_code?: unknown;
      description?: unknown;
    } | null;
    const description = typeof body?.description === "string"
      ? body.description.replaceAll(token, "[redacted]").replaceAll(chatId, "[redacted]").slice(0, 300)
      : undefined;
    return {
      httpStatus: response.status,
      ok: body?.ok === true,
      ...(typeof body?.error_code === "number" ? { errorCode: body.error_code } : {}),
      ...(description ? { description } : {}),
    };
  } catch {
    return {
      httpStatus: 0,
      ok: false,
      description: "Network error while contacting Telegram.",
    };
  }
}
