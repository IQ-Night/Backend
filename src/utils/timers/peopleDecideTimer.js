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
  function startTimer({ roomId }) {
    stopTimer(roomId); // Clear the existing timer

    let timeLeft = 150;

    io.to(roomId).emit("PeopleDecideTimerUpdate", timeLeft); // Emit the initial time left

    timers[roomId] = setInterval(async () => {
      console.log(timeLeft + " / " + roomId);

      timeLeft--;

      io.to(roomId).emit("PeopleDecideTimerUpdate", timeLeft); // Emit the updated time left

      if (timeLeft <= 0) {
        clearInterval(timers[roomId]);
        delete timers[roomId];

        const room = await Room.findById(roomId);
        const currentGame = room.games[room.games.length - 1];
        const currentDay = currentGame.days[currentGame.days.length - 1];

        // Reducing votes to group by voteFor and count them
        const reducedVotes = currentDay.lastVotes2.reduce((acc, vote) => {
          if (!acc[vote.voteFor]) {
            acc[vote.voteFor] = { voteFor: vote.voteFor, count: 0 };
          }
          acc[vote.voteFor].count += 1;
          return acc;
        }, {});

        // Convert the reduced votes object into an array
        const votesArray = Object.values(reducedVotes);

        // Emit the result
        io.to(roomId).emit("PeopleDecideTimerEnd", {
          votes: votesArray,
          players: currentGame.players,
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
