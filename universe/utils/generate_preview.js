const fs = require('fs');
const path = require('path');
const { getModerationEmailHtml } = require('./moderationEmailTemplate');

// Mock domain to point to local assets in the workspace
process.env.UNIVERSE_DOMAIN = 'file:///r:/MACBEASE/Start/multiverse-backend/universe';

const reporterHtml = getModerationEmailHtml({
  userName: 'Rakshit Sharma',
  introParagraph1: 'Thank you for taking the time to report content. Your vigilance helps us maintain a safe and respectful community.',
  introParagraph2: 'After careful review by our moderation team, appropriate action has been taken on the reported content.',
  actionTitle: 'Discretion notice applied',
  actionDescription: 'Sensitive content containing graphic language or violence.',
  outroParagraph1: 'If you did not report this content,',
  outroParagraph2: 'please disregard this email.',
  isReporter: true
});

const ownerHtml = getModerationEmailHtml({
  userName: 'Jane Doe',
  introParagraph1: 'Your content has been reviewed by our moderation team.',
  introParagraph2: 'The content has been blurred for other users. If you believe this was done in error, please reach out to us.',
  actionTitle: 'Discretion notice added',
  actionDescription: 'Sensitive content containing graphic language or violence.',
  outroParagraph1: 'Review our guidelines',
  outroParagraph2: 'Please review our community guidelines for more information.',
  isReporter: false
});

// Write to utils folder
fs.writeFileSync(path.join(__dirname, 'reporter_preview.html'), reporterHtml);
fs.writeFileSync(path.join(__dirname, 'owner_preview.html'), ownerHtml);

console.log('Previews generated successfully!');
