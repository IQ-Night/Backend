const express = require("express");
const router = express.Router();

const rooms = require("../controllers/roomController");

// rooms
router.route("/rooms").post(rooms.createRoom).get(rooms.getRooms);
router
  .route("/rooms/:id")
  .get(rooms.getRoom)
  .patch(rooms.updateRoom)
  .patch(rooms.updateRoomPlayers)
  .delete(rooms.deleteRoom);
router.route("/rooms/players/:id").patch(rooms.updateRoomPlayers);
router.route("/rooms/:id/members").get(rooms.getMembers);
router.route("/rooms/:id/createNight").patch(rooms.createNight);
router.route("/rooms/:id/createDay").patch(rooms.createDay);
router.route("/rooms/:id/doctorAction").patch(rooms.doctorAction);
router.route("/rooms/:id/serialKillerKill").patch(rooms.killBySerialKiller);
router.route("/rooms/:id/findSherif").patch(rooms.findSherif);
router.route("/rooms/:id/findMafia").patch(rooms.findMafia);
router.route("/rooms/:id/lastVote").patch(rooms.lastVote);
router.route("/rooms/:id/lastVote2").patch(rooms.lastVote2);
router.route("/rooms/:id/peopleDecide").patch(rooms.peopleDecide);
router.route("/rooms/:id/afterLeaveData").patch(rooms.afterLeaveData);
router.route("/rooms/:id/addRating").patch(rooms.addRating);
router.route("/rooms/:id/logs").get(rooms.getLogs);
router.route("/rooms/:id/periodData").get(rooms.getPeriods);

module.exports = router;
