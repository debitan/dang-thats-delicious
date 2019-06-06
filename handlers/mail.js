const nodemailer = require('nodemailer');
const nunjucks = require('nunjucks');
const juice = require('juice');
const htmlToText = require('html-to-text');
const promisify = require('es6-promisify');

const transport = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT,
        auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
        },
});

const generateHTML = (options = {}) => {
        const html = nunjucks.render(`${__dirname}/../views/email/${options.filename}.njk`, options);
        const inlined = juice(html);
        return inlined;
};

exports.send = options => {
        const html = generateHTML(options);
        const text = htmlToText.fromString(html);
        const mailOptions = {
                from: `Dave Matthews <david.matthews@digital.trade.gov.uk>`,
                to: options.user.email,
                subject: options.subject,
                html,
                text,
        };
        const sendMail = promisify(transport.sendMail, transport);
        return sendMail(mailOptions);
};
