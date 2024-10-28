require("dotenv").config();
const mongoose = require("mongoose");

mongoose.set("bufferCommands", false);

const DB = process.env.MONGODB.replace(
  "<PASSWORD>",
  process.env.MONGODB_PASSWORD
);

mongoose
  .connect(DB, { useNewUrlParser: true })
  .then(() => console.log("Db connection successful"))
  .catch((err) => console.log("ERROR", err));

// Create the HTTP server
const http = require("http");

// Attach Socket.IO to the server
const socketIO = require("socket.io");

const server = http.createServer();

// Setup Socket.IO
const io = socketIO(server, {
  cors: {
    origin: "*", // Allow all origins (you may restrict this for production)
    methods: ["GET", "POST"], // Allow GET and POST methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allow these headers
  },
  pingTimeout: 60000, // Set ping timeout to 60 seconds (wait before considering a disconnect)
  pingInterval: 25000, // Ping every 25 seconds to check if the client is still alive
});

// Pass `io` to `app.js`
const app = require("./app")(io); // Pass `io` when requiring the app
server.on("request", app); // Use app as a listener for HTTP requests

// Import and use the socket handlers
const socketHandlers = require("./src/utils/socketHandlers");
socketHandlers(io);

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
// const PORT = 5000;
// server.listen(PORT, "192.168.1.6", () => {
//   console.log(`Server started on port ${PORT}`);
// });
