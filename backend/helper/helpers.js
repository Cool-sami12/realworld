const prisma = require("../prisma/client");

const slugify = (string) => {
  return string.trim().toLowerCase().replace(/\W|_/g, "-");
};

const isFollowing = async (followerId, followingId) => {
  if (!followerId) return false;

  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  });

  return !!follow;
};

const countFollowers = (followingId) =>
  prisma.follow.count({ where: { followingId } });

const isFavorited = async (userId, articleId) => {
  if (!userId) return false;

  const favorite = await prisma.favorite.findUnique({
    where: { userId_articleId: { userId, articleId } },
  });

  return !!favorite;
};

const countFavorites = (articleId) =>
  prisma.favorite.count({ where: { articleId } });

const buildUser = (user, token) => ({
  email: user.email,
  username: user.username,
  bio: user.bio,
  image: user.image,
  token,
});

const buildProfile = async (author, loggedUserId) => ({
  username: author.username,
  bio: author.bio,
  image: author.image,
  following: await isFollowing(loggedUserId, author.id),
  followersCount: await countFollowers(author.id),
});

const getTagList = async (articleId) => {
  const tagRows = await prisma.articleTag.findMany({ where: { articleId } });

  return tagRows.map((tag) => tag.tagName);
};

const buildArticle = async (article, loggedUserId) => ({
  slug: article.slug,
  title: article.title,
  description: article.description,
  body: article.body,
  tagList: await getTagList(article.id),
  createdAt: article.createdAt,
  updatedAt: article.updatedAt,
  favorited: await isFavorited(loggedUserId, article.id),
  favoritesCount: await countFavorites(article.id),
  author: await buildProfile(article.author, loggedUserId),
});

const buildComment = async (comment, loggedUserId) => ({
  id: comment.id,
  body: comment.body,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
  author: await buildProfile(comment.author, loggedUserId),
});

module.exports = {
  slugify,
  isFollowing,
  countFollowers,
  isFavorited,
  countFavorites,
  buildUser,
  buildProfile,
  buildArticle,
  buildComment,
};
