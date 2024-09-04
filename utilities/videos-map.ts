import { writeFile } from "fs/promises";
import { ChatGetter } from "telegram/tl/custom";

type Key = string | number;
interface Value {
  nickName: string;
  chatId: ChatGetter["chatId"];
  messageId: number;
  caption: string;
  createdAt: number;
  redirect?: string;
}

export default class VideosMap {
  public videos: Map<Key, Value>;
  public has: typeof this.videos.has;
  public get: typeof this.videos.get;
  constructor(
    private filePath: string,
    initialValue?: Iterable<readonly [Key, Value]> | null | undefined
  ) {
    this.videos = new Map<Key, Value>(initialValue);
    this.has = this.videos.has.bind(this.videos);
    this.get = this.videos.get.bind(this.videos);
  }
  async delete(key: Key) {
    this.videos.delete(key);
    const videosObject = Object.fromEntries(this.videos);
    await writeFile(this.filePath, JSON.stringify(videosObject));
  }

  async set(key: Key, value: Value) {
    this.videos.set(key, value);
    const videosObject = Object.fromEntries(this.videos);
    await writeFile(this.filePath, JSON.stringify(videosObject));
  }
}
