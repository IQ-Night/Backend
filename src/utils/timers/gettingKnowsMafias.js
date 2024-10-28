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
  async function startTimer({ roomId }) {
    stopTimer(roomId); // Clear the existing timer

    let timeLeft = 10;

    io.to(roomId).emit("GettingKnowMafiasTimerUpdate", timeLeft); // Emit the initial time left

    timers[roomId] = setInterval(async () => {
      console.log(timeLeft + " / " + roomId);

      timeLeft--;

      io.to(roomId).emit("GettingKnowMafiasTimerUpdate", timeLeft); // Emit the updated time left

      const players = getRoomUsers(roomId);

      console.log(players);

      if (timeLeft <= 0) {
        clearInterval(timers[roomId]);
        delete timers[roomId];

        io.to(roomId).emit("GettingKnowMafiasTimerEnd", { players });
      }
    }, 1000);
  }

  // Export functions
  return {
    startTimer,
    stopTimer,
  };
};
