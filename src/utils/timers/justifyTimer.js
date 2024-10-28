const Room = require("../../models/roomModel");
const { getRoomUsers } = require("../users");

// gameTimer.js
module.exports = (io) => {
  let timers = {}; // Object to store timers for different rooms

  // Function to stop the timer for a specific room
  function stopTimer(roomId) {
    if (timers[roomId]) {
      clearInterval(timers[roomId]);
      delete timers[roomId];
      console.log(`Timer stopped for room ${roomId}`);
    } else {
      console.log(`No active timer found for room ${roomId}`);
    }
  }

  // Function to start the timer for a specific room
  function startTimer({ roomId, player, list }) {
    stopTimer(roomId); // Clear the existing timer

    let timeLeft = 150;

    io.to(roomId).emit("JustifyTimerUpdate", timeLeft); // Emit the initial time left

    timers[roomId] = setInterval(async () => {
      console.log(timeLeft + " / " + roomId);

      timeLeft--;

      io.to(roomId).emit("JustifyTimerUpdate", timeLeft); // Emit the updated time left

      if (timeLeft <= 0) {
        clearInterval(timers[roomId]);
        delete timers[roomId];

        const room = await Room.findById(roomId);
        const currentGame = room?.games[room.games.length - 1];
        const players = currentGame.players;

        io.to(roomId).emit("JustifyTimerEnd", {
          player,
          list,
          players,
        });
      }
    }, 1000);
  }

  // Export functions
  return {
    startTimer,
    stopTimer,
  };
};
