const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Room = require("../models/roomModel");
const { getRoomUsers, updateUsers, getAllUsers } = require("../utils/users");
const Clan = require("../models/clanModel");

// Get Rooms
exports.getRooms = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, search, language, rating } = req.query;

  // Create filter object
  const filter = { "status.value": { $ne: "closed" } };
  if (search) filter.title = { $regex: search, $options: "i" }; // Title search filter
  if (language) filter.language = language; // Language filter
  if (rating) filter.rating = { $gte: rating }; // Minimum rating filter

  // Fetch rooms with totalGames and lastGame fields
  const rooms = await Room.aggregate([
    { $match: filter },
    { $sort: { createdAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: Number(limit) },
    {
      $addFields: {
        totalGames: { $size: "$games" }, // Count the number of games
        lastGame: { $arrayElemAt: ["$games", -1] }, // Get the last game if available
      },
    },
    {
      $unset: "games", // Exclude the games field
    },
  ]);

  // Collect founder IDs for lookup
  const founderIds = rooms.map((room) => room.admin.founder);

  // Fetch founder details in a single query
  const founders = await User.find({ _id: { $in: founderIds } })
    .select("name cover _id totalGames rating")
    .lean()
    .then((data) =>
      data.reduce((acc, founder) => {
        acc[founder._id] = founder;
        return acc;
      }, {})
    );

  // Attach details to rooms and add liveMembers
  const roomsWithDetails = rooms.map((room) => ({
    ...room,
    liveMembers: getRoomUsers(room._id.toString()),
    admin: {
      ...room.admin,
      founder: founders[room.admin.founder] || null,
    },
  }));

  // Calculate total rooms by language using aggregation
  const languageTotals = await Room.aggregate([
    { $match: { "status.value": { $ne: "closed" } } },
    { $group: { _id: "$language", total: { $sum: 1 } } },
    { $project: { _id: 0, language: "$_id", total: 1 } },
    { $sort: { language: 1 } },
  ]);

  // Fetch total room count
  const totalRooms = await Room.countDocuments({
    "status.value": { $ne: "closed" },
  });

  // Send response
  res.status(200).json({
    status: "success",
    totalRooms,
    data: {
      rooms: roomsWithDetails,
      languageTotals,
    },
  });
});

// Get one room
exports.getRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id)
    .lean()
    .select({
      // Include all fields except the full 'games' array
      games: { $slice: -1 }, // Get only the last game in the games array
    });

  if (!room) {
    return next(new AppError("Room not found", 404));
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

  res.status(200).json({
    status: "success",
    data: {
      room: {
        ...room,
        liveMembers,
      },
    },
  });
});

// Get omembers in specific room
exports.getMembers = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);

  let liveMembers = getRoomUsers(req.params.id);

  if (room) {
    res.status(201).json({
      status: "success",
      data: { members: liveMembers },
    });
  }
});
// Update room
exports.updateRoom = catchAsync(async (req, res, next) => {
  const sameTitle = await Room.findOne({ title: req.body.title });

  if (sameTitle) {
    return next(new AppError("Room with same name already defined", 404));
  }
  const room = await Room.findByIdAndUpdate(req.params.id, req.body, {
    new: true, // returns the updated document
    runValidators: true, // runs schema validators
  });

  if (!room) {
    return next(new AppError("No room found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      room,
    },
  });
});

// Update room players in the last game
exports.updateRoomPlayers = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);

  if (!room) {
    return next(new AppError("No room found with that ID", 404));
  }

  // Get the last game and update the players field
  let currentGame = room.games[room.games.length - 1];

  if (currentGame) {
    currentGame.players = req.body.players;

    room.markModified("games");

    updateUsers(currentGame.players);

    // Save the updated room
    await room.save();

    res.status(200).json({
      status: "success",
      data: {
        room,
      },
    });
  }
});

// Create New Room
exports.createRoom = catchAsync(async (req, res, next) => {
  const sameTitle = await Room.findOne({ title: req.body.title });

  if (sameTitle) {
    return next(new AppError("Room with same name already defined", 404));
  }
  const newRoom = await Room.create(req.body);

  // Add the total number of games and last game to the room
  const totalGames = await Room.countDocuments({
    _id: newRoom._id,
    games: { $exists: true },
  });
  const lastGame = newRoom.games ? newRoom.games[0] : null;

  const liveMembers = getRoomUsers(newRoom._id.toString());

  // Fetch founder details
  const founder = await User.find({ _id: { $in: newRoom.admin.founder } })
    .select("name cover _id")
    .lean();

  const roomObj = {
    ...newRoom.toObject(), // Convert Mongoose document to plain JavaScript object
    liveMembers,
    totalGames,
    lastGame,
    games: [],
    admin: {
      ...newRoom.admin,
      founder: founder[0],
    },
  };

  res.status(201).json({
    status: "success",
    data: {
      room: roomObj,
    },
  });
});

// Delete room
exports.deleteRoom = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;

  await Room.findByIdAndDelete(roomId);

  res.status(201).json({
    status: "success",
  });
});

// Create Day
exports.createDay = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;
  const dayNumber = req.body.number;

  // ვეძებთ ოთახს roomId-ის მიხედვით
  const room = await Room.findById(roomId);

  if (!room) {
    console.log(`Room with ID ${roomId} not found`);
    return;
  }

  // ვადგენთ მიმდინარე თამაშს, ვპოულობთ თამაშს მაქსიმალური number ველის მქონე
  const currentGame = room.games.reduce((maxGame, game) => {
    return game.number > (maxGame?.number || 0) ? game : maxGame;
  }, null);

  if (!currentGame) {
    console.log(`No games found in the room with ID ${roomId}`);
    return;
  }

  // ვადგენთ დღის ნომერს
  if (!currentGame.days) {
    currentGame.days = []; // თუ days მასივი არ არსებობს, ვქმნით მას
  }

  // ვეძებთ დღევანდელ დღეს dayNumber-ის მიხედვით, რათა თავიდან ავიცილოთ დუბლიკაცია

  function getNextPlayer() {
    const currentDay = currentGame.days[currentGame.days.length - 1];
    const firstPlayerNumber = currentDay?.firstPlayerToSpeech?.playerNumber;

    // Check if there are any players with playerNumber greater than firstPlayerNumber
    const validPlayers = currentGame?.players
      .filter((p) => !p.death)
      .filter((player) => player.playerNumber > firstPlayerNumber);

    // Reduce to find the player with the smallest playerNumber
    const nextPlayer = validPlayers.reduce((minPlayer, currentPlayer) => {
      return !minPlayer || currentPlayer.playerNumber < minPlayer.playerNumber
        ? currentPlayer
        : minPlayer;
    }, null);

    // If no such player is found, wrap around to the player with the smallest playerNumber
    if (!nextPlayer) {
      // Wrapping around to the player with the smallest playerNumber
      return currentGame?.players.filter((p) => !p.death)[0];
    }

    return nextPlayer;
  }

  // Example usage
  let nextPlayer;
  if (dayNumber !== 1) {
    nextPlayer = getNextPlayer();
  }

  currentGame.days.push({
    number: dayNumber,
    votes: [],
    firstPlayerToSpeech: dayNumber === 1 ? currentGame.players[0] : nextPlayer,
  });

  // აღნიშნეთ, რომ 'games' ველი შეიცვალა
  room.markModified("games");

  // შეინახეთ ოთახის ობიექტი ბაზაში
  await room.save();

  const currentDay = currentGame.days[currentGame.days.length - 1];
  const io = req.io;

  const players = getRoomUsers(roomId);

  io.to(roomId).emit("getFirstPlayerToSpeech", {
    player: currentDay.firstPlayerToSpeech,
    players: players,
  });

  // დააბრუნეთ ოთახი ახლად შექმნილი ღამით
  res.status(201).json({
    status: "success",
    data: { room },
  });
});
// Create Night
exports.createNight = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;
  const nightNumber = req.body.number;

  // ვეძებთ ოთახს roomId-ის მიხედვით
  const room = await Room.findById(roomId);

  if (!room) {
    console.log(`Room with ID ${roomId} not found`);
    return;
  }

  // ვადგენთ მიმდინარე თამაშს, ვპოულობთ თამაშს მაქსიმალური number ველის მქონე
  const currentGame = room.games.reduce((maxGame, game) => {
    return game.number > (maxGame?.number || 0) ? game : maxGame;
  }, null);

  if (!currentGame) {
    console.log(`No games found in the room with ID ${roomId}`);
    return;
  }

  // ვადგენთ დღის ნომერს
  if (!currentGame.nights) {
    currentGame.nights = []; // თუ nights მასივი არ არსებობს, ვქმნით მას
  }

  // ვეძებთ დღევანდელ ღამეს NightNumber-ის მიხედვით, რათა თავიდან ავიცილოთ დუბლიკაცია
  const currentNight = currentGame.nights.find(
    (night) => night.number === nightNumber
  );

  if (!currentNight) {
    // თუ დღევანდელი ღამე არ არსებობს, ვამატებთ მას მასივში
    currentGame.nights.push({ number: nightNumber, votes: [] });
  } else {
    console.log(
      `Day with number ${nightNumber} already exists in the current game.`
    );
  }

  // აღნიშნეთ, რომ 'games' ველი შეიცვალა
  room.markModified("games");

  // შეინახეთ ოთახის ობიექტი ბაზაში
  await room.save();

  // დააბრუნეთ ოთახი ახლად შექმნილი ღამით
  res.status(201).json({
    status: "success",
    data: { room },
  });
});
// Safe Player By Doctor
exports.doctorAction = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;
  const { safePlayer: safePlayerStatus, playerId: safePlayerId } = req.body;

  // Find the room by roomId
  const room = await Room.findById(roomId);

  if (!room) {
    console.log(`Room with ID ${roomId} not found`);
    return res.status(404).json({
      status: "fail",
      message: `Room with ID ${roomId} not found`,
    });
  }

  // Determine the current game by finding the game with the maximum number
  const currentGame = room.games.reduce((maxGame, game) => {
    return game.number > (maxGame?.number || 0) ? game : maxGame;
  }, null);

  if (!currentGame) {
    console.log(`No games found in the room with ID ${roomId}`);
    return res.status(404).json({
      status: "fail",
      message: `No games found in the room with ID ${roomId}`,
    });
  }

  // Get the current night in the game
  let currentNight = currentGame.nights[currentGame.nights.length - 1];

  // Update the safePlayer status in the current night
  if (safePlayerStatus) {
    currentNight.safePlayer = {
      status: safePlayerStatus,
      playerId: safePlayerId,
    };
  } else {
    delete currentNight.safePlayer;
  }

  // Mark the 'games' field as modified so Mongoose knows to update it
  room.markModified("games");

  // Save the updated room object to the database
  await room.save();

  // Return a successful response with the updated room information
  res.status(201).json({
    status: "success",
  });
});
// Kill player by serial killer
exports.killBySerialKiller = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;
  const { value, playerId } = req.body;

  // Find the room by roomId
  const room = await Room.findById(roomId);

  if (!room) {
    console.log(`Room with ID ${roomId} not found`);
    return res.status(404).json({
      status: "fail",
      message: `Room with ID ${roomId} not found`,
    });
  }

  // Determine the current game by finding the game with the maximum number
  const currentGame = room.games.reduce((maxGame, game) => {
    return game.number > (maxGame?.number || 0) ? game : maxGame;
  }, null);

  if (!currentGame) {
    console.log(`No games found in the room with ID ${roomId}`);
    return res.status(404).json({
      status: "fail",
      message: `No games found in the room with ID ${roomId}`,
    });
  }

  // Get the current night in the game
  let currentNight = currentGame.nights[currentGame.nights.length - 1];

  // Find the serial killer player
  let serialKiller = currentGame.players.find(
    (player) => player.role.value === "serial-killer"
  );

  if (!serialKiller) {
    console.log("Serial killer not found in the current game");
    return res.status(404).json({
      status: "fail",
      message: "Serial killer not found in the current game",
    });
  }

  // Update the serial killer's totalKills and the safePlayer status in the current night

  if (value) {
    if (!currentNight.killedBySerialKiller) {
      serialKiller.role.totalKills -= 1;
    }
    currentNight.killedBySerialKiller = {
      status: true,
      playerId: playerId,
    };
  } else {
    if (currentNight.killedBySerialKiller) {
      delete currentNight?.killedBySerialKiller;
      serialKiller.role.totalKills += 1;
    }
  }

  // Mark the 'games' field as modified so Mongoose knows to update it
  room.markModified("games");

  // Save the updated room object to the database
  await room.save();

  // Return a successful response with the updated room information
  res.status(201).json({
    status: "success",
    data: {
      room,
    },
  });
});
// find sherif
exports.findSherif = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;

  // Find the room by roomId
  const room = await Room.findById(roomId);

  if (!room) {
    console.log(`Room with ID ${roomId} not found`);
    return res.status(404).json({
      status: "fail",
      message: `Room with ID ${roomId} not found`,
    });
  }

  // Determine the current game by finding the game with the maximum number
  const currentGame = room.games.reduce((maxGame, game) => {
    return game.number > (maxGame?.number || 0) ? game : maxGame;
  }, null);

  if (!currentGame) {
    console.log(`No games found in the room with ID ${roomId}`);
    return res.status(404).json({
      status: "fail",
      message: `No games found in the room with ID ${roomId}`,
    });
  }

  // Get the current night in the game
  let currentNight = currentGame.nights[currentGame.nights.length - 1];

  // Update the serial killer's totalKills and the safePlayer status in the current night
  if (currentNight) {
    currentNight.findSherif = req.body;
  }

  // Mark the 'games' field as modified so Mongoose knows to update it
  room.markModified("games");

  // Save the updated room object to the database
  await room.save();

  // Return a successful response with the updated room information
  res.status(201).json({
    status: "success",
    data: {
      room,
    },
  });
});
// find sherif
exports.findMafia = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;

  // Find the room by roomId
  const room = await Room.findById(roomId);

  if (!room) {
    console.log(`Room with ID ${roomId} not found`);
    return res.status(404).json({
      status: "fail",
      message: `Room with ID ${roomId} not found`,
    });
  }

  // Determine the current game by finding the game with the maximum number
  const currentGame = room.games.reduce((maxGame, game) => {
    return game.number > (maxGame?.number || 0) ? game : maxGame;
  }, null);

  if (!currentGame) {
    console.log(`No games found in the room with ID ${roomId}`);
    return res.status(404).json({
      status: "fail",
      message: `No games found in the room with ID ${roomId}`,
    });
  }

  // Get the current night in the game
  let currentNight = currentGame.nights[currentGame.nights.length - 1];

  // Update the serial killer's totalKills and the safePlayer status in the current night
  if (currentNight) {
    currentNight.findMafia = req.body;
  }

  // Mark the 'games' field as modified so Mongoose knows to update it
  room.markModified("games");

  // Save the updated room object to the database
  await room.save();

  // Return a successful response with the updated room information
  res.status(201).json({
    status: "success",
    data: {
      room,
    },
  });
});

// last vote during nomination at day
exports.lastVote = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;
  const { vote } = req.body;

  // Find the room by roomId
  const room = await Room.findById(roomId);

  if (!room) {
    return res.status(404).json({
      status: "fail",
      message: `Room with ID ${roomId} not found`,
    });
  }

  // Determine the index of the current game and day
  const gameIndex = room.games.length - 1;
  const currentGame = room.games[gameIndex];

  if (!currentGame) {
    return res.status(404).json({
      status: "fail",
      message: `No games found in the room with ID ${roomId}`,
    });
  }

  const dayIndex = currentGame.days.length - 1;
  const currentDay = currentGame.days[dayIndex];

  if (!currentDay) {
    return res.status(404).json({
      status: "fail",
      message: `No day found for the current game`,
    });
  }

  // Remove the existing vote from the same voter (votedBy)
  if (currentDay?.lastVotes) {
    currentDay.lastVotes = currentDay.lastVotes.filter(
      (v) => v.votedBy !== vote.votedBy
    );
  } else {
    currentDay.lastVotes = [];
  }

  // If vote.voteFor is defined, add the new vote
  if (vote.voteFor) {
    currentDay.lastVotes.push(vote);
  }

  // Update the room in the database using findByIdAndUpdate
  const updatedRoom = await Room.findByIdAndUpdate(
    roomId,
    {
      $set: {
        [`games.${gameIndex}.days.${dayIndex}.lastVotes`]: currentDay.lastVotes,
      },
    },
    { new: true }
  );

  if (!updatedRoom) {
    return res.status(500).json({
      status: "fail",
      message: `Failed to update room with ID ${roomId}`,
    });
  }

  // Emit the updated votes to all clients in the room
  const io = req.io;
  io.to(roomId).emit("lastVotes", {
    votes: currentDay.lastVotes,
  });

  // Return a successful response with the updated room information
  res.status(201).json({
    status: "success",
    data: {
      votes: currentDay.lastVotes,
    },
  });
});

// last vote during nomination at day
exports.lastVote2 = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;
  const { vote } = req.body;

  // Find the room by roomId
  const room = await Room.findById(roomId);

  if (!room) {
    return res.status(404).json({
      status: "fail",
      message: `Room with ID ${roomId} not found`,
    });
  }

  // Determine the index of the current game and day
  const gameIndex = room.games.length - 1;
  const currentGame = room.games[gameIndex];

  if (!currentGame) {
    return res.status(404).json({
      status: "fail",
      message: `No games found in the room with ID ${roomId}`,
    });
  }

  const dayIndex = currentGame.days.length - 1;
  const currentDay = currentGame.days[dayIndex];

  if (!currentDay) {
    return res.status(404).json({
      status: "fail",
      message: `No day found for the current game`,
    });
  }

  // Remove the existing vote from the same voter (votedBy)
  if (currentDay?.lastVotes2) {
    currentDay.lastVotes2 = currentDay.lastVotes2.filter(
      (v) => v.votedBy !== vote.votedBy
    );
  } else {
    currentDay.lastVotes2 = [];
  }

  // If vote.voteFor is defined, add the new vote
  if (vote.voteFor) {
    currentDay.lastVotes2.push(vote);
  }

  // Update the room in the database using findByIdAndUpdate
  const updatedRoom = await Room.findByIdAndUpdate(
    roomId,
    {
      $set: {
        [`games.${gameIndex}.days.${dayIndex}.lastVotes2`]:
          currentDay.lastVotes2,
      },
    },
    { new: true }
  );

  if (!updatedRoom) {
    return res.status(500).json({
      status: "fail",
      message: `Failed to update room with ID ${roomId}`,
    });
  }

  // Emit the updated votes to all clients in the room
  const io = req.io;
  io.to(roomId).emit("lastVotes", {
    votes: currentDay.lastVotes2,
  });

  // Return a successful response with the updated room information
  res.status(201).json({
    status: "success",
    data: {
      votes: currentDay.lastVotes2,
    },
  });
});
// If in draw in re-vote people decide
exports.peopleDecide = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;
  const { vote } = req.body;

  // Find the room by roomId
  const room = await Room.findById(roomId);

  if (!room) {
    console.log(`Room with ID ${roomId} not found`);
    return res.status(404).json({
      status: "fail",
      message: `Room with ID ${roomId} not found`,
    });
  }

  // Determine the current game by finding the game with the highest number
  const currentGame = room.games[room.games.length - 1];

  if (!currentGame) {
    console.log(`No games found in the room with ID ${roomId}`);
    return res.status(404).json({
      status: "fail",
      message: `No games found in the room with ID ${roomId}`,
    });
  }

  // Get the current day in the game (assuming you're tracking day phases)
  const currentDay = currentGame.days[currentGame.days.length - 1];

  if (!currentDay) {
    console.log(`No day found for the current game`);
    return res.status(404).json({
      status: "fail",
      message: `No day found for the current game`,
    });
  }

  // Initialize lastVotes array if it doesn't exist
  if (!currentDay.peopleDecide) {
    currentDay.peopleDecide = [];
  }

  // Check if the player has already voted, remove their previous vote
  currentDay.peopleDecide = currentDay.peopleDecide.filter(
    (v) => v.player !== vote.player
  );

  // If vote.value is true, add the new vote (false means retract the vote)
  if (vote) {
    currentDay.peopleDecide.push(vote);
  }

  // Mark the 'games' field as modified so Mongoose knows to update it
  room.markModified("games");

  // Save the updated room object to the database
  await room.save();

  const io = req.io;
  io.to(roomId).emit("decideVotes", {
    votes: currentDay.peopleDecide,
  });

  // Return a successful response with the updated room information
  res.status(201).json({
    status: "success",
  });
});

// when user shot down the app, server must make some processes,
// so save this processes in db
exports.afterLeaveData = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;

  // Construct the path for the current game's `afterLeaveData`
  const room = await Room.findById(roomId);
  if (!room) {
    return res.status(404).json({
      status: "fail",
      message: "Room not found",
    });
  }

  const gameIndex = room.games.length - 1;
  const updatePath = `games.${gameIndex}.afterLeaveData`;

  try {
    // Use `findByIdAndUpdate` to directly update the nested field without modifying the whole document
    if (gameIndex !== -1) {
      await Room.findByIdAndUpdate(
        roomId,
        { $set: { [updatePath]: req.body } },
        { new: true, useFindAndModify: false }
      );

      console.log("Saved successfully");
    }

    // Return a successful response
    res.status(201).json({
      status: "success",
    });
  } catch (error) {
    console.error("Error saving room:", error);
    return res.status(500).json({
      status: "fail",
      message: "Failed to save room data.",
      error: error.message,
    });
  }
});

// Add ratings to game
exports.addRating = catchAsync(async (req, res, next) => {
  const roomId = req.params.id;
  const ratingData = req.body;

  // Find the room by roomId
  const room = await Room.findById(roomId);

  if (!room) {
    return res.status(404).json({
      status: "fail",
      message: `Room with ID ${roomId} not found`,
    });
  }

  // Determine the index of the current game
  const gameIndex = room.games.length - 1;
  const currentGame = room.games[gameIndex];

  if (!currentGame) {
    return res.status(404).json({
      status: "fail",
      message: `No games found in the room with ID ${roomId}`,
    });
  }

  // Initialize rating array if it doesn't exist
  if (!currentGame.rating) {
    currentGame.rating = [];
  }

  if (ratingData?.removeOld) {
    // Find the index of the rating item that matches the conditions
    const indexToRemove = currentGame.rating.findIndex(
      (r) =>
        r?.userId === ratingData?.userId &&
        r?.gameStage === ratingData?.gameStage &&
        r?.stageNumber === ratingData?.stageNumber
    );

    // If the item is found, remove it using splice
    if (indexToRemove !== -1) {
      currentGame.rating.splice(indexToRemove, 1);
    }
  }

  if (ratingData?.scenario !== "Cancel") {
    // Push the new rating data to the rating array
    currentGame.rating.push(ratingData);
  }

  // Update the room in the database using findByIdAndUpdate
  const updatedRoom = await Room.findByIdAndUpdate(
    roomId,
    {
      $set: {
        [`games.${gameIndex}.rating`]: currentGame.rating,
      },
    },
    { new: true } // Return the updated room document
  );

  if (!updatedRoom) {
    return res.status(500).json({
      status: "fail",
      message: `Failed to update room with ID ${roomId}`,
    });
  }

  // Emit the updated ratings to all clients in the room
  const io = req.io;
  io.to(roomId).emit("updateRating", {
    rating: currentGame.rating,
  });

  // Send response back to the client
  res.status(200).json({
    status: "success",
    data: {
      rating: currentGame.rating,
    },
  });
});

// Get logs of room
exports.getLogs = catchAsync(async (req, res, next) => {
  const { page = 1 } = req.query; // Default page = 1, limit = 10

  // Find the room by ID and select only the "games" field
  const room = await Room.findById(req.params.id).lean();
  console.log(room);
  if (!room) {
    return next(new AppError("Room not found", 404));
  }

  // Sort the games by gameNumber in descending order and paginate
  const sortedGames =
    room &&
    room?.games
      .sort((a, b) => b.number - a.number) // Sorting in descending order
      .slice((page - 1) * 15, page * 15); // Paginate the results

  res.status(200).json({
    status: "success",
    totalLogs: room.games.length,
    data: {
      logs: sortedGames, // Return the sorted and paginated games
    },
  });
});
// Get period data
exports.getPeriods = catchAsync(async (req, res, next) => {
  // Find the room by ID and select only the "games" field
  const room = await Room.findById(req.params.id).lean();

  if (!room) {
    return next(new AppError("Room not found", 404));
  }

  const gameNumber = req.query.game;
  const period = req.query.period;

  // Sort the games by gameNumber in descending order and paginate
  const foundGame = room.games.find((g) => g.number === parseInt(gameNumber));

  res.status(200).json({
    status: "success",
    totalLogs: room.games.length,
    data: period === "Nights" ? foundGame.nights : foundGame.days,
  });
});
