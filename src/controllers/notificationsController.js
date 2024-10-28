const { v4 } = require("uuid");
const User = require("../models/userModel");
const AppError = require("../utils/appError");
const Clan = require("../models/clanModel");

// Get Notifications
exports.getNotifications = async (req, res) => {
  const { id } = req.params;

  // Parse page and limit from query parameters, with default values
  let { page = 1, limit = 12 } = req.query;
  page = parseInt(page, 10);
  limit = parseInt(limit, 10);

  try {
    // Find user by ID and check existence
    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ status: "fail", message: "User not found" });
    }

    // Sort notifications by creation date (descending)
    const notifications = (user.notifications || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Paginate notifications
    const totalNotifications = notifications.length;
    const paginatedNotifications = notifications.slice(
      (page - 1) * limit,
      page * limit
    );

    // Attach user details for each notification sender (if sender is not "IQ-Night")
    const notificationsWithUser = await Promise.all(
      paginatedNotifications.map(async (notification) => {
        if (notification?.sender !== "IQ-Night") {
          const sender = await User.findById(notification.sender).select(
            "cover name _id"
          );
          return sender ? { ...notification, sender } : notification;
        }
        return notification;
      })
    );

    /**
     * Fetch clan requests for notifications
     */
    const clans = await Clan.find();
    const notifiedClans = clans.filter((clan) => {
      const hasPendingMember = clan.members.some(
        (member) => member.userId === id && member.status === "pending"
      );
      const hasAdminWithRequestStatus =
        clan.admin.some((a) => a.user === id) &&
        clan.members.some((member) => member.status === "request");
      return hasPendingMember || hasAdminWithRequestStatus;
    });

    // Respond with paginated notifications and clan notifications
    res.status(200).json({
      status: "success",
      total: totalNotifications,
      data: {
        notifications: notificationsWithUser,
        clansNotifications: notifiedClans,
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      status: "fail",
      message: "An error occurred while fetching notifications",
    });
  }
};

// Add Notification
exports.addNotification = async (req, res) => {
  // Find the user by userId
  let user = await User.findById(req.body.receiver);

  // Check if the user was found
  if (!user) {
    return res.status(404).json({
      status: "fail",
      message: "User not found",
    });
  }

  // Initialize the notifications array if it doesn't exist
  if (!user.notifications) {
    user.notifications = [];
  }
  // Add the new notification to the array
  user.notifications.push({
    ...req.body,
    createdAt: new Date(),
    notificationId: v4(),
  });

  // Mark the notifications field as modified
  user.markModified("notifications");

  // Save the user without validating the notification schema
  await user.save({ validateBeforeSave: false });

  // Send a successful response
  res.status(200).json({
    status: "success",
  });
};

// delete message
exports.deleteNotification = async (req, res) => {
  let user = await User.findById(req.params.id);
  user.notifications = user.notifications?.filter(
    (i) => i.notificationId !== req.params.notificationId
  );
  user.markModified("notifications");
  await user.save({ validateBeforeSave: false });
  try {
    res.status(200).json({
      status: "success",
      message: "Message deleted",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error deleting message",
    });
  }
};
// Clear notifications
exports.clearNotifications = async (req, res) => {
  console.log("run");
  try {
    console.log(req.params.id);
    // Find and update user by ID, setting notifications to an empty array
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { notifications: [] },
      { new: true, runValidators: true } // Ensures updated document is returned
    );

    // Check if user exists
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Send success response
    res.status(200).json({
      status: "success",
      message: "All notifications deleted",
    });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while deleting notifications",
    });
  }
};

// update message
exports.updateNotification = async (req, res) => {
  const { id, notificationId } = req.params;
  const updatedNotificationData = req.body; // Assuming the updated data is in the request body
  try {
    // Find the user by ID
    const user = await User.findById(id);

    // Check if user exists
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Find the notification by ID within the user's notifications array
    const notificationIndex = user.notifications.findIndex(
      (notification) => notification.notificationId === notificationId
    );

    // Check if notification exists
    if (notificationIndex === -1) {
      return res.status(404).json({
        status: "fail",
        message: "Notification not found",
      });
    }

    // Update the notification
    user.notifications[notificationIndex] = {
      ...user.notifications[notificationIndex],
      ...updatedNotificationData,
    };

    // Save the updated user document
    await user.save({ validateBeforeSave: false });

    // Respond with success
    res.status(200).json({
      status: "success",
      message: "Notification updated",
      data: {
        notification: user.notifications[notificationIndex],
      },
    });
  } catch (error) {
    console.error("Error updating notification:", error);
    res.status(500).json({
      status: "fail",
      message: "An error occurred while updating the notification",
    });
  }
};
