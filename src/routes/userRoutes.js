const express = require("express");
const router = express.Router();

const authentication = require("../controllers/authController");
const users = require("../controllers/userController");
const notifications = require("../controllers/notificationsController");
const paymentController = require("../controllers/paymentController");
const { verifyToken } = require("../middlewares/jwtVerify");

// authentication
router.post("/signup", authentication.signup);
router.post("/login", authentication.login);
router.post("/providerauth", authentication.providerAuth);
router.post("/forgotPassword", authentication.forgotPassword);
router.patch("/resetPassword/:token", authentication.resetPassword);
router.patch("/changePassword/:id", authentication.changePassword);
router.post("/sendVerifyEmail", authentication.sendEmail);
router.post("/refresh-token", authentication.refreshToken);

// users
router.route("/auth/user").get(verifyToken, users.getAuthUser);
router.route("/users").get(users.getUsers);
router.route("/players").get(users.getPlayers);
router
  .route("/users/:id")
  .get(users.getUser)
  .patch(users.updateUser)
  .delete(verifyToken, users.deleteUser);

router
  .route("/users/:id/notifications")
  .get(notifications.getNotifications)
  .post(notifications.addNotification);
router
  .route("/users/:id/notifications/:notificationId")
  .patch(notifications.updateNotification)
  .delete(notifications.deleteNotification);
router
  .route("/users/:id/clearNotifications")
  .patch(notifications.clearNotifications);
// block user
router.route("/users/:id/block").patch(users.blockUser);

// payments
router.route("/users/:id/buyCoins").patch(paymentController.buyCoins);

router
  .route("/users/:id/invoices")
  .get(paymentController.getInvoices)
  .delete(paymentController.clearInvoices);

router.route("/admin/management").get(users.getManagement);

module.exports = router;
