import { NewMessageEvent } from "telegram/events";

const changeNickName = async (
  event: NewMessageEvent,
  videos: Map<string, any>,
  videosUrl: string
) => {
  const id = `${event.message.chatId}/${event.message.replyTo!.replyToMsgId}`;
  const video = videos.get(id);
  if (video === undefined) return;
  const newnickName = event.message.message;
  videos.set(id, {
    ...video,
    nickName: newnickName,
  });
  await event.message.reply({
    message: `🔄 Your video name has been changed.\n<a href="${videosUrl}/${id}">Watch ${newnickName}</a>`,
    parseMode: "html",
  });
  await event.message.markAsRead();
};

export default changeNickName;
