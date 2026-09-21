const express = require("express");
const router = express.Router();
const prisma = require("../prisma/client");

// All Tags
router.get("/", async (req, res, next) => {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });

    res.json({ tags: tags.map((tag) => tag.name) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
