var nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const catchAsync = require("../utils/catchAsync");
const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

/**
 * get verification codes for forgot password and update mobile in login page
 */

const sendEmail = async (options) => {
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "verifyEmail.hbs"
  );
  const source = fs.readFileSync(templatePath, "utf8");

  // Compile the template with Handlebars
  const template = handlebars.compile(source);
  const html = template({ Message: options.message, Link: options.link });

  var transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  var mailOptions = {
    from: "Wordes <wordexlearning@gmail.com>",
    to: options.email,
    subject: options.email,
    // text: options.message,
    html: html,
  };

  await transporter.sendMail(mailOptions);
};

const SendSimpleEmail = async (options, res) => {
  // add the 'res' parameter here
  try {
    var transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    var mailOptions = {
      from: options.email,
      to: "wordexlearning@gmail.com",
      subject: "New Message",
      text: options.message,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      status: "success",
    });
  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: "Email could not be sent",
    });
  }
};

module.exports = { sendEmail, SendSimpleEmail };
