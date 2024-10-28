const express = require("express");
const router = express.Router();

const product = require("../controllers/productController");

// product
router.route("/products").post(product.createProduct).get(product.getProducts);
router
  .route("/products/:id")
  .get(product.getProduct)
  .patch(product.updateProduct)
  .delete(product.deleteProduct);

module.exports = router;
