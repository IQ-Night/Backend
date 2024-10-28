const Room = require("../../models/roomModel");
const { getRoomUsers, users } = require("../users");

// speechTimer.js
module.exports = (io) => {
  let speechTimers = {}; // Object to store speech timers for different rooms
  let timeLefts = {}; // Object to store the time left for different rooms

  // Function to stop the speech timer for a specific room
  function stopTimer(roomId) {
    if (speechTimers[roomId]) {
      clearInterval(speechTimers[roomId]);
      delete speechTimers[roomId];
      delete timeLefts[roomId]; // Clear the time left for this room
      console.log(`Speech timer stopped for room ${roomId}`);
    } else {
      console.log(`No active speech timer found for room ${roomId}`);
    }
  }

  // Function to start the speech timer for a specific room
  async function startTimer({
    roomId,
    gameStage,
    currentPlayerToSpeech,
    firstSpeecher,
  }) {
    stopTimer(roomId); // Clear the existing speech timer

    const room = await Room.findById(roomId);

    // Initialize timeLeft for the room
    timeLefts[roomId] = room?.personalTime;

    io.to(roomId).emit("SpeechTimerUpdate", timeLefts[roomId]); // Emit the initial time left

    speechTimers[roomId] = setInterval(async () => {
      console.log(timeLefts[roomId] + " / " + roomId);

      timeLefts[roomId]--;

      io.to(roomId).emit("SpeechTimerUpdate", timeLefts[roomId]); // Emit the updated time left

      if (timeLefts[roomId] <= 0) {
        clearInterval(speechTimers[roomId]);
        delete speechTimers[roomId];
        delete timeLefts[roomId];

        const room = await Room.findById(roomId);
        const game = room.games[room.games.length - 1];
        const day = game.days[game?.days?.length - 1];

        function getNextPlayer() {
          const validPlayers = game.players
            .filter((p) => !p.death)
            .filter(
              (player) =>
                player.playerNumber > currentPlayerToSpeech.playerNumber
            );

          const nextPlayer = validPlayers.reduce((minPlayer, currentPlayer) => {
            return !minPlayer ||
              currentPlayer.playerNumber < minPlayer.playerNumber
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

        const nextPlayerToSpeech = getNextPlayer();

        let speechEnd;

        if (
          firstSpeecher?.playerNumber === nextPlayerToSpeech?.playerNumber ||
          !nextPlayerToSpeech
        ) {
          speechEnd = true;
        }

        io.to(roomId).emit("SpeechTimerEnd", {
          gameStage,
          nextPlayerToSpeech: nextPlayerToSpeech,
          firstSpeecher: firstSpeecher,
          nextDayNumber: day?.number + 1,
          votes: day?.votes,
          speechEnd,
          players: game.players,
        });
      }
    }, 1000);
  }

  const getTimeLeft = (roomId) => {
    const timeLeft = timeLefts[roomId] !== undefined ? timeLefts[roomId] : 0;
    console.log("Current time left for room:", roomId, timeLeft);
    return timeLeft;
  };

  // Export functions
  return {
    startTimer,
    stopTimer,
    getTimeLeft,
  };
};
