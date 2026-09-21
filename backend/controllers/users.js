const prisma = require("../prisma/client");
const { jwtSign } = require("../helper/jwt");
const { bcryptHash, bcryptCompare } = require("../helper/bcrypt");
const { buildUser } = require("../helper/helpers");
const {
  ValidationError,
  FieldRequiredError,
  AlreadyTakenError,
  NotFoundError,
} = require("../helper/customErrors");

// Register
const signUp = async (req, res, next) => {
  try {
    const { username, email, bio, image, password } = req.body.user;
    if (!username) throw new FieldRequiredError(`A username`);
    if (!email) throw new FieldRequiredError(`An email`);
    if (!password) throw new FieldRequiredError(`A password`);

    const emailExists = await prisma.user.findUnique({ where: { email } });
    if (emailExists) throw new AlreadyTakenError("Email", "try logging in");

    const usernameExists = await prisma.user.findUnique({
      where: { username },
    });
    if (usernameExists) throw new AlreadyTakenError("Username");

    const newUser = await prisma.user.create({
      data: {
        email,
        username,
        bio,
        image,
        password: await bcryptHash(password),
      },
    });

    const token = await jwtSign(newUser);

    res.status(201).json({ user: buildUser(newUser, token) });
  } catch (error) {
    next(error);
  }
};

// Login
const signIn = async (req, res, next) => {
  try {
    const { user } = req.body;

    const existentUser = await prisma.user.findUnique({
      where: { email: user.email },
    });
    if (!existentUser) throw new NotFoundError("Email", "sign in first");

    const pwd = await bcryptCompare(user.password, existentUser.password);
    if (!pwd) throw new ValidationError("Wrong email/password combination");

    const token = await jwtSign(user);

    res.json({ user: buildUser(existentUser, token) });
  } catch (error) {
    next(error);
  }
};

module.exports = { signUp, signIn };
