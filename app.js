require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");

const app = express();

const allowedOrigins = ["*", "192.168.1.137:8081"];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

app.use(express.json());
app.use(morgan("dev"));

// Import routes and error handlers
const AppError = require("./src/utils/appError");
const globalErrorHandler = require("./src/controllers/errorController");

// Pass the io instance to the app
module.exports = (io) => {
  // Attach io to requests
  app.use((req, res, next) => {
    req.io = io;
    next();
  });

  // Define routes
  app.get("/", (req, res) => {
    res.send(`
      <html>
        <body>
          <h1>IQ-Night Backend Side</h1>
        </body>
      </html>
    `);
  });

  app.get("/version", (req, res) => {
    res.send("1.0.0");
  });

  const userRoutes = require("./src/routes/userRoutes");
  const roomRoutes = require("./src/routes/roomRoutes");
  const clanRoutes = require("./src/routes/clanRoutes");
  const productRoutes = require("./src/routes/productRoutes");

  app.use("/api/v1", userRoutes);
  app.use("/api/v1", roomRoutes);
  app.use("/api/v1", clanRoutes);
  app.use("/api/v1", productRoutes);

  /**
   * Error handling middleware
   */
  app.all("*", (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
  });

  app.use(globalErrorHandler);

  return app;
};
