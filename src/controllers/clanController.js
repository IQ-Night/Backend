const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Clan = require("../models/clanModel");

// Filter user object to remove sensitive fields
const filterUserFields = (user) => {
  if (!user) return null;

  const {
    password,
    confirmPassword,
    notifications,
    appleIdentificator,
    ...filteredUser
  } = user._doc ? { ...user._doc } : { ...user };

  return filteredUser;
};

// Get Clans with filtered admin details
exports.getClans = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, search, language, rating } = req.query;

  // Filter construction based on query parameters
  const filter = {};
  if (search) filter.title = { $regex: search, $options: "i" };
  if (language) filter.language = language;
  if (rating) filter.rating = { $gte: rating };

  // Fetch clans based on filter, sort, and pagination
  const clans = await Clan.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .lean();

  // Extract all user _ids (admin.user) from the array of admins in each clan
  const founderIds = clans.flatMap((clan) =>
    clan.admin.map((admin) => admin.user)
  ); // Use flatMap for cleaner extraction

  // Fetch user details for all the relevant admins (founders)
  const founders = await User.find({ _id: { $in: founderIds } })
    .select("name cover _id") // Include other fields as necessary
    .lean();

  // Create a lookup object for founder details to optimize mapping
  const founderMap = founders.reduce((acc, founder) => {
    acc[String(founder._id)] = founder; // Map founder ID to founder details
    return acc;
  }, {});

  // Map clans to include detailed user info in each admin object
  const clansWithFounderDetails = clans.map((clan) => {
    const adminsWithDetails = clan.admin.map((admin) => {
      const founderDetails = founderMap[String(admin.user)]; // Look up founder details from the map
      return {
        ...admin,
        user: founderDetails ? filterUserFields(founderDetails) : null, // Attach full user details or null
      };
    });

    return {
      ...clan,
      admin: adminsWithDetails, // Replace admin array with detailed user info
    };
  });

  // Respond with the total clans count and clans data with founder details
  res.status(200).json({
    status: "success",
    totalClans: await Clan.countDocuments(filter), // Counts only the filtered clans
    data: { clans: clansWithFounderDetails },
  });
});

// Get user's Clans with filtered admin details
exports.getMyClans = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, search, language, rating } = req.query;
  const userId = req.params.id; // Get userId from params
  const filter = {};

  // Apply filters based on query parameters
  if (search) filter.title = { $regex: search, $options: "i" };
  if (language) filter.language = language;
  if (rating) filter.rating = { $gte: rating };

  // Find clans with the filters and only where members contain the userId
  const clans = await Clan.find({
    ...filter,
    members: { $elemMatch: { userId } }, // Filter clans where members array contains the userId
  })
    .sort({ createdAt: -1 })
    .lean();

  // Get the admin user details for each clan
  // Extract all user _ids (admin.user) from the array of admins in each clan
  const founderIds = clans.reduce((ids, clan) => {
    clan.admin.forEach((admin) => {
      ids.push(admin.user); // Collect all user IDs
    });
    return ids;
  }, []);
  const founders = await User.find({ _id: { $in: founderIds } })
    .select("name cover _id")
    .lean();

  // Attach the admin (founder) details to each clan
  const clansWithFounderDetails = clans.map((clan) => {
    const adminsWithDetails = clan.admin.map((admin) => {
      const founderDetails = founders.find(
        (founder) => String(founder._id) === String(admin.user)
      );
      return {
        ...admin,
        user: founderDetails ? filterUserFields(founderDetails) : null, // Attach filtered user details or null
      };
    });

    return {
      ...clan,
      admin: adminsWithDetails, // Replace admin array with detailed user info
    };
  });

  // Return the result with the total count of clans
  res.status(200).json({
    status: "success",
    totalClans:
      (await Clan.countDocuments({
        ...filter,
        members: { $elemMatch: { userId } }, // Count only those clans where members contain the userId
      })) || 0,
    data: { clans: clansWithFounderDetails },
  });
});

// Get one clan
exports.getClan = catchAsync(async (req, res, next) => {
  // const newUser = await User.create(req.body);
  // res.status(201).json({
  //   status: "success",
  //   data: {
  //     user: newUser,
  //   },
  // });
});
// Update clan
exports.updateClan = catchAsync(async (req, res, next) => {
  const clanId = req.params.id;

  if (clanId !== "undefined") {
    clan = await Clan.findByIdAndUpdate(clanId, req.body, {
      new: true,
      runValidators: true,
    });
  }

  res.status(200).json({
    status: "success",
  });
});
// Create New Clan with filtered admin details
exports.createClan = catchAsync(async (req, res, next) => {
  const newClan = await Clan.create(req.body);

  // Fetch all admin users' details based on their user IDs in the new clan
  const adminUserIds = newClan.admin.map((admin) => admin.user);

  const admins = await User.find({ _id: { $in: adminUserIds } }).lean();

  // Map over the admin array and replace user IDs with detailed user info
  const filteredAdmins = newClan.admin.map((admin) => {
    const adminDetails = admins.find(
      (user) => String(user._id) === String(admin.user)
    );
    return {
      ...admin,
      user: adminDetails ? filterUserFields(adminDetails) : null, // Attach filtered user details
    };
  });

  res.status(201).json({
    status: "success",
    data: {
      clan: {
        ...newClan.toObject(),
        admin: filteredAdmins, // Replace the admin array with detailed user info
      },
    },
  });
});

// Join to clan
exports.joinClan = catchAsync(async (req, res, next) => {
  const clanTitle = req.params.title;

  try {
    let clan;
    if (clanTitle !== "undefined") {
      clan = await Clan.findOne({ title: clanTitle });
      clan.members = clan.members.filter(
        (member) => member.userId !== req.body.userId
      );
      clan.members.push(req.body);
      clan.markModified("members");
      await clan.save();
    }

    res.status(200).json({
      status: "success",
    });
  } catch (error) {
    console.log(error);
  }
});
// Leave clan
exports.leaveClan = catchAsync(async (req, res, next) => {
  const clanTitle = req.params.title;

  try {
    let clan;
    if (clanTitle !== "undefined") {
      // Find the clan by title
      clan = await Clan.findOne({ title: clanTitle });

      // Ensure the clan exists
      if (!clan) {
        return res.status(404).json({
          status: "fail",
          message: "Clan not found",
        });
      }

      // Update the clan members by filtering out the user who is leaving
      clan.members = clan.members.filter(
        (member) => member.userId.toString() !== req.body.userId.toString()
      );

      // Remove the user from the admin list if they are an admin
      clan.admin = clan.admin.filter(
        (admin) => admin.user.toString() !== req.body.userId.toString()
      );

      // Mark the members and admin arrays as modified
      clan.markModified("members");
      clan.markModified("admin");

      // Save the updated clan
      await clan.save();
    }

    // Respond with success
    res.status(200).json({
      status: "success",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      status: "fail",
      message: "An error occurred while leaving the clan",
    });
  }
});

// Delete clan
exports.deleteClan = catchAsync(async (req, res, next) => {
  const clanId = req.params.id;

  await Clan.findByIdAndDelete(clanId);
  console.log("deleted");
  res.status(201).json({
    status: "success",
  });
});
// Get members
exports.getMembers = catchAsync(async (req, res, next) => {
  const clanId = req.params.id;

  // Find the clan by ID
  const clan = await Clan.findById(clanId);

  // Ensure the clan exists
  if (!clan) {
    return res.status(404).json({
      status: "fail",
      message: "Clan not found",
    });
  }

  // Use Promise.all to handle asynchronous operations within the map
  const members = await Promise.all(
    clan.members.map(async (member) => {
      const user = await User.findById(member.userId);
      if (user) {
        return {
          ...member,
          name: user.name,
          _id: user._id,
          cover: user.cover,
          totalGames: user?.totalGames,
          rating: user?.rating,
        };
      }
      return null; // Handle the case where the user might not be found
    })
  );

  // Filter out any null values in case some members weren't found
  const filteredMembers = members.filter(
    (member) => member !== null && member._id
  );

  // Sort members, moving the clan admin to the top
  const sortedMembers = filteredMembers.sort((a, b) => {
    const isAAdmin = String(a._id) === String(clan.admin.user);
    const isBAdmin = String(b._id) === String(clan.admin.user);

    if (isAAdmin && !isBAdmin) {
      return -1; // a is admin, move it to the top
    } else if (!isAAdmin && isBAdmin) {
      return 1; // b is admin, move it to the top
    } else {
      return 0; // Both are either admins or non-admins, keep their relative order
    }
  });

  // Send the response
  res.status(200).json({
    status: "success",
    members: sortedMembers.filter((member) => member.status === "member"),
    requests: sortedMembers.filter((member) => member.status === "request"),
    pendings: sortedMembers.filter((member) => member.status === "pending"),
  });
});
// Add role in management
exports.addRole = catchAsync(async (req, res, next) => {
  const clanId = req.params.id;
  const { user, role } = req.body;

  // Find the clan by ID and ensure it exists
  const clan = await Clan.findById(clanId);
  if (!clan) {
    return res.status(404).json({
      status: "fail",
      message: "Clan not found",
    });
  }

  // Update the admin role
  clan.admin = clan.admin.filter((a) => a.user.toString() !== user?.toString());
  if (role) {
    clan.admin.push({ user, role });
  }

  // Mark the admin array as modified
  clan.markModified("admin");

  // Save the updated clan document
  await clan.save();

  // Extract all user _ids (admin.user) from the updated admin array
  const founderIds = clan.admin.map((admin) => admin.user);

  // Fetch user details for all the relevant admins (founders)
  const founders = await User.find({ _id: { $in: founderIds } })
    .select("name cover _id")
    .lean();

  // Map clan's admin to include detailed user info
  const adminsWithDetails = clan.admin.map((admin) => {
    const founderDetails = founders.find(
      (founder) => String(founder._id) === String(admin.user)
    );
    return {
      ...admin,
      user: founderDetails ? filterUserFields(founderDetails) : null, // Attach full user details or null
    };
  });

  // Send the response with updated admin details
  res.status(200).json({
    status: "success",
    data: {
      admin: adminsWithDetails, // Return updated admin array with user details
    },
  });
});
