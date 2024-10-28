const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { v4: uuidv4 } = require("uuid");

// Buy coins
exports.buyCoins = catchAsync(async (req, res, next) => {
  const userId = req.params.id; // Retrieve user ID from route parameters
  const { coins } = req.body; // Destructure coins from the request body

  // Find user by ID
  const user = await User.findById(userId);

  // Check if user exists
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Ensure invoices array is initialized
  user.invoices = user.invoices || []; // Initialize invoices if undefined

  // Update user's invoices and total coins
  user.invoices.push({ ...req.body, id: uuidv4() }); // Push new invoice into invoices
  user.coins.total = (user.coins.total || 0) + coins; // Safely add coins
  // Mark fields as modified and save the user
  user.markModified("invoices");
  user.markModified("coins");
  await user.save({ validateBeforeSave: false }); // Await the save operation

  console.log("success");
  // Send success response
  res.status(200).json({
    status: "success",
  });
});

// get invoices

exports.getInvoices = async (req, res) => {
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

    // Sort invoices by creation date (descending)
    const invoices = (user.invoices || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Paginate invoices
    const totalInvoices = invoices.length;
    const paginatedInvoices = invoices.slice((page - 1) * limit, page * limit);

    // Respond with paginated notifications and clan notifications
    res.status(200).json({
      status: "success",
      total: totalInvoices,
      data: {
        invoices: paginatedInvoices,
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

// Clear invoices
exports.clearInvoices = async (req, res) => {
  try {
    // Find and update user by ID, setting notifications to an empty array
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { invoices: [] },
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
      message: "All invoices deleted",
    });
  } catch (error) {
    console.error("Error deleting invoices:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while deleting invoices",
    });
  }
};
