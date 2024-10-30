const {
  addUser,
  getUser,
  getRoomUsers,
  updateUsers,
  joinRoom,
  leaveRoom,
  getAllUsers,
} = require("./users");
const User = require("../models/userModel");
const Room = require("../models/roomModel");
const { updateRoom } = require("../controllers/roomController");
const { v4: uuidv4 } = require("uuid");
const {
  incrementGamesPlayedForUsers,
  ReJoin,
  getNextPlayer,
} = require("./operations");

module.exports = (io) => {
  // Timers Imports
  const speechTimer = require("./timers/speechTimer")(io);
  const dealingCardsTimer = require("./timers/dealingCardsTimer")(io);
  const gettingKnowsMafias = require("./timers/gettingKnowsMafias")(io);
  const nightTimer = require("./timers/nightTimer")(io);
  const commonTimer = require("./timers/commonTimer")(io);
  const lastWordTimer = require("./timers/lastWordTimer")(io);
  const justifyTimer = require("./timers/justifyTimer")(io);
  const justifyTimer2 = require("./timers/justifyTimer2")(io);
  const votingTimer = require("./timers/votingTimer")(io);
  const votingTimer2 = require("./timers/votingTimer2")(io);
  const peopleDecide = require("./timers/peopleDecideTimer")(io);

  io.on("connection", async (socket) => {
    const userId = socket.handshake.query.userId; // Access userId from the query
    addUser({ socketId: socket.id, userId });
    console.log("A user connected:", socket.id);
    socket.emit("userStatus", "online");
    const user = getUser(userId);

    if (user?.roomId) {
      ReJoin({ user, socket });
    }

    // Event for joining a room
    socket.on("joinRoom", async (roomId, roomName, userId, type) => {
      // Leave all previous rooms before joining a new one
      const rooms = Array.from(socket.rooms);
      rooms.forEach((existingRoom) => {
        if (existingRoom !== socket.id) {
          socket.leave(existingRoom);
        }
      });

      socket.join(roomId); // Joins the specified room
      console.log(`${userId} joined room: ${roomId}`);
      const userData = await User.findById(userId);

      joinRoom({
        socketId: socket.id,
        roomId,
        roomName,
        userId,
        userName: userData.name,
        userCover: userData.cover,
        admin: userData?.admin,
        type,
        status: "online",
      });

      // Get and send the updated list of users in the room
      const usersInRoom = getRoomUsers(roomId);

      io.to(roomId).emit("allUsers", { usersInRoom });
      // Broadcast to other users in the room that a new user has joined
      socket.to(roomId).emit("userJoined", { userId, socketId: socket.id });
      io.emit("updateRoomInfo", {
        usersInRoom,
        roomId,
      });

      io.to(roomId).emit("userStatusInRoom", {
        user: userId,
        status: "online",
      });
    });

    socket.on("leaveRoom", async (roomId, userId) => {
      try {
        console.log(`${userId} left room: ${roomId}`);
        let usersBeforeLeave = getRoomUsers(roomId);

        leaveRoom(userId);
        let usersInRoom = getRoomUsers(roomId);

        const room = await Room.findById(roomId);

        let game;
        if (room?.games.length > 0) {
          game = room?.games[room?.games?.length - 1];
        }

        const afterLeaveProcess = game?.afterLeaveData;

        let activePlayers = usersInRoom.filter((u) => u.type === "player");

        if (
          room.admin.founder?._id === userId ||
          room.admin.founder === userId
        ) {
          // Emit the updated list of users to the room
          io.to(roomId).emit("allUsers", {
            usersInRoom: [],
            gameOver: true,
          });
          io.emit("updateRoomInfo", {
            usersInRoom: [],
            roomId,
            gameLevel: { status: "Finished", finishedAt: new Date() },
          });

          const gameIndex = room.games.length - 1;
          if (gameIndex > -1) {
            console.log("update DB");
            // Use `findByIdAndUpdate` to update `players` and `votes` directly in the database
            const playersPath = `games.${gameIndex}.players`;
            const resultPath = `games.${gameIndex}.result`;
            const levelPath = `games.${gameIndex}.gameLevel`;
            await Room.findByIdAndUpdate(
              roomId,
              {
                $set: {
                  [playersPath]: activePlayers,
                  [resultPath]: { value: true, winners: "Non" },
                  [levelPath]: { status: "Finished", finishedAt: new Date() },
                },
              },
              { new: true, useFindAndModify: false }
            );
            speechTimer.stopTimer(roomId);
            dealingCardsTimer.stopTimer(roomId);
            gettingKnowsMafias.stopTimer(roomId);
            nightTimer.stopTimer(roomId);
            commonTimer.stopTimer(roomId);
            lastWordTimer.stopTimer(roomId);
            justifyTimer.stopTimer(roomId);
            justifyTimer2.stopTimer(roomId);
            votingTimer.stopTimer(roomId);
            votingTimer2.stopTimer(roomId);
            peopleDecide.stopTimer(roomId);
          }

          usersBeforeLeave?.map((u) => {
            io.to(u?.roomId).emit("userLeft", {
              userId: u.userId,
              type: "Room closed",
            });
            leaveRoom(u.userId);
            const socketId = u.socketId;
            const specificSocket = io.sockets.sockets.get(socketId);
            specificSocket.leave(roomId);
          });
          socket.leave(roomId);
        } else {
          if (game?.gameLevel?.status === "In Play") {
            let gameOver;
            const aliveMafias = activePlayers.filter(
              (player) => player.role.value.includes("mafia") && !player?.death
            ).length;
            const aliveNonMafias = activePlayers.filter(
              (player) => !player.role.value.includes("mafia") && !player?.death
            );
            const aliveNonMafiasCount = aliveNonMafias.length;
            const nonDeathPlayers = activePlayers?.filter((p) => !p.death);
            // Condition 1: Mafia equal to non-mafia
            if (aliveMafias === aliveNonMafiasCount) {
              if (nonDeathPlayers.length > 2) {
                gameOver = { value: true, winners: "Mafia" };
              } else if (nonDeathPlayers.length === 2) {
                // Condition 2: Two players left, one of them is a serial killer
                if (aliveNonMafias[0].role.value === "serial-killer") {
                  gameOver = { value: true, winners: "Serial Killer" };
                } else {
                  gameOver = { value: true, winners: "Mafia" };
                }
              }
            }
            // Condition 3: More mafias than non-mafias
            else if (aliveMafias > aliveNonMafiasCount) {
              gameOver = { value: true, winners: "Mafia" };
            }
            // Condition 4: No mafias left
            else if (aliveMafias === 0) {
              gameOver = { value: true, winners: "Citizens" };
            }
            // Default case: Game is not over yet
            else {
              gameOver = { winners: "condition not enough..." };
            }

            if (gameOver?.value) {
              const gameIndex = room.games.length - 1;
              // Use `findByIdAndUpdate` to update `players` and `votes` directly in the database
              const playersPath = `games.${gameIndex}.players`;
              const resultPath = `games.${gameIndex}.result`;
              const levelPath = `games.${gameIndex}.gameLevel`;
              await Room.findByIdAndUpdate(
                roomId,
                {
                  $set: {
                    [playersPath]: usersInRoom?.filter(
                      (u) => u.type === "player"
                    ),
                    [resultPath]: gameOver,
                    [levelPath]: { status: "Finished", finishedAt: new Date() },
                    finishedAt: new Date(),
                  },
                },
                { new: true, useFindAndModify: false }
              );

              // Example usage: Update gamesPlayed for an array of user IDs
              const userIds = usersInRoom
                ?.filter((u) => u.type === "player")
                .map((i) => i.userId); // Replace with real user IDs
              incrementGamesPlayedForUsers(userIds);

              /**
               * Update rating
               */

              // Assuming currentGame?.rating is an array of objects with userId and points
              const gameRatings = [room?.games[gameIndex]]?.rating || [];

              // Use reduce to collect total points for each unique userId
              const userPointsMap = gameRatings.reduce((acc, rating) => {
                if (rating?.userId && rating?.points) {
                  // If the userId already exists, sum the points
                  if (acc[rating.userId]) {
                    acc[rating.userId] += rating.points;
                  } else {
                    // Otherwise, initialize with the current points
                    acc[rating.userId] = rating.points;
                  }
                }
                return acc;
              }, {});

              // Now update each user in the User collection
              const updateUserRatings = async () => {
                for (const userId of Object.keys(userPointsMap)) {
                  const points = userPointsMap[userId];
                  try {
                    // Update each user's rating by incrementing the existing rating by the new points
                    await User.updateOne(
                      { _id: userId }, // Find the user by userId
                      {
                        $inc: { rating: points }, // Increment the rating field by the total points collected
                      }
                    );
                    console.log(`Updated rating for user: ${userId}`);
                  } catch (error) {
                    console.error(
                      `Error updating rating for user ${userId}:`,
                      error
                    );
                  }
                }
              };

              // Call the function to update user ratings
              updateUserRatings();

              usersInRoom = usersInRoom?.map((u) => {
                if (u.type === "player") {
                  return {
                    userId: u.userId,
                    socketId: u.socketId,
                    roomId: u.roomId,
                    roomName: u.roomName,
                    userName: u.userName,
                    userCover: u.userCover,
                    addedTime: u.addedTime,
                    admin: u?.admin,
                    type: u.type,
                  };
                } else {
                  return u;
                }
              });

              // Emit the updated list of users to the room
              io.to(roomId).emit("allUsers", {
                usersInRoom,
                gameOver: true,
                message: {
                  type: "User Left Game",

                  user: game.players.find((p) => p.userId === userId)
                    .playerNumber
                    ? "N: " +
                      game.players.find((p) => p.userId === userId).playerNumber
                    : game.players.find((p) => p.userId === userId).userName,
                },
              });
              // Remove the user from the socket room
              io.to(roomId).emit("gameOver", { gameOver, usersInRoom });

              speechTimer.stopTimer(roomId);
              dealingCardsTimer.stopTimer(roomId);
              gettingKnowsMafias.stopTimer(roomId);
              nightTimer.stopTimer(roomId);
              commonTimer.stopTimer(roomId);
              lastWordTimer.stopTimer(roomId);
              justifyTimer.stopTimer(roomId);
              justifyTimer2.stopTimer(roomId);
              votingTimer.stopTimer(roomId);
              votingTimer2.stopTimer(roomId);
              peopleDecide.stopTimer(roomId);

              io.emit("updateRoomInfo", {
                usersInRoom,
                roomId,
                gameLevel: { status: "Finished", finishedAt: new Date() },
              });
              updateUsers(usersInRoom);
            } else {
              if (afterLeaveProcess?.value === "speechToNextPlayer") {
                const data = afterLeaveProcess.data;
                const firstSpeecher = data.firstSpeecher;
                const day = game.days[game.days.length - 1];

                usersInRoom = usersInRoom.filter((u) => u.type === "player");

                const usersInRoomIds = new Set(
                  usersInRoom.map((user) => user.userId)
                );

                // Filter game.players to keep only those that are in usersInRoom
                game.players = game.players.filter((player) =>
                  usersInRoomIds.has(player.userId)
                );

                const nextPlayerToSpeech = getNextPlayer({
                  game,
                  data,
                  firstSpeecher,
                });

                let speechEnd;

                if (
                  firstSpeecher?.playerNumber ===
                    nextPlayerToSpeech?.playerNumber ||
                  !nextPlayerToSpeech
                ) {
                  speechEnd = true;
                }
                if (
                  afterLeaveProcess?.data?.currentPlayerToSpeech.userId ===
                  userId
                ) {
                  speechTimer.stopTimer(data?.roomId);
                  io.to(data.roomId).emit("SpeechTimerEnd", {
                    gameStage: data.gameStage,
                    nextPlayerToSpeech: nextPlayerToSpeech,
                    firstSpeecher: firstSpeecher,
                    nextDayNumber: day?.number + 1,
                    votes: day?.votes,
                    speechEnd,
                    players: game.players,
                  });
                }
              }

              // Emit the updated list of users to the room
              io.to(roomId).emit("allUsers", {
                usersInRoom,
                message: {
                  type: "User Left Game",

                  user: usersBeforeLeave.find((p) => p.userId === userId)
                    ?.playerNumber
                    ? "N: " +
                      usersBeforeLeave?.find((p) => p.userId === userId)
                        ?.playerNumber
                    : usersBeforeLeave?.find((p) => p.userId === userId)
                        ?.userName,
                },
              });
              io.emit("updateRoomInfo", {
                usersInRoom,
                roomId,
                gameLevel: { status: "In Play" },
              });
            }
          } else {
            const updated = usersInRoom?.map((u) => {
              if (u.type === "player") {
                return {
                  userId: u.userId,
                  socketId: u.socketId,
                  roomId: u.roomId,
                  roomName: u.roomName,
                  userName: u.userName,
                  userCover: u.userCover,
                  addedTime: u.addedTime,
                  type: u.type,
                  readyToStart: u.readyToStart,
                  admin: u.admin,
                };
              } else {
                return u;
              }
            });

            io.to(roomId).emit("allUsers", {
              usersInRoom: updated,
              message: {
                type: "User Left Game",

                user: game?.players.find((p) => p.userId === userId)
                  ?.playerNumber
                  ? "N: " +
                    game?.players.find((p) => p.userId === userId)?.playerNumber
                  : game?.players.find((p) => p.userId === userId)?.userName,
              },
            });

            io.emit("updateRoomInfo", {
              usersInRoom,
              roomId,
              gameLevel: { status: "Finished", finishedAt: new Date() },
            });
          }
          io.to(roomId).emit("userLeft", { userId });

          const socketId = usersBeforeLeave?.find(
            (u) => u.userId === userId
          ).socketId;

          const specificSocket = io.sockets.sockets.get(socketId);

          specificSocket.leave(roomId);
        }
      } catch (error) {
        console.error(`Error handling 'leaveRoom' event: ${error}`);
      }
    });

    socket.on("changeType", async ({ roomId, newType, userId }) => {
      let usersInRoom = getRoomUsers(roomId);
      usersInRoom = usersInRoom?.map((r) => {
        if (r?.userId === userId) {
          return { ...r, type: newType };
        } else {
          return r;
        }
      });
      io.to(roomId).emit("allUsers", { usersInRoom });
      io.emit("updateRoomInfo", {
        usersInRoom: usersInRoom,
        roomId,
      });

      updateUsers(usersInRoom);
    });

    // Ready to play
    socket.on("readyToStart", async ({ roomId, userId, status }) => {
      const room = await Room.findById(roomId);

      // Define current room with live members
      let usersInRoom = getRoomUsers(roomId);

      // if user press to "cancel" when already all users pressed "ready", avoid cancelation.
      let players = usersInRoom.filter((u) => u.type === "player");
      if (
        players?.filter((i) => i.readyToStart).length ===
        room.options.maxPlayers
      ) {
        if (!status) {
          return;
        }
      }

      // step: 1 - change user status "ready to play" or "not"
      players = players?.map((user) => {
        if (user.userId === userId) {
          return { ...user, readyToStart: status };
        } else {
          return user;
        }
      });

      io.to(roomId).emit("updatePlayers", players);
      updateUsers(
        usersInRoom?.map((user) => {
          let us = players.find((p) => p.userId === user.userId);
          if (user) {
            return us;
          } else {
            return user;
          }
        })
      );

      io.emit("updateRoomInfo", {
        usersInRoom,
        roomId,
        gameLevel: { status: "In Play", level: "readyToStart" },
      });
    });

    // Start to play
    socket.on("startPlay", async ({ roomId, confirmedRoles }) => {
      const room = await Room.findById(roomId);

      // Define current room with live members
      let usersInRoom = getRoomUsers(roomId);

      // if user press to "cancel" when already all users pressed "ready", avoid cancelation.
      let players = usersInRoom.filter((u) => u.type === "player");

      let roles = [];

      // Define all roles with necessary repetition
      confirmedRoles.map((role) => {
        if (role.value === "mafia") {
          if (room.roles.find((r) => r.value.includes("don"))) {
            for (let i = 0; i < room.options.maxMafias - 1; i++) {
              roles.push(role);
            }
          } else {
            for (let i = 0; i < room.options.maxMafias; i++) {
              roles.push(role);
            }
          }
        } else if (role.value === "citizen") {
          let totalCitizens =
            room.options.maxPlayers -
            room.options.maxMafias -
            (confirmedRoles.length - 2);
          for (let i = 0; i < totalCitizens; i++) {
            roles.push(role);
          }
        } else {
          roles.push(role);
        }
      });

      roles = roles.map((role) => {
        if (role.value === "serial-killer") {
          let totalMafias = roles.filter(
            (role) => role.value === "mafia"
          ).length;
          if (totalMafias === 1) {
            return { ...role, totalKills: 1 };
          } else {
            return { ...role, totalKills: totalMafias - 1 };
          }
        } else {
          return role;
        }
      });

      // Shuffle roles to ensure randomness
      const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
        }
      };

      shuffleArray(roles);

      // Assign roles to players by adding a new 'role' field to each user object
      players = players.map((user, index) => {
        return {
          ...user, // Spread the original user object properties
          role: roles[index], // Add the role field to the user object
          playerNumber: index + 1,
        };
      });

      updateUsers(
        usersInRoom?.map((user) => {
          let us = players.find((p) => p.userId === user.userId);
          if (user) {
            return us;
          } else {
            return user;
          }
        })
      );

      if (!Array.isArray(room.games)) {
        room.games = [];
      }

      // ვქმნით თამაშს ოთახის ბაზაში
      if (room) {
        // თუ 'games' არის undefined, შექმენით მასივი
        if (!room.games) {
          room.games = [];
        }

        // მოძებნეთ მიმდინარე თამაში
        let currentGame = room.games[room.games.length - 1];

        // თუ მიმდინარე თამაში არ არსებობს, შექმენით ახალი თამაში და დაამატეთ მასივში

        const newGame = {
          id: uuidv4(),
          number: currentGame ? room.games.length + 1 : 1,
          players: players,
          gameLevel: { status: "In Play", level: "startPlay" },
          createdAt: new Date(),
        };
        room.games.push(newGame);

        // აღნიშნეთ, რომ 'games' ველი შეიცვალა
        room.markModified("games");

        // შეინახეთ ოთახის ობიექტი ბაზაში
        await room.save();

        io.to(roomId).emit("updateRoom", {
          room: room,
        });

        io.to(roomId).emit("gameStarted", {
          players,
        });

        io.emit("updateRoomInfo", {
          usersInRoom,
          roomId,
          gameLevel: newGame?.gameLevel,
        });
      } else {
        console.log(`Room with ID ${roomId} not found`);
        io.emit("updateRoomInfo", {
          usersInRoom,
          roomId,
          gameLevel: room?.games[room?.games?.length - 1]?.gameLevel,
        });
      }
    });

    /**
     *  Strting Timers
     * */

    // Dealing Cards timer logic
    socket.on("DealingCardsTimerStart", (data) => {
      dealingCardsTimer.startTimer({
        roomId: data.roomId,
      });
    });

    // Getting knows mafias timer
    socket.on("GettingKnowMafiasTimerStart", (data) => {
      gettingKnowsMafias.startTimer({
        roomId: data.roomId,
      });
    });

    /**
     * Confirm roles and start 1 day
     */
    socket.on("confirmRole", async ({ roomId, userId }) => {
      const room = await Room.findById(roomId);
      const game = room.games[room.games.length - 1];

      const usersInRoom = getRoomUsers(roomId);
      players = usersInRoom.filter((u) => u.type === "player");
      // Update the user's role to confirm it
      players = players.map((user) => {
        if (user.userId === userId) {
          return { ...user, role: { ...user.role, confirm: true } };
        } else {
          return user;
        }
      });
      updateUsers(
        usersInRoom?.map((user) => {
          let us = players.find((p) => p.userId === user.userId);
          if (user) {
            return us;
          } else {
            return user;
          }
        })
      );

      io.to(roomId).emit("updatePlayers", players);

      // Emit the gameProcess event only to the particular user
      const targetUserSocket = players.find(
        (user) => user.userId === userId
      )?.socketId;

      if (targetUserSocket) {
        if (players.find((user) => !user?.role?.confirm)) {
          io.to(targetUserSocket).emit("roleConfirmed", {
            value: "Users are confirming own roles..",
            options: [],
            players: players,
          });
        } else {
          dealingCardsTimer.stopTimer(roomId);
          game.players = players;
          io.to(roomId).emit("roleConfirmed", {
            value: "Getting to know mafias",
            options: [],
            players: players,
          });
        }
      } else {
        console.error(`Socket ID not found for user with ID ${userId}`);
      }
    });

    /**
     *
     */
    // Next timers

    socket.on("SpeechTimerStart", async (data) => {
      speechTimer.startTimer({
        roomId: data.roomId,
        gameStage: data.gameStage,
        currentPlayerToSpeech: data.currentPlayerToSpeech,
        firstSpeecher: data.firstSpeecher,
      });
      const room = await Room.findById(data.roomId);
      const gameIndex = room.games.length - 1;
      const levelPath = `games.${gameIndex}.gameLevel`;

      await Room.findByIdAndUpdate(
        data.roomId,
        {
          $set: {
            [levelPath]: {
              status: "In Play",
              level: "Day",
              data: {
                currentPlayerToSpeech: data.currentPlayerToSpeech,
                firstSpeecher: data.firstSpeecher,
              },
            },
          },
        },
        { new: true, useFindAndModify: false }
      );
    });
    socket.on("changeSpeaker", async (data) => {
      speechTimer.stopTimer(data?.roomId);
      const firstSpeecher = data.firstSpeecher;
      const room = await Room.findById(data?.roomId);
      const game = room.games[room.games.length - 1];
      const day = game.days[game.days.length - 1];

      const nextPlayerToSpeech = getNextPlayer({ game, data, firstSpeecher });

      let speechEnd;

      if (
        firstSpeecher?.playerNumber === nextPlayerToSpeech?.playerNumber ||
        !nextPlayerToSpeech
      ) {
        speechEnd = true;
      }

      io.to(data.roomId).emit("SpeechTimerEnd", {
        gameStage: data.gameStage,
        nextPlayerToSpeech: nextPlayerToSpeech,
        firstSpeecher: firstSpeecher,
        nextDayNumber: day?.number + 1,
        votes: day?.votes,
        speechEnd,
        players: game.players,
      });
    });

    socket.on("NightTimerStart", async (data) => {
      nightTimer.startTimer({
        roomId: data.roomId,
      });
      const room = await Room.findById(data.roomId);
      const gameIndex = room.games.length - 1;
      const levelPath = `games.${gameIndex}.gameLevel`;

      await Room.findByIdAndUpdate(
        data.roomId,
        {
          $set: {
            [levelPath]: {
              status: "In Play",
              level: "Night",
            },
          },
        },
        { new: true, useFindAndModify: false }
      );
    });

    socket.on("CommonTimerStart", async (data) => {
      commonTimer.startTimer({
        roomId: data.roomId,
      });

      const room = await Room.findById(data.roomId);
      const gameIndex = room.games.length - 1;
      const levelPath = `games.${gameIndex}.gameLevel`;

      await Room.findByIdAndUpdate(
        data.roomId,
        {
          $set: {
            [levelPath]: {
              status: "In Play",
              level: "Common Time",
            },
          },
        },
        { new: true, useFindAndModify: false }
      );
    });

    socket.on("LastWordTimerStart", async (data) => {
      lastWordTimer.startTimer({
        roomId: data.roomId,
        gameStage: data.gameStage,
        nextDeath: data.nextDeath,
        deaths: data.deaths,
      });

      const room = await Room.findById(data.roomId);
      const gameIndex = room.games.length - 1;
      const levelPath = `games.${gameIndex}.gameLevel`;

      await Room.findByIdAndUpdate(
        data.roomId,
        {
          $set: {
            [levelPath]: {
              status: "In Play",
              level: "Personal Time Of Death",
              data: {
                gameStage: data.gameStage,
                nextDeath: data.nextDeath,
                deaths: data.deaths,
              },
            },
          },
        },
        { new: true, useFindAndModify: false }
      );
    });

    socket.on("skipLastTimer", async (data) => {
      lastWordTimer.stopTimer(data?.roomId);

      const room = await Room.findById(data?.roomId);
      const currentGame = room?.games?.[room.games.length - 1];
      const players = currentGame.players;

      io.to(data?.roomId).emit("LastWordTimerEnd", {
        players,
        gameStage: data.gameStage,
        nextDeath: data.nextDeath,
        deaths: data.deaths,
      });
    });

    socket.on("JustifyTimerStart", async (data) => {
      justifyTimer.startTimer({
        roomId: data.roomId,
        player: data.player,
        list: data.list,
      });

      const room = await Room.findById(data.roomId);
      const gameIndex = room.games.length - 1;
      const levelPath = `games.${gameIndex}.gameLevel`;

      await Room.findByIdAndUpdate(
        data.roomId,
        {
          $set: {
            [levelPath]: {
              status: "In Play",
              level: "Day",
              subLevel: "JustifyTimer",
              data: {
                player: data.player,
                list: data.list,
                nominationNumber: data?.nominationNumber,
                players: room.games[room.games.length - 1].players,
              },
            },
          },
        },
        { new: true, useFindAndModify: false }
      );
    });

    socket.on("SkipNominationSpeech", async (data) => {
      justifyTimer.stopTimer(data?.roomId);
      justifyTimer2.stopTimer(data?.roomId);

      const room = await Room.findById(data?.roomId);
      const currentGame = room?.games?.[room.games.length - 1];
      const players = currentGame.players;

      io.to(data?.roomId).emit(`JustifyTimer${data?.nominationNumber}End`, {
        player: data?.player,
        list: data?.list,
        players,
      });
    });

    socket.on("JustifyTimer2Start", async (data) => {
      justifyTimer2.startTimer({
        roomId: data.roomId,
        player: data.player,
        list: data.list,
      });

      const room = await Room.findById(data.roomId);
      const gameIndex = room.games.length - 1;
      const levelPath = `games.${gameIndex}.gameLevel`;

      await Room.findByIdAndUpdate(
        data.roomId,
        {
          $set: {
            [levelPath]: {
              status: "In Play",
              level: "Day",
              subLevel: "JustifyTimer2",
              data: {
                player: data.player,
                list: data.list,
                nominationNumber: data?.nominationNumber,
                players: room.games[room.games.length - 1].players,
              },
            },
          },
        },
        { new: true, useFindAndModify: false }
      );
    });

    socket.on("VotingTimerStart", async (data) => {
      votingTimer.startTimer({
        roomId: data.roomId,
      });

      const room = await Room.findById(data.roomId);
      const gameIndex = room.games.length - 1;
      const votingPath = `games.${gameIndex}.gameLevel.voting`;

      await Room.findByIdAndUpdate(
        data.roomId,
        {
          $set: {
            [votingPath]: true, // Set `voting` to true within `gameLevel`
          },
        },
        { new: true, useFindAndModify: false }
      );
    });

    socket.on("VotingTimer2Start", async (data) => {
      votingTimer2.startTimer({
        roomId: data.roomId,
      });

      const room = await Room.findById(data.roomId);
      const gameIndex = room.games.length - 1;
      const votingPath = `games.${gameIndex}.gameLevel.voting2`;

      await Room.findByIdAndUpdate(
        data.roomId,
        {
          $set: {
            [votingPath]: true, // Set `voting` to true within `gameLevel`
          },
        },
        { new: true, useFindAndModify: false }
      );
    });

    socket.on("PeopleDecideTimerStart", async (data) => {
      peopleDecide.startTimer({
        roomId: data.roomId,
      });
      const room = await Room.findById(data.roomId);
      const gameIndex = room.games.length - 1;
      const levelPath = `games.${gameIndex}.gameLevel`;

      await Room.findByIdAndUpdate(
        data.roomId,
        {
          $set: {
            [levelPath]: {
              status: "In Play",
              level: "Day",
              subLevel: "People Decide",
            },
          },
        },
        { new: true, useFindAndModify: false }
      );
    });

    /**
     *
     */

    /**
     * Voice to kill by any roles during the day
     */
    socket.on("voiceToLeave", async ({ roomId, victimId, killerId }) => {
      try {
        // Find the room document
        let room = await Room.findById(roomId);

        if (!room) {
          console.log(`Room with ID ${roomId} not found`);
          return;
        }

        // Determine the index of the current game (the last one in the array)
        const gameIndex = room.games.length - 1;
        if (gameIndex < 0) {
          console.log(`No games found in the room with ID ${roomId}`);
          return;
        }

        const usersInRoom = getRoomUsers(roomId);
        const playersPath = `games.${gameIndex}.players`;
        const votesPath = `games.${gameIndex}.days.${
          room.games[gameIndex].days.length - 1
        }.votes`;

        // Prepare the updates for the votes
        const currentDay =
          room.games[gameIndex].days[room.games[gameIndex].days.length - 1];
        let updatedVotes = [...currentDay.votes];

        // Find if there's already an existing vote with the same killerId
        const existingVoteIndex = updatedVotes.findIndex(
          (vote) => vote.killer === killerId
        );
        if (existingVoteIndex > -1) {
          if (updatedVotes[existingVoteIndex].victim === victimId) {
            // Remove the vote if the victimId is already targeted by the same killerId
            updatedVotes = updatedVotes.filter(
              (vote) => vote.killer !== killerId
            );
          } else {
            // Update the existing vote with the new victimId
            updatedVotes[existingVoteIndex].victim = victimId;
          }
        } else {
          // Add a new vote if no existing vote from this killerId
          updatedVotes.push({ victim: victimId, killer: killerId });
        }

        // Use `findByIdAndUpdate` to update `players` and `votes` directly in the database
        room = await Room.findByIdAndUpdate(
          roomId,
          {
            $set: {
              [playersPath]: usersInRoom,
              [votesPath]: updatedVotes,
            },
          },
          { new: true, useFindAndModify: false }
        ).lean();

        // Add the total number of games for each room after the query
        // Add the total number of games for each room after the query
        room.totalGames = room.games?.length || 0; // Add total games count
        room.lastGame =
          room.games.length > 0 ? room.games[room.games.length - 1] : 0;
        room.games = [];
        // Fetch founder details
        const founder = await User.findById(room.admin.founder)
          .select("name cover _id")
          .lean();

        // Attach founder details to the room
        room.admin.founder = {
          name: founder.name,
          cover: founder.cover,
          _id: founder._id,
        };
        // Fetch live members in the room
        let liveMembers = getRoomUsers(room._id.toString());
        // Emit the updated room information to all clients in the room

        // Emit the updated room information to all clients in the room
        io.to(roomId).emit("updateRoom", {
          room: {
            ...room,
            liveMembers,
          },
        });
      } catch (error) {
        console.error("Error updating room:", error);
      }
    });

    /**
     * მოთამაშის მკვლელობა ღამის განმავლობაში მაფიის მიერ (შესაძლებელია მხოლოდ ერთი მსხვერპლისთვის ხმის მიცემა)
     */
    socket.on("voiceToKill", async ({ roomId, victimId, killerId }) => {
      try {
        // Find the room document
        let room = await Room.findById(roomId);

        if (!room) {
          console.log(`Room with ID ${roomId} not found`);
          return;
        }

        // Determine the index of the current game (the last one in the array)
        const gameIndex = room.games.length - 1;
        if (gameIndex < 0) {
          console.log(`No games found in the room with ID ${roomId}`);
          return;
        }

        // Determine the path for the players and current night's votes
        const usersInRoom = getRoomUsers(roomId);
        const playersPath = `games.${gameIndex}.players`;
        const nightIndex = room.games[gameIndex].nights.length - 1;
        const votesPath = `games.${gameIndex}.nights.${nightIndex}.votes`;

        // Prepare the updated votes array
        const currentNight = room.games[gameIndex].nights[nightIndex];
        let updatedVotes = [...currentNight.votes];

        // Find if there's already an existing vote with the same killerId
        const existingVoteIndex = updatedVotes.findIndex(
          (vote) => vote.killer === killerId
        );
        if (existingVoteIndex > -1) {
          if (updatedVotes[existingVoteIndex].victim === victimId) {
            // Remove the vote if the victimId is already targeted by the same killerId
            updatedVotes = updatedVotes.filter(
              (vote) => vote.killer !== killerId
            );
          } else {
            // Update the existing vote with the new victimId
            updatedVotes[existingVoteIndex].victim = victimId;
          }
        } else {
          // Add a new vote if no existing vote from this killerId
          updatedVotes.push({ victim: victimId, killer: killerId });
        }

        // Use `findByIdAndUpdate` to update `players` and `votes` directly in the database
        room = await Room.findByIdAndUpdate(
          roomId,
          {
            $set: {
              [playersPath]: usersInRoom,
              [votesPath]: updatedVotes,
            },
          },
          { new: true, useFindAndModify: false }
        ).lean();

        // Add the total number of games for each room after the query
        // Add the total number of games for each room after the query
        room.totalGames = room.games?.length || 0; // Add total games count
        room.lastGame =
          room.games.length > 0 ? room.games[room.games.length - 1] : 0;
        room.games = [];
        // Fetch founder details
        const founder = await User.findById(room.admin.founder)
          .select("name cover _id")
          .lean();

        // Attach founder details to the room
        room.admin.founder = {
          name: founder.name,
          cover: founder.cover,
          _id: founder._id,
        };

        // Fetch live members in the room
        let liveMembers = getRoomUsers(room._id.toString());
        // Emit the updated room information to all clients in the room

        io.to(roomId).emit("updateRoom", {
          room: {
            ...room,
            liveMembers,
          },
        });
      } catch (error) {
        console.error("Error updating room:", error);
      }
    });

    /**
     * Exit Game
     */
    socket.on(
      "exitPlayer",
      async ({
        roomId,
        exitPlayers,
        nextDayNumber,
        nextNightNumber,
        after,
      }) => {
        const room = await Room.findById(roomId);
        const currentGame = room?.games[room.games.length - 1];
        let players = currentGame.players;
        // Mark the exiting players as death
        players = players.map((user) => {
          if (exitPlayers.some((player) => player.userId === user.userId)) {
            return { ...user, death: true };
          }
          return user;
        });

        // Check if the game should end
        const alivePlayers = players.filter((player) => !player.death);

        let gameOver;
        const aliveMafias = alivePlayers.filter((player) =>
          player.role.value.includes("mafia")
        ).length;

        const aliveNonMafias = alivePlayers.filter(
          (player) => !player.role.value.includes("mafia")
        );
        const aliveNonMafiasCount = aliveNonMafias.length;

        // Condition 1: Mafia equal to non-mafia
        if (aliveMafias === aliveNonMafiasCount) {
          if (alivePlayers.length > 2) {
            gameOver = { value: true, winners: "Mafia" };
          } else if (alivePlayers.length === 2) {
            // Condition 2: Two players left, one of them is a serial killer
            if (aliveNonMafias[0].role.value === "serial-killer") {
              gameOver = { value: true, winners: "Serial Killer" };
            } else {
              gameOver = { value: true, winners: "Mafia" };
            }
          }
        }
        // Condition 3: More mafias than non-mafias
        else if (aliveMafias > aliveNonMafiasCount) {
          gameOver = { value: true, winners: "Mafia" };
        }
        // Condition 4: No mafias left
        else if (aliveMafias === 0) {
          gameOver = { value: true, winners: "Citizens" };
        }

        if (gameOver) {
          players = players.map((user) => ({
            ...user,
            readyToStart: false,
            death: false,
            role: undefined,
          }));

          const usersInRoom = getRoomUsers(roomId);
          updateUsers(
            usersInRoom?.map((u) => {
              if (u.type === "player") {
                return {
                  ...u,
                  readyToStart: false,
                  death: false,
                  role: undefined,
                };
              } else {
                return u;
              }
            })
          );

          // Example usage: Update gamesPlayed for an array of user IDs
          const userIds = usersInRoom
            ?.filter((u) => u.type === "player")
            .map((i) => i.userId); // Replace with real user IDs

          incrementGamesPlayedForUsers(userIds);

          currentGame.result = { ...gameOver, finishedAt: new Date() };
          currentGame.gameLevel = {
            status: "Finished",
            finishedAt: new Date(),
          };

          room.markModified("games");
          await room.save();

          /**
           * Update rating
           */

          // Assuming currentGame?.rating is an array of objects with userId and points
          const gameRatings = currentGame?.rating || [];

          // Use reduce to collect total points for each unique userId
          const userPointsMap = gameRatings.reduce((acc, rating) => {
            if (rating?.userId && rating?.points) {
              // If the userId already exists, sum the points
              if (acc[rating.userId]) {
                acc[rating.userId] += rating.points;
              } else {
                // Otherwise, initialize with the current points
                acc[rating.userId] = rating.points;
              }
            }
            return acc;
          }, {});

          // Now update each user in the User collection
          const updateUserRatings = async () => {
            for (const userId of Object.keys(userPointsMap)) {
              const points = userPointsMap[userId];
              try {
                // Update each user's rating by incrementing the existing rating by the new points
                await User.updateOne(
                  { _id: userId }, // Find the user by userId
                  {
                    $inc: { rating: points }, // Increment the rating field by the total points collected
                  }
                );
                console.log(`Updated rating for user: ${userId}`);
              } catch (error) {
                console.error(
                  `Error updating rating for user ${userId}:`,
                  error
                );
              }
            }
          };

          // Call the function to update user ratings
          updateUserRatings();
        }

        // Emit the exitPlayers event to the room
        io.to(players[0]?.roomId).emit("exitPlayers", {
          exitPlayers,
          gameOver,
          players,
          nextDayNumber,
          nextNightNumber,
          after: after === "Day" ? "After Day" : "After Night",
        });

        io.emit("updateRoomInfo", {
          roomId,
          gameLevel: currentGame?.gameLevel,
        });
      }
    );

    /**
     * Rerender auth user to get updated data
     */
    socket.on("rerenderAuthUser", async ({ userId }) => {
      try {
        // Fetch user by userId
        let user = getUser(userId);

        // Ensure the user exists and has a socketId
        if (!user || !user.socketId) {
          return;
        }

        // Send notification to the specific user's socket
        io.to(user.socketId).emit("rerenderedAuthUser");
      } catch (error) {
        console.error(`Error sending notification to user ${userId}:`, error);
      }
    });

    /**
     *
     * Notifications
     *
     */
    socket.on("notifications", async ({ userId }) => {
      try {
        // Fetch user by userId
        let user = getUser(userId);

        // Ensure the user exists and has a socketId
        if (!user || !user.socketId) {
          return;
        }
        // Send notification to the specific user's socket
        io.to(user.socketId).emit("updateNotifications");
      } catch (error) {
        console.error(`Error sending notification to user ${userId}:`, error);
      }
    });
    socket.on("reconnect_attempt", () => {
      console.log("User attempting to reconnect");
    });

    socket.on("reconnect_failed", () => {
      console.log("Reconnection failed");
    });

    socket.on("reconnect", () => {
      console.log("User reconnected");
    });

    // Handle disconnection
    socket.on("disconnect", async () => {
      console.log("A user disconnected:", socket.id);
      const allUsers = getAllUsers();
      const user = allUsers.find((u) => u.socketId === socket.id);

      socket.emit("userStatus", "offline");
      let usersInRoom = getRoomUsers(user?.roomId);

      io.to(user?.roomId).emit("userStatusInRoom", {
        user: user?.userId,
        status: "offline",
      });

      usersInRoom = usersInRoom?.map((u) => {
        if (u.userId === user?.userId) {
          return { ...u, status: "offline" };
        } else {
          return u;
        }
      });
      updateUsers(usersInRoom);
      io.to(user?.roomId).emit("updatePlayers", usersInRoom);
    });
  });
};
