const { NotFoundError } = require("../helper/customErrors");
const { jwtVerify } = require("../helper/jwt");
const prisma = require("../prisma/client");

const verifyToken = async (req, res, next) => {
  try {
    const { headers } = req;
    if (!headers.authorization) return next();

    const token = headers.authorization.split(" ")[1];
    if (!token) throw new SyntaxError("Token missing or malformed");

    const userVerified = await jwtVerify(token);
    if (!userVerified) throw new Error("Invalid Token");

    const loggedUser = await prisma.user.findUnique({
      where: { email: userVerified.email },
    });
    if (!loggedUser) next(new NotFoundError("User"));

    req.loggedUser = loggedUser;
    req.loggedUser.token = token;

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = verifyToken;
