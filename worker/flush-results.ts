import { ResultOutbox } from "./report";

const appUrl = process.env.APP_URL;
const secret = process.env.CRON_SECRET;
if (!appUrl || !secret) throw new Error("Worker API configuration is missing");
new ResultOutbox().flush(appUrl, secret).then((complete) => {
  console.log(complete ? "outbox-flushed" : "outbox-waiting-for-network");
  process.exitCode = complete ? 0 : 1;
}).catch(() => {
  console.error("outbox-error");
  process.exitCode = 1;
});
