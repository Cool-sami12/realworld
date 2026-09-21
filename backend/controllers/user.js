const prisma = require("../prisma/client");
const { UnauthorizedError } = require("../helper/customErrors");
const { bcryptHash } = require("../helper/bcrypt");
const { buildUser } = require("../helper/helpers");

//* Current User
const currentUser = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    res.json({ user: buildUser(loggedUser, loggedUser.token) });
  } catch (error) {
    next(error);
  }
};

//* Update User
const updateUser = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    const {
      user: { password },
      user,
    } = req.body;

    const data = {};
    Object.entries(user).forEach((entry) => {
      const [key, value] = entry;

      if (value !== undefined && key !== "password") data[key] = value;
    });

    if (password !== undefined || password !== "") {
      data.password = await bcryptHash(password);
    }

    const updatedUser = await prisma.user.update({
      where: { id: loggedUser.id },
      data,
    });

    res.json({ user: buildUser(updatedUser, loggedUser.token) });
  } catch (error) {
    next(error);
  }
};

module.exports = { currentUser, updateUser };
