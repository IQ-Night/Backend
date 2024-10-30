const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Clan = require("../models/clanModel");

// get authenticated user
exports.getAuthUser = catchAsync(async (req, res, next) => {
  // getting user id after check in middleware /middlewares/jwtVerify
  const userId = req.userId;

  const userObj = await User.findById(userId).select(
    "-password -confirmPassword -notifications -passwordResetToken -passwordResetExpires -appleIdentificator -pushNotificationsToken"
  );

  if (!userObj) {
    return next(new AppError("User not found with this id", 404));
  }

  res.status(200).json({
    status: "success",
    data: { user: userObj },
  });
});

// Create New User
exports.createUser = catchAsync(async (req, res, next) => {
  const newUser = await User.create(req.body);

  res.status(201).json({
    status: "success",
    data: {
      user: newUser,
    },
  });
});
// Get Users
exports.getUsers = catchAsync(async (req, res, next) => {
  const { search } = req.query;

  // Initialize the filter object
  const filter = {};

  // Apply the search filter if provided
  if (search) {
    filter.name = { $regex: search, $options: "i" }; // "i" makes it case-insensitive
  }

  // Fetch users from the database, selecting only the name, cover, and notifications fields, sorted by creation date
  const users = await User.find(filter)
    .select("name cover rating")
    .sort({ rating: -1 });

  // Respond with the fetched users
  res.status(200).json({
    status: "success",
    data: {
      users, // Pluralized to reflect that it's an array of users
    },
  });
});
// Get User
exports.getUser = catchAsync(async (req, res, next) => {
  // Fetch users from the database, selecting only the name, cover, and notifications fields, sorted by creation date
  const user = await User.findById(req.params.id).select(
    "-password -confirmPassword -email -appleIdentificator -notifications"
  );

  const clans = await Clan.find();
  const userClans = clans?.filter((clan) => {
    if (clan.members.find((u) => u.userId === req.params.id)) {
      return clan;
    }
  });
  // Respond with the fetched users
  let userObj = { ...user.toObject(), clans: userClans };

  res.status(200).json({
    status: "success",
    data: {
      user: userObj, // Pluralized to reflect that it's an array of users
    },
  });
});

// Get Players to Add in Clan
exports.getPlayers = catchAsync(async (req, res, next) => {
  const { search, clan: clanTitle } = req.query; // Extract search and clan from the query parameters

  // Initialize the filter object
  const filter = {};

  // Fetch the clan by its title
  const clan = await Clan.findOne({ title: clanTitle });

  // Check if the clan exists
  if (!clan) {
    return res.status(404).json({
      status: "fail",
      message: "Clan not found",
    });
  }

  // Extract member userIds with the status "member"
  const clanMemberIds = clan.members
    .filter(
      (member) => member.status === "member" || member.status === "request"
    )
    .map((member) => member.userId.toString()); // Convert to string for easier comparison

  // Apply the search filter if provided
  if (search) {
    filter.name = { $regex: search, $options: "i" }; // Case-insensitive search
  }

  // Fetch all users from the database, selecting only the relevant fields
  const users = await User.find(filter)
    .select("name cover")
    .sort({ createdAt: -1 });

  // Mark users who are already in the clan with the status "member"
  const usersWithMembershipStatus = users.map((user) => {
    const isMember = clanMemberIds.includes(user._id.toString()); // Check if the user is in the clan
    if (!isMember) {
      return {
        ...user.toObject(),
      };
    }
  });

  // Respond with the full user list and their membership status
  res.status(200).json({
    status: "success",
    data: {
      users: usersWithMembershipStatus.filter((u) => u), // Return all users with their membership status
    },
  });
});

// Delete unauthorized user
exports.deleteUnauthUser = catchAsync(async (req, res, next) => {
  const machineId = req.params.deleteId;

  const unauthorizedUser = await User.findOne({ name: machineId });

  if (unauthorizedUser) {
    await User.findByIdAndDelete(unauthorizedUser._id);
  }

  res.status(201).json({
    status: "success",
  });
});
// update user
exports.updateUser = catchAsync(async (req, res, next) => {
  const userId = req.params.id;

  try {
    let user;
    if (userId !== "undefined") {
      user = await User.findByIdAndUpdate(userId, req.body, {
        new: true,
        runValidators: true,
      });
    }

    res.status(200).json({
      status: "success",
    });
  } catch (error) {
    console.log(error);
  }
});

// delete user
exports.deleteUser = catchAsync(async (req, res, next) => {
  await User.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// Get Management
exports.getManagement = catchAsync(async (req, res, next) => {
  // Fetch users from the database, selecting only the name, cover, and notifications fields, sorted by creation date
  const management = await User.find({ "admin.active": true }) // Corrected field access
    .select("name cover rating admin");

  // Respond with the fetched users
  res.status(200).json({
    status: "success",
    data: {
      management, // Pluralized to reflect that it's an array of users
    },
  });
});
// Block User
exports.blockUser = catchAsync(async (req, res, next) => {
  // Update the user's status in the database
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: req.body }, // Update status with the data from the request body
    { new: true, runValidators: true } // Options to return the updated document and run validators
  );

  // Check if the user was found and updated
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Respond with success
  res.status(200).json({
    status: "success",
    data: {
      user, // Include the updated user data in the response if needed
    },
  });
});
