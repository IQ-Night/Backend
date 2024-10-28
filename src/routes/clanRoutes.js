const express = require("express");
const router = express.Router();

const clans = require("../controllers/clanController");

// clans
router.route("/clans").post(clans.createClan).get(clans.getClans);
router
  .route("/clans/:id")
  .get(clans.getClan)
  .patch(clans.updateClan)
  .delete(clans.deleteClan);
router.route("/clans/:id/members").get(clans.getMembers);
router.route("/clans/:id/addRole").patch(clans.addRole);
router.route("/clans/:title/join").patch(clans.joinClan);
router.route("/clans/:title/leave").patch(clans.leaveClan);
router.route("/clans/myClans/:id").get(clans.getMyClans);

module.exports = router;
