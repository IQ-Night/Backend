const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "A room must have a title"],
      unique: true,
    },
    admin: {
      type: Object,
    },
    private: {
      type: Object,
      default: {
        value: false,
        code: "",
      },
    },
    language: {
      type: String,
    },
    rating: {
      type: Object,
    },
    price: {
      type: Object,
    },
    cover: {
      type: String,
    },
    members: {
      type: Array,
    },
    options: {
      type: Object,
      default: {
        totalPlayers: 0,
        maxPlayers: 16,
        maxlMafias: 5,
      },
    },
    games: {
      type: Array,
    },
    roles: {
      type: Array,
    },
    status: {
      type: Object,
    },
    spectatorMode: {
      type: Boolean,
      default: true,
    },
    drawInReVote: {
      type: String,
    },
    personalTime: {
      type: Number,
    },
    rules: {
      type: Array,
    },
  },
  { timestamps: true }
);

// define Room model
const Room = mongoose.model("Room", roomSchema);

module.exports = Room;
