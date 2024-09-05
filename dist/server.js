"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const events_1 = require("telegram/events");
const path_1 = require("path");
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const events_2 = require("events");
const big_integer_1 = __importDefault(require("big-integer"));
require("./utilities/job");
const save_video_1 = __importDefault(require("./services/save-video"));
const change_nickname_1 = __importDefault(require("./services/change-nickname"));
const get_phonecode_1 = __importDefault(require("./utilities/get-phonecode"));
const add_link_1 = __importDefault(require("./services/add-link"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const promises_1 = require("fs/promises");
const event = new events_2.EventEmitter();
dotenv_1.default.config();
const allowedUserIds = process.env.ALLOWED_USER_IDS.split(",");
const PORT = process.env.PORT;
const HOST = process.env.DOMAIN ?? "localhost";
const videosJsonPath = (0, path_1.join)(process.cwd(), "videos.json");
const videosUrl = `https://${HOST}`;
const app = (0, express_1.default)();
const users = {
    norouzi: { id: 266125661 },
    shadkaam: { id: 325928034 },
    mahbodsr: { id: 77656834 },
    babakarami: { id: 77656834 },
    farbodsr: { id: 131367677 },
    rezasr: { id: 300164465 },
};
const SECRET_KEY = process.env.SECRET_KEY;
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000);
};
// Helper function to check if the OTP was generated within the last 2 minutes
const isOTPExpired = (iat) => {
    const now = Date.now();
    return now - iat > 2 * 60 * 1000; // 2 minutes in milliseconds
};
const authenticateJWT = (req, res, next) => {
    const token = req.cookies.token;
    if (token) {
        jsonwebtoken_1.default.verify(token, SECRET_KEY, (err, decoded) => {
            if (err) {
                return res.redirect("/login");
            }
            // Check if the token has expired
            const currentTime = Math.floor(Date.now() / 1000);
            if (decoded.exp &&
                decoded.exp < currentTime) {
                return res.redirect("/login"); // Token has expired
            }
            req.user = decoded;
            next();
        });
    }
    else {
        res.redirect("/login");
    }
};
app.use(body_parser_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.get("/phonecode/:phonecode", async (req) => {
    event.emit("phonecode", req.params.phonecode);
});
(async () => {
    const videos = new Map();
    const client = new telegram_1.TelegramClient(new sessions_1.StoreSession("mahbodsr_second"), +process.env.API_ID, process.env.API_HASH, process.env.NODE_ENV === "production"
        ? {}
        : { proxy: { port: 10808, ip: "127.0.0.1", socksType: 5 } });
    app.listen(PORT, () => {
        console.log(`HTTP Server is running.\nYou can now watch videos on ${videosUrl}`);
    });
    await client.start({
        phoneNumber: process.env.PHONE_NUMBER,
        phoneCode: (0, get_phonecode_1.default)(event),
        onError: (err) => console.log(err),
    });
    console.log("You should now be connected.");
    client.session.save();
    app.get("/stream/:chatId/:messageId", authenticateJWT, async (req, res) => {
        const range = req.headers.range;
        if (!range) {
            return res.status(400).send("Requires Range header");
        }
        const movieName = req.params.chatId + "/" + req.params.messageId;
        const video = videos.get(movieName);
        if (video === undefined)
            return res.status(404).send("File not found");
        const [message] = await client.getMessages(video.chatId, {
            ids: [video.messageId],
        });
        const media = message.media; // Extracting the media from the message
        const document = media.document;
        const videoSize = document.size.toJSNumber();
        const FOUR_KB = 1024 * 4;
        const CHUNK_SIZE = FOUR_KB * 128;
        const requestedStart = Number(range.replace(/\D/g, ""));
        const start = requestedStart - (requestedStart % FOUR_KB);
        const end = Math.min(start + CHUNK_SIZE, videoSize);
        const contentLength = end - start;
        let chunks = Buffer.from([]);
        for await (const chunk of client.iterDownload({
            file: media,
            requestSize: CHUNK_SIZE,
            offset: (0, big_integer_1.default)(start),
            fileSize: (0, big_integer_1.default)(contentLength),
        })) {
            if (chunks.length === 0)
                chunks = chunk;
            console.log(chunks.length);
        }
        const headers = {
            "Content-Range": `bytes ${start}-${end - 1}/${videoSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunks.length,
            "Content-Type": "video/mp4",
        };
        res.writeHead(206, headers);
        res.end(chunks);
    });
    app.post("/otp/send", async (req, res) => {
        const { username } = req.body;
        if (!username || !users[username]) {
            return res.status(400).json({ error: "Invalid username" });
        }
        const user = users[username];
        const currentTime = Date.now();
        if (user.password && !isOTPExpired(user.password.iat)) {
            return res.status(400).json({ error: "Try again later" });
        }
        const otp = generateOTP();
        user.password = {
            value: otp,
            iat: currentTime,
            tries: 0,
        };
        const id = users[username].id;
        client.sendMessage(id, {
            message: `Your code is: <spoiler>${otp}</spoiler>`,
            parseMode: "html",
        });
        res.status(200).end();
    });
    app.post("/otp/verify", (req, res) => {
        const { username, otp } = req.body;
        if (!username || !otp || !users[username]) {
            return res.status(400).json({ error: "Invalid username or code" });
        }
        const user = users[username];
        if (!user.password || isOTPExpired(user.password.iat)) {
            return res.status(400).json({ error: "Code expired" });
        }
        if (user.password.tries >= 3) {
            return res.status(400).json({ error: "Too many attempts" });
        }
        if (user.password.value !== Number(otp)) {
            user.password.tries += 1;
            return res.status(400).json({ error: "Invalid code" });
        }
        // OTP is valid
        user.password = undefined; // Reset the password object
        const token = jsonwebtoken_1.default.sign({ username }, SECRET_KEY, {
            expiresIn: "7d",
        });
        res
            .status(200)
            .cookie("token", token)
            .end();
    });
    app.get("/videos", authenticateJWT, async (_, res) => {
        let videos = {};
        try {
            videos = JSON.parse(await (0, promises_1.readFile)(videosJsonPath, "utf-8"));
        }
        catch (error) {
            console.log(error);
        }
        res.status(200).json(videos).end();
    });
    client.addEventHandler(async (event) => {
        if (event.chatId === undefined)
            return;
        const mimeType = event.message.video?.mimeType;
        if ((mimeType === "video/mp4" || mimeType === "video/x-matroska") &&
            !event.message.gif) {
            (0, save_video_1.default)(event, videos, videosUrl);
        }
        else if (event.message.replyTo) {
            (0, change_nickname_1.default)(event, videos, videosUrl);
        }
        else if (event.message.text.startsWith("/link"))
            (0, add_link_1.default)(event, videos, videosUrl);
    }, new events_1.NewMessage({ chats: allowedUserIds }));
})();
