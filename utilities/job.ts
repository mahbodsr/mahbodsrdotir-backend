import { CronJob } from "cron";
import { get } from "https";

const backendUrl = "https://mahbodsr.ir";
new CronJob("*/10 * * * *", () => {
  get(backendUrl, (res) => {
    if (res.statusCode === 200) console.log("server restarted.");
    else
      console.error(
        `failed to restart server with status code: ${res.statusCode}`
      );
  }).on("error", (err) => console.error("error during restart:", err.message));
}).start();
