"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cron_1 = require("cron");
const https_1 = require("https");
const backendUrl = "https://mahbodsr.ir";
new cron_1.CronJob("*/10 * * * *", () => {
    (0, https_1.get)(backendUrl, (res) => {
        if (res.statusCode === 200)
            console.log("server restarted.");
        else
            console.error(`failed to restart server with status code: ${res.statusCode}`);
    }).on("error", (err) => console.error("error during restart:", err.message));
}).start();
