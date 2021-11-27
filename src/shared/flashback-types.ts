export type FlashbackUser = {
  username: string;
  link: string;
};

export type FlashbackPost = {
  id: string;
  body: string;
  timestamp: number;
  user: FlashbackUser;
  link: string;
};

export type FlashbackThreadPage = {
  index: number;
  posts: FlashbackPost[];
};

export type FlashbackThread = {
  id: string;
  title: string;
  pages: FlashbackThreadPage[];
  pagesAvailable: number;
};
