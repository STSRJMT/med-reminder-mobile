const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

router.get("/elderly", auth, async (req, res) => {
  // req.user.id ต้องมี
  const caregiverId = req.user.id;

  const items = await db.elderly.findMany({
    where: { caregiver_id: caregiverId },
  });

  res.json({ items });
});

module.exports = router;
