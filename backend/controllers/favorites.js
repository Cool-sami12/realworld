const prisma = require("../prisma/client");
const { UnauthorizedError, NotFoundError } = require("../helper/customErrors");
const { buildArticle } = require("../helper/helpers");

const articleInclude = { author: true };

//*  Favorite/Unfavorite Article
const favoriteToggler = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    const { slug } = req.params;

    const article = await prisma.article.findUnique({
      where: { slug },
      include: articleInclude,
    });
    if (!article) throw new NotFoundError("Article");

    if (req.method === "POST") {
      await prisma.favorite.upsert({
        where: {
          userId_articleId: { userId: loggedUser.id, articleId: article.id },
        },
        create: { userId: loggedUser.id, articleId: article.id },
        update: {},
      });
    } else if (req.method === "DELETE") {
      await prisma.favorite.deleteMany({
        where: { userId: loggedUser.id, articleId: article.id },
      });
    }

    res.json({ article: await buildArticle(article, loggedUser.id) });
  } catch (error) {
    next(error);
  }
};

module.exports = { favoriteToggler };
