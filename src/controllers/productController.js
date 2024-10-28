const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Product = require("../models/productModel");

// Get Products
exports.getProducts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, search, language, type } = req.query;

  // Create the filter object
  const filter = {};

  // title search filter
  if (search) {
    filter.title = { $regex: search, $options: "i" }; // "i" makes it case-insensitive
  }

  // type filter
  if (type) {
    filter.type = type;
  }

  const products = await Product.find(filter)
    .sort({ price: 1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  console.log(products);

  res.status(200).json({
    status: "success",
    totalProducts: await Product.countDocuments(),
    data: {
      products,
    },
  });
});

// Get one Product
exports.getProduct = catchAsync(async (req, res, next) => {
  const newUser = await User.create(req.body);

  res.status(201).json({
    status: "success",
    data: {
      user: newUser,
    },
  });
});
// Update product
exports.updateProduct = catchAsync(async (req, res, next) => {
  const newUser = await User.create(req.body);

  res.status(201).json({
    status: "success",
    data: {
      user: newUser,
    },
  });
});
// Create New Product
exports.createProduct = catchAsync(async (req, res, next) => {
  const newProduct = await Product.create(req.body);

  res.status(201).json({
    status: "success",
    data: {
      product: newProduct,
    },
  });
});
// Delete product
exports.deleteProduct = catchAsync(async (req, res, next) => {
  const machineId = req.params.deleteId;

  const unauthorizedUser = await User.findOne({ name: machineId });

  if (unauthorizedUser) {
    await User.findByIdAndDelete(unauthorizedUser._id);
  }

  res.status(201).json({
    status: "success",
  });
});
