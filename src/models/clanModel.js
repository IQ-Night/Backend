const mongoose = require("mongoose");

const clanSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "A Clan must have a title"],
      unique: true,
    },
    admin: {
      type: Array,
    },
    language: {
      type: String,
    },
    rating: {
      type: Object,
    },
    price: { type: Number },
    cover: {
      type: String,
    },
    members: {
      type: Array,
    },
  },
  { timestamps: true }
);

// define Clan model
const Clan = mongoose.model("Clan", clanSchema);

module.exports = Clan;
