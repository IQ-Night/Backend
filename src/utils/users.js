/** socket io connection functions
 *  */

const Room = require("../models/roomModel");

// if users are online they are in this array
let users = [];

// this function adds user to online users array
const addUser = ({ userId, socketId }) => {
  console.log("add user");
  !users.some((user) => user.userId === userId) &&
    users.push({ userId, socketId });
};

const getAllUsers = () => {
  return users;
};

const joinRoom = ({
  userId,
  roomId,
  roomName,
  socketId,
  userName,
  userCover,
  type,
  status,
  admin,
}) => {
  console.log("Updating or adding user");

  // Check if the user already exists in the array
  const userIndex = users.findIndex((user) => user.userId === userId);

  if (userIndex !== -1) {
    // User exists, update their details
    users[userIndex] = {
      ...users[userIndex], // Preserve existing properties
      socketId,
      roomId,
      roomName,
      userName,
      userCover,
      addedTime: users[userIndex]?.addedTime
        ? users[userIndex]?.addedTime
        : new Date(),
      type,
      status,
      admin,
    };
  } else {
    // User doesn't exist, add a new user
    users.push({
      userId,
      socketId,
      roomId,
      roomName,
      userName,
      userCover,
      addedTime: new Date(),
      type,
      status,
      admin,
    });
  }
};
// leave room
const leaveRoom = (userId) => {
  users = users.map((user) => {
    if (user.userId === userId) {
      return { userId: user.userId, socketId: user.socketId }; // Mark as not in any room
    }
    return user;
  });
};

// this function removes user from online users array
const removeUser = (userId) => {
  users = users.filter((user) => user.userId !== userId);
};

// this function gets one user from online users array
const getUser = (userId) => {
  return users.find((user) => user.userId === userId);
};
const getUserBySocket = (socketId) => {
  return users.find((user) => user.socketId === socketId);
};

// this function gets all users from online users array
const getRoomUsers = (roomId) => {
  const usrs = users
    .filter((user) => user.roomId === roomId)
    .sort((a, b) => new Date(a.addedTime) - new Date(b.addedTime)); // Convert to Date objects if needed
  return usrs;
};

// this function gets all users from online users array
const updateUsers = async (updatedUsers) => {
  // Create a Set of roomIds from updatedUsers for faster lookup
  const updatedRoomIds = new Set(updatedUsers.map((user) => user.roomId));

  // Filter out users who are in the updatedRoomIds from the original list
  let filteredList = users.filter((i) => !updatedRoomIds.has(i.roomId));

  // Return the combined updated users and the filtered original list
  users = [...filteredList, ...updatedUsers];
};

module.exports = {
  addUser,
  removeUser,
  joinRoom,
  leaveRoom,
  getUser,
  getRoomUsers,
  users,
  getAllUsers,
  updateUsers,
  getUserBySocket,
};
