const prisma = require("../prisma/client");
const {
  NotFoundError,
  UnauthorizedError,
  FieldRequiredError,
  ForbiddenError,
} = require("../helper/customErrors");
const { buildComment } = require("../helper/helpers");

//? All Comments for Article
const allComments = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    const { slug } = req.params;

    const article = await prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundError("Article");

    const comments = await prisma.comment.findMany({
      where: { articleId: article.id },
      include: { author: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      comments: await Promise.all(
        comments.map((comment) => buildComment(comment, loggedUser?.id)),
      ),
    });
  } catch (error) {
    next(error);
  }
};

//* Create Comment for Article
const createComment = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    const { body } = req.body.comment;
    if (!body) throw new FieldRequiredError("Comment body");

    const { slug } = req.params;
    const article = await prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundError("Article");

    const comment = await prisma.comment.create({
      data: { body, articleId: article.id, userId: loggedUser.id },
      include: { author: true },
    });

    res.status(201).json({ comment: await buildComment(comment, loggedUser.id) });
  } catch (error) {
    next(error);
  }
};

//* Delete Comment for Article
const deleteComment = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    const { commentId } = req.params;

    const comment = await prisma.comment.findUnique({
      where: { id: Number(commentId) },
    });
    if (!comment) throw new NotFoundError("Comment");

    if (loggedUser.id !== comment.userId) {
      throw new ForbiddenError("comment");
    }

    await prisma.comment.delete({ where: { id: comment.id } });

    res.json({ message: { body: ["Comment deleted successfully"] } });
  } catch (error) {
    next(error);
  }
};

module.exports = { allComments, createComment, deleteComment };
