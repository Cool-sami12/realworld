const prisma = require("../prisma/client");
const { UnauthorizedError, NotFoundError } = require("../helper/customErrors");
const { buildProfile } = require("../helper/helpers");

//? Profile
const getProfile = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    const { username } = req.params;

    const profile = await prisma.user.findUnique({ where: { username } });
    if (!profile) throw new NotFoundError("User profile");

    res.json({
      profile: { ...(await buildProfile(profile, loggedUser?.id)), email: profile.email },
    });
  } catch (error) {
    next(error);
  }
};

//* Follow/Unfollow Profile
const followToggler = async (req, res, next) => {
  try {
    const { loggedUser } = req;
    if (!loggedUser) throw new UnauthorizedError();

    const { username } = req.params;

    const profile = await prisma.user.findUnique({ where: { username } });
    if (!profile) throw new NotFoundError("User profile");

    if (req.method === "POST") {
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: loggedUser.id,
            followingId: profile.id,
          },
        },
        create: { followerId: loggedUser.id, followingId: profile.id },
        update: {},
      });
    } else if (req.method === "DELETE") {
      await prisma.follow.deleteMany({
        where: { followerId: loggedUser.id, followingId: profile.id },
      });
    }

    res.json({
      profile: { ...(await buildProfile(profile, loggedUser.id)), email: profile.email },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getProfile, followToggler };
