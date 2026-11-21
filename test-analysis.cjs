const http = require('http');

const data = JSON.stringify({
  mode: "SINGLE_EMAIL_VIEW",
  data: {
    subject: "Urgent: Update your account details",
    senderName: "Support Team",
    senderEmail: "support@paypal-update.com",
    body: "Please click the link below to update your account details immediately or your account will be suspended. http://paypal-update.com/login"
  }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/analyze',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-firebase-uid': 'test-user-id',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', d => {
    body += d;
  });
  res.on('end', () => {
    console.log(body);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
