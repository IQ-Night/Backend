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
    console.log("startTimer called with:", { roomId });

    stopTimer(roomId); // Clear the existing timer

    let timeLeft = 10;

    io.to(roomId).emit("VotingTimer2Update", timeLeft); // Emit the initial time left

    timers[roomId] = setInterval(async () => {
      console.log(timeLeft + " / " + roomId);

      timeLeft--;

      io.to(roomId).emit("VotingTimer2Update", timeLeft); // Emit the updated time left

      if (timeLeft <= 0) {
        clearInterval(timers[roomId]);
        delete timers[roomId];

        const room = await Room.findById(roomId);
        const currentGame = room.games[room.games.length - 1];
        const currentDay = currentGame.days[currentGame.days.length - 1];
        const lastVotes = currentDay.lastVotes2;

        function getMostVotedWithCounts(votes) {
          // Create a map to store the counts and the 'votedBy' users for each 'voteFor'
          const voteData = votes?.reduce((acc, vote) => {
            if (!acc[vote.voteFor]) {
              acc[vote.voteFor] = { count: 0, votedBy: [] };
            }
            acc[vote.voteFor].count += 1;
            acc[vote.voteFor].votedBy.push(vote.votedBy);
            return acc;
          }, {});

          // Find the maximum count
          const maxVotes = Math.max(
            ...Object.values(voteData).map((v) => v.count)
          );

          // Get all the voteFor values that have the maximum count, along with their counts and votedBy
          const mostVoted = Object.keys(voteData)
            .filter((voteFor) => voteData[voteFor].count === maxVotes)
            .map((voteFor) => ({
              voteFor,
              count: voteData[voteFor].count,
              votedBy: voteData[voteFor].votedBy, // Include the votedBy array
            }));

          return mostVoted;
        }

        const result =
          lastVotes?.length > 0 ? getMostVotedWithCounts(lastVotes) : [];

        io.to(roomId).emit("VotingTimer2End", {
          lastVotes: result,
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
