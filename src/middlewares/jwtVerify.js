const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

const signToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN, // Example: '1m' for 1 minute
  });
};

const signRefreshToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN, // Example: '7d' for 7 days
  });
};

// Middleware to verify the access token
const verifyToken = async (req, res, next) => {
  const token = req.headers["authorization"];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  const tokenWithoutBearer = token.split(" ")[1];

  try {
    const decoded = jwt.verify(
      JSON.parse(tokenWithoutBearer),
      process.env.JWT_SECRET
    );
    req.userId = decoded.id;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Access token expired" });
    } else {
      return res.status(401).json({ message: "Invalid token" });
    }
  }
};

// Endpoint to refresh tokens
const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: "No refresh token provided" });
  }

  try {
    const decoded = jwt.verify(
      JSON.parse(refreshToken),
      process.env.JWT_REFRESH_SECRET
    );
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const newAccessToken = signToken(user);
    const newRefreshToken = signRefreshToken(user);

    res.status(200).json({
      status: "success",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};

module.exports = { verifyToken, refreshToken };
