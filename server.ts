import { parse } from "url";
import { TelegramClient, Api } from "telegram";
import { StoreSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { join } from "path";
import express, { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import { EventEmitter } from "events";
import VideosMap from "./utilities/videos-map";
import bigInt from "big-integer";
import "./utilities/job";
import saveVideo from "./services/save-video";
import changeNickName from "./services/change-nickname";
import getPhoneCode from "./utilities/get-phonecode";
import addLink from "./services/add-link";
import jwt, { JwtPayload } from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { readFile } from "fs/promises";

interface IUsers {
  [key: string]: {
    password?: { value: number; iat: number; tries: 0 | 1 | 2 | 3 };
    id: number;
  };
}

const event = new EventEmitter();

dotenv.config();

const allowedUserIds = process.env.ALLOWED_USER_IDS!.split(",");
const PORT = process.env.PORT!;
const HOST = process.env.DOMAIN ?? "localhost";
const videosJsonPath = join(process.cwd(), "videos.json");

const videosUrl = `https://${HOST}`;

const app = express();

const users: IUsers = {
  norouzi: { id: 266125661 },
  shadkaam: { id: 325928034 },
  mahbodsr: { id: 77656834 },
  babakarami: { id: 77656834 },
  farbodsr: { id: 131367677 },
  rezasr: { id: 300164465 },
};

const SECRET_KEY = process.env.SECRET_KEY!;

declare global {
  namespace Express {
    interface Request {
      user?: string | JwtPayload;
    }
  }
}

const Regex = /^\/(assets|login)/;

const generateOTP = (): number => {
  return Math.floor(100000 + Math.random() * 900000);
};

// Helper function to check if the OTP was generated within the last 2 minutes
const isOTPExpired = (iat: number): boolean => {
  const now = Date.now();
  return now - iat > 2 * 60 * 1000; // 2 minutes in milliseconds
};

const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token as string;

  if (token) {
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
      if (err) {
        return res.redirect("/login");
      }

      // Check if the token has expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (
        (decoded as JwtPayload).exp &&
        (decoded as JwtPayload).exp! < currentTime
      ) {
        return res.redirect("/login"); // Token has expired
      }

      req.user = decoded;
      next();
    });
  } else {
    res.redirect("/login");
  }
};

app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors({ origin: true }));

app.get("/api/phonecode/:phonecode", async (req: Request) => {
  event.emit("phonecode", req.params.phonecode);
});

(async () => {
  const videos = new VideosMap(videosJsonPath);
  const client = new TelegramClient(
    new StoreSession("mahbodsr_second"),
    +process.env.API_ID!,
    process.env.API_HASH!,
    {}
  );

  app.listen(PORT, () => {
    console.log(
      `HTTP Server is running.\nYou can now watch videos on ${videosUrl}`
    );
  });

  await client.start({
    phoneNumber: process.env.PHONE_NUMBER!,
    phoneCode: getPhoneCode(event),
    onError: (err) => console.log(err),
  });

  console.log("You should now be connected.");
  client.session.save();

  app.get(
    "/api/stream/:chatId/:messageId",
    authenticateJWT,
    async (req, res) => {
      const range = req.headers.range;
      if (!range) {
        return res.status(400).send("Requires Range header");
      }
      const movieName = req.params.chatId + "/" + req.params.messageId;
      const video = videos.get(movieName);
      if (video === undefined) return res.status(404).send("File not found");

      const [message] = await client.getMessages(video.chatId, {
        ids: [video.messageId],
      });

      const media = message.media as Api.MessageMediaDocument; // Extracting the media from the message
      const document = media.document as Api.Document;

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
        offset: bigInt(start),
        fileSize: bigInt(contentLength),
      })) {
        if (chunks.length === 0) chunks = chunk;
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
    }
  );

  app.post("/api/sendOTP", async (req: Request, res: Response) => {
    const { username } = req.body as Record<string, string>;

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

  app.post("/api/verifyOTP", (req: Request, res: Response) => {
    const { username, otp } = req.body as Record<string, string>;

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

    const token = jwt.sign({ username }, SECRET_KEY, {
      expiresIn: "7d",
    });
    res.status(200).cookie("token", token).end();
  });

  app.get("/api/videos", authenticateJWT, async (_, res) => {
    let videos = {};
    try {
      videos = JSON.parse(await readFile(videosJsonPath, "utf-8")) as VideosMap;
    } catch (error) {
      console.log(error);
    }
    res.status(200).json(videos).end();
  });

  app.use(express.static(join(__dirname, "..", "dist")));

  app.get(
    "*",
    (req: Request, res: Response, next: NextFunction) => {
      const parsedUrl = parse(req.url!, true);
      const { pathname } = parsedUrl;

      if (Regex.test(pathname ?? "")) next();
      else authenticateJWT(req, res, next);
    },
    (_, res) => {
      res.sendFile(join(__dirname, "..", "dist", "root.html"));
    }
  );

  client.addEventHandler(async (event: NewMessageEvent) => {
    if (event.chatId === undefined) return;
    const mimeType = event.message.video?.mimeType;
    if (
      (mimeType === "video/mp4" || mimeType === "video/x-matroska") &&
      !event.message.gif
    ) {
      saveVideo(event, videos, videosUrl);
    } else if (event.message.replyTo) {
      changeNickName(event, videos, videosUrl);
    } else if (event.message.text.startsWith("/link"))
      addLink(event, videos, videosUrl);
  }, new NewMessage({ chats: allowedUserIds }));
})();
