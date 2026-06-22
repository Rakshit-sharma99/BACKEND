const getModerationEmailHtml = ({
  userName,
  introParagraph1,
  introParagraph2,
  actionTitle,
  actionDescription,
  outroParagraph1,
  outroParagraph2,
  isReporter,
}) => {
  const domain = process.env.UNIVERSE_DOMAIN || 'https://macbease.com';
  // Use the image copied to the backend for the logo
  const logoUrl = `${domain}/assets/Macbease-01-DasH-luL.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Moderation Update</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    body, html {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f9fafb;
      color: #374151;
      line-height: 1.5;
    }
    
    table {
      border-spacing: 0;
      border-collapse: collapse;
    }
    
    .email-wrapper {
      width: 100%;
      background-color: #f9fafb;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    }
    
    .email-header {
      background-color: #0b1121;
      background-image: url('https://www.transparenttextures.com/patterns/stardust.png');
      padding: 32px 40px;
      position: relative;
    }

    .brand img {
      max-height: 36px;
      vertical-align: middle;
      display: block;
    }
    
    .email-body {
      padding: 40px;
    }
    
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      margin-top: 0;
      margin-bottom: 24px;
      letter-spacing: -0.5px;
    }
    
    h1 span {
      color: #2563eb;
    }
    
    p {
      margin-top: 0;
      margin-bottom: 16px;
      font-size: 15px;
      color: #4b5563;
    }
    
    .action-card {
      background-color: #f8fafc;
      border-left: 4px solid #3b82f6;
      border-radius: 8px;
      padding: 24px;
      margin: 32px 0;
    }
    
    .action-icon {
      background-color: #eff6ff;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      text-align: center;
    }
    
    .action-icon img {
      width: 20px;
      height: 20px;
      margin-top: 10px;
    }
    
    .action-content h3 {
      margin: 0 0 4px 0;
      font-size: 15px;
      font-weight: 600;
      color: #111827;
    }
    
    .action-content p {
      margin: 0;
      font-size: 14px;
      color: #4b5563;
    }

    .notice-section {
      margin-top: 32px;
      border-top: 1px solid #e5e7eb;
      padding-top: 32px;
    }
    
    .notice-icon {
      background-color: #f3f4f6;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      text-align: center;
    }

    .notice-icon.blue {
      background-color: #eff6ff;
    }

    .notice-icon img {
      width: 16px;
      height: 16px;
      margin-top: 8px;
    }
    
    .notice-content h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }
    
    .notice-content p {
      margin: 0;
      font-size: 14px;
      color: #6b7280;
      line-height: 1.6;
    }
    
    .button {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      font-weight: 500;
      font-size: 14px;
      padding: 10px 20px;
      border-radius: 6px;
      text-decoration: none;
    }

    .signature p {
      margin: 0;
      font-size: 14px;
    }

    .signature .team {
      color: #2563eb;
      font-weight: 600;
    }
    
    .email-footer {
      text-align: center;
      padding: 32px 20px;
    }
    
    .footer-text {
      font-size: 12px;
      color: #9ca3af;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <table class="email-container" width="100%" align="center">
      
      <!-- Header -->
      <tr>
        <td class="email-header">
          <table width="100%">
            <tr>
              <td align="left" valign="middle" class="brand">
                <img src="${logoUrl}" alt="Macbease" style="max-height: 40px; display: block;" onerror="this.src='https://macbease.com/assets/images/logo.png'">
              </td>
              <td align="right" valign="middle">
                <!-- Decorative document icon with checkmark for the header -->
                <img src="https://img.icons8.com/fluency/96/000000/task.png" alt="Header Decor" style="max-height: 60px; opacity: 0.9; display: block;">
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Body -->
      <tr>
        <td class="email-body">
          <h1>Hi <span>${userName}</span>,</h1>
          
          <p>${introParagraph1}</p>
          <p>${introParagraph2}</p>
          
          ${actionTitle ? `
          <!-- Action Card -->
          <table class="action-card" width="100%">
            <tr>
              <td width="56" valign="top">
                <div class="action-icon">
                  <img src="https://img.icons8.com/fluency-systems-regular/48/3b82f6/visible.png" alt="Eye">
                </div>
              </td>
              <td valign="top" class="action-content">
                <h3>${actionTitle}</h3>
                ${actionDescription ? `<p>"${actionDescription}"</p>` : ''}
              </td>
            </tr>
          </table>
          ` : ''}
          
          <div class="notice-section">
            
            ${outroParagraph1 ? `
            <!-- Ignore / Appeal Notice -->
            <table width="100%" style="margin-bottom: 24px;">
              <tr>
                <td width="48" valign="top">
                  <div class="notice-icon">
                    <img src="${isReporter ? 'https://img.icons8.com/fluency-systems-regular/48/6b7280/security-checked.png' : 'https://img.icons8.com/fluency-systems-regular/48/ef4444/info.png'}" alt="Notice Icon">
                  </div>
                </td>
                <td valign="top" class="notice-content">
                  <h4>${outroParagraph1}</h4>
                  <p>${outroParagraph2 || ''}</p>
                </td>
              </tr>
            </table>
            ` : ''}
            
            <!-- Support Notice -->
            <table width="100%" style="margin-bottom: 32px;">
              <tr>
                <td width="48" valign="top">
                  <div class="notice-icon blue">
                    <img src="https://img.icons8.com/fluency-systems-regular/48/3b82f6/headset.png" alt="Headset">
                  </div>
                </td>
                <td valign="top" class="notice-content">
                  <h4>Need help?</h4>
                  <p style="margin-bottom: 12px;">If you have any questions or concerns,<br>feel free to reach out to our support team.</p>
                </td>
                <td valign="middle" align="right">
                  <a href="mailto:support@macbease.com" class="button">Contact Support &rarr;</a>
                </td>
              </tr>
            </table>
            
            <!-- Signature -->
            <table width="100%">
              <tr>
                <td width="48" valign="top">
                  <div style="width: 32px; height: 32px; text-align: center;">
                    <img src="https://img.icons8.com/fluency-systems-regular/48/3b82f6/like.png" alt="Heart" style="width: 16px; margin-top: 8px;">
                  </div>
                </td>
                <td valign="top" class="signature">
                  <p>Yours truly,</p>
                  <p class="team">Macbease Team</p>
                </td>
              </tr>
            </table>

          </div>
          
        </td>
      </tr>
    </table>
    
    <!-- Footer -->
    <div class="email-footer">
      <p class="footer-text">&copy; ${new Date().getFullYear()} Macbease Team. All rights reserved.</p>
      <p class="footer-text">This is an automated message, please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
};

module.exports = {
  getModerationEmailHtml,
};
