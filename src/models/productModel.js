const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
    },
    type: {
      type: String,
    },
    price: {
      type: Number,
    },
    newPrice: {
      type: Number,
    },
    rating: {
      type: Object,
    },
    file: {
      type: Object,
    },
  },
  { timestamps: true }
);

// define Product model
const Product = mongoose.model("Product", productSchema);

module.exports = Product;
