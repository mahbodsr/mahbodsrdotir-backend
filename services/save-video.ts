import { CronJob } from "cron";
import { Api } from "telegram";
import { NewMessageEvent } from "telegram/events";

const ONE_HOUR = 60 * 60 * 1000;
const DYNAMIC_HOURS_MS = 24 * ONE_HOUR;

const saveVideo = async (
  event: NewMessageEvent,
  videos: Map<string, any>,
  videosUrl: string
) => {
  const id = `${event.chatId}/${event.message.id}`;
  const [{ fileName }] = event.message.video!.attributes.filter(
    (v) => v.className === "DocumentAttributeFilename"
  ) as [Api.DocumentAttributeFilename];

  await event.message.markAsRead();
  const video = {
    nickName: fileName.replace(/\.[^/.]+$/, ""),
    chatId: event.chatId,
    messageId: event.message.id,
    caption: event.message.text,
    createdAt: Date.now(),
  };
  videos.set(id, video);

  await event.message.reply({
    message: `✅ Your video has been added.\nTo rename video, reply video and send new name.\n<a href="${videosUrl}/${id}">Watch ${video.nickName}</a>`,
    replyTo: event.message.id,
    parseMode: "html",
  });
  new CronJob(new Date(video.createdAt + DYNAMIC_HOURS_MS), async () => {
    videos.delete(id);
  }).start();
};

export default saveVideo;
