const Room = require("../models/roomModel");
const User = require("../models/userModel");
const { getRoomUsers } = require("./users");

// Function to increment gamesPlayed for multiple users
const incrementGamesPlayedForUsers = async (userIds) => {
  try {
    // Increment gamesPlayed by 1 for all users whose IDs are in the userIds array
    const result = await User.updateMany(
      { _id: { $in: userIds } }, // Filter: Find users by array of user IDs
      {
        $inc: { totalGames: 1 }, // Increment gamesPlayed by 1
      }
    );

    console.log(`${result.modifiedCount} users' gamesPlayed updated.`);
  } catch (error) {
    console.error("Error updating gamesPlayed for users:", error);
  }
};

const ReJoin = async ({ user, socket }) => {
  console.log(user);
  const room = await Room.findById(user?.roomId)
    .lean()
    .select({
      // Include all fields except the full 'games' array
      games: { $slice: -1 }, // Get only the last game in the games array
    });
  if (!room) {
    return console.log("Room not found", 404);
  }

  // Add the total number of games and last game to the room
  room.totalGames = await Room.countDocuments({
    _id: room._id,
    games: { $exists: true },
  });
  room.lastGame = room.games ? room.games[0] : null;

  // Fetch founder details
  const founder = await User.findById(room.admin.founder)
    .select("name cover _id")
    .lean();

  // Attach founder details to the room
  room.admin.founder = founder;

  // Fetch live members in the room
  let liveMembers = getRoomUsers(room._id.toString());
  socket.emit("userConnected", {
    ...room,
    liveMembers,
    roomId: room?._id,
    roomName: room?.title,
    userId: user?.userId,
    type: user?.type,
  });
};

function getNextPlayer({ game, data, firstSpeecher }) {
  // Check if there are any players with playerNumber greater than firstPlayerNumber
  const validPlayers = game.players
    .filter((p) => !p.death)
    .filter(
      (player) => player.playerNumber > data?.currentPlayerToSpeech.playerNumber
    );

  // Reduce to find the player with the smallest playerNumber
  const nextPlayer = validPlayers.reduce((minPlayer, currentPlayer) => {
    return !minPlayer || currentPlayer.playerNumber < minPlayer.playerNumber
      ? currentPlayer
      : minPlayer;
  }, null);

  if (
    !nextPlayer &&
    firstSpeecher.playerNumber !==
      game.players?.filter((u) => !u.death)[0]?.playerNumber
  ) {
    return game.players?.filter((u) => !u.death)[0];
  }

  return nextPlayer;
}

// Export both functions
module.exports = {
  incrementGamesPlayedForUsers,
  ReJoin,
  getNextPlayer,
};
