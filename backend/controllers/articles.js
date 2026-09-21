const {
  AlreadyTakenError,
  FieldRequiredError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} = require("../helper/customErrors");
const { buildArticle, slugify } = require("../helper/helpers");
const prisma = require("../prisma/client");

const articleInclude = { author: true };

//? All Articles - by Author/by Tag/Favorited by user
const allArticles = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    const { author, tag, favorited, limit = 3, offset = 0 } = req.query;

    const where = {
      ...(author && { author: { username: author } }),
      ...(tag && { tagList: { some: { tagName: tag } } }),
      ...(favorited && {
        favorites: { some: { user: { username: favorited } } },
      }),
    };

    const [rows, count] = await Promise.all([
      prisma.article.findMany({
        where,
        include: articleInclude,
        take: parseInt(limit),
        skip: parseInt(offset) * parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.article.count({ where }),
    ]);

    const articles = await Promise.all(
      rows.map((article) => buildArticle(article, loggedUser?.id)),
    );

    res.json({ articles, articlesCount: count });
  } catch (error) {
    next(error);
  }
};

//* Create Article
const createArticle = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    const { title, description, body, tagList = [] } = req.body.article;
    if (!title) throw new FieldRequiredError("A title");
    if (!description) throw new FieldRequiredError("A description");
    if (!body) throw new FieldRequiredError("An article body");

    const slug = slugify(title);
    const slugInDB = await prisma.article.findUnique({ where: { slug } });
    if (slugInDB) throw new AlreadyTakenError("Title");

    const tagNames = [
      ...new Set(
        tagList.map((tag) => tag.trim()).filter((tag) => tag.length > 2),
      ),
    ];

    const article = await prisma.article.create({
      data: {
        slug,
        title,
        description,
        body,
        userId: loggedUser.id,
        tagList: {
          create: tagNames.map((tagName) => ({
            tag: {
              connectOrCreate: {
                where: { name: tagName },
                create: { name: tagName },
              },
            },
          })),
        },
      },
      include: articleInclude,
    });

    res.status(201).json({ article: await buildArticle(article, loggedUser.id) });
  } catch (error) {
    next(error);
  }
};

//* Feed
const articlesFeed = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    const { limit = 3, offset = 0 } = req.query;

    const following = await prisma.follow.findMany({
      where: { followerId: loggedUser.id },
      select: { followingId: true },
    });
    const authorIds = following.map((follow) => follow.followingId);
    const where = { userId: { in: authorIds } };

    const [rows, count] = await Promise.all([
      prisma.article.findMany({
        where,
        include: articleInclude,
        take: parseInt(limit),
        skip: parseInt(offset) * parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.article.count({ where }),
    ]);

    const articles = await Promise.all(
      rows.map((article) => buildArticle(article, loggedUser.id)),
    );

    res.json({ articles, articlesCount: count });
  } catch (error) {
    next(error);
  }
};

// Single Article by slug
const singleArticle = async (req, res, next) => {
  try {
    const { loggedUser } = req;

    const { slug } = req.params;
    const article = await prisma.article.findUnique({
      where: { slug },
      include: articleInclude,
    });
    if (!article) throw new NotFoundError("Article");

    res.json({ article: await buildArticle(article, loggedUser?.id) });
  } catch (error) {
    next(error);
  }
};

//* Update Article
const updateArticle = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    const { slug } = req.params;
    const article = await prisma.article.findUnique({
      where: { slug },
      include: articleInclude,
    });
    if (!article) throw new NotFoundError("Article");

    if (loggedUser.id !== article.userId) {
      throw new ForbiddenError("article");
    }

    const { title, description, body } = req.body.article;
    const data = {};
    if (title) {
      data.title = title;
      data.slug = slugify(title);
    }
    if (description) data.description = description;
    if (body) data.body = body;

    const updatedArticle = await prisma.article.update({
      where: { id: article.id },
      data,
      include: articleInclude,
    });

    res.json({ article: await buildArticle(updatedArticle, loggedUser.id) });
  } catch (error) {
    next(error);
  }
};

//* Delete Article
const deleteArticle = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    const { slug } = req.params;
    const article = await prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundError("Article");

    if (loggedUser.id !== article.userId) {
      throw new ForbiddenError("article");
    }

    await prisma.article.delete({ where: { id: article.id } });

    res.json({ message: { body: ["Article deleted successfully"] } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  allArticles,
  createArticle,
  singleArticle,
  updateArticle,
  deleteArticle,
  articlesFeed,
};
