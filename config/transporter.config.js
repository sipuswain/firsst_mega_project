import nodemailer from "nodemailer";
import config from "./index.js";


  let transporter = nodemailer.createTransport({
    host:config.SMPT_MAIL_HOST,
    port: config.SMPT_MAIL_PORT,
    secure: false,
    auth:{
      user:config.SMPT_MAIL_USERNAME,
      pass: config.SMPT_MAIL_PASSWORD
    }
  });

  export default transporter;