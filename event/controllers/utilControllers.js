const jwt = require("jsonwebtoken");
const axios = require("axios");

const Mailgen = require("mailgen");
const AWS = require("aws-sdk");

const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const { v4: uuidv4 } = require("uuid");
const stream = require("stream");
const path = require("path");
const logoPath = path.resolve(__dirname, "../assets/logo_1024x1024.png");

const services = {
  universe: "universe:5050",
};

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "event",
      role: "internal",
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" }
  );
  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
};

const fetchUserData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const userData = await axios.post(
      "http://universe:5050/universe/api/v1/user/getUserFieldsById",
      query,
      config
    );
    return userData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchItineraries = async (query) => {
  try {
    if (!Array.isArray(query.itineraryIds) || query.itineraryIds.length === 0) {
      return [];
    }
    const config = generateServiceToken();
    const itineraryData = await axios.post(
      `http://itinerary:6050/itinerary/api/v1/getItinerariesByIds`,
      query,
      config
    );
    return itineraryData.data.itineraries;
  } catch (error) {
    console.log(error);
  }
};

const fetchNativeUserData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0 ||
      !query.callSign
    ) {
      return;
    }
    const service = services[query.callSign];
    const config = generateServiceToken();
    if (!service) return;
    const userData = await axios.post(
      `http://${service}/${query.callSign}/api/v1/user/getUserFieldsById`,
      query,
      config
    );
    return userData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchNativeClubData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0 ||
      !query.callSign
    ) {
      return;
    }
    const service = services[query.callSign];
    const config = generateServiceToken();
    if (!service) return;
    const clubData = await axios.post(
      `http://${service}/${query.callSign}/api/v1/club/getClubFieldsById`,
      query,
      config
    );
    return clubData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchTicketsByIds = async (query) => {
  const url = `http://ticket:6000/ticket/api/v1/getTicketsbyIds`;
  try {
    if (!Array.isArray(query.ticketIds) || query.ticketIds.length === 0) {
      return [];
    }
    const config = generateServiceToken();
    const ticketData = await axios.post(url, query, config);
    return ticketData.data.tickets || [];
  } catch (error) {
    console.error(`❌ Error in fetchTicketsByIds (${url}):`, error.message);
    return [];
  }
};

const fetchDetailedTicketsByIds = async (query) => {
  const url = `http://ticket:6000/ticket/api/v1/getDetailedTickets`;
  try {
    if (!Array.isArray(query.ticketIds) || query.ticketIds.length === 0) {
      return [];
    }
    const config = generateServiceToken();
    const ticketData = await axios.post(url, query, config);
    return ticketData.data.tickets || [];
  } catch (error) {
    console.error(`❌ Error in fetchDetailedTicketsByIds (${url}):`, error.message);
    return [];
  }
};

const fetchTicketTypesCount = async (query) => {
  const url = `http://ticket:6000/ticket/api/v1/getTicketTypesCount`;
  try {
    if (!Array.isArray(query.ticketIds) || query.ticketIds.length === 0) {
      return [];
    }
    const config = generateServiceToken();
    const ticketData = await axios.post(url, query, config);
    return ticketData.data.ticketCounts || [];
  } catch (error) {
    console.error(`❌ Error in fetchTicketTypesCount (${url}):`, error.message);
    return [];
  }
};

const fetchTicketFieldsById = async (query) => {
  const url = `http://ticket:6000/ticket/api/v1/getTicketFieldsById`;
  try {
    if (!query.ticketId || !Array.isArray(query.fields)) {
      return null;
    }
    const config = generateServiceToken();
    const ticketData = await axios.post(url, query, config);
    return ticketData.data.data;
  } catch (error) {
    console.error(`❌ Error in fetchTicketFieldsById (${url}):`, error.message);
    return null;
  }
};

const fetchMultipleClubsData = async (query) => {
  try {
    if (
      !Array.isArray(query.ids) ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const clubData = await axios.post(
      "http://universe:5050/universe/api/v1/club/fetchMultipleClubsFromIds",
      query,
      config
    );
    return clubData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const sendMail = async (
  name,
  intro,
  outro,
  subject,
  destination,
  action,
  emailHTML
) => {
  const mailGenerator = new Mailgen({
    theme: "cerberus",
    product: {
      name: "Macbease Team",
      link: "https://macbease.com/",
      logo: "https://mailgen.js/img/logo.png",
    },
  });

  const email = {
    body: {
      name: name,
      intro: intro,
      action: action
        ? {
          instructions:
            action.instructions || "Click the button below to proceed:",
          button: {
            color: action.color || "#1ea1ed",
            text: action.text || "View Details",
            link: action.url,
          },
        }
        : undefined,
      outro: outro,
    },
  };

  if (!Array.isArray(destination)) {
    destination = [destination];
  }

  const emailBody = emailHTML ? emailHTML : mailGenerator.generate(email);

  const params = {
    Source: '"Macbease" <support@macbease.com>',
    Destination: {
      ToAddresses: ["support@macbease.com"],
      BccAddresses: destination,
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Html: {
          Data: emailBody,
        },
      },
    },
  };

  AWS.config.update({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  const ses = new AWS.SES();
  return { ses, params };
};

const generateTicketPDFAndUpload = async ({
  tickets,
  eventName,
  totalTicketsSold,
  totalRevenue,
  graphData,
  clubName,
}) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const passThroughStream = new stream.PassThrough();

    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    });

    const fileKey = `reports/${eventName.replace(/\s+/g, "_")}-${uuidv4()}.pdf`;

    const uploadParams = {
      Bucket: process.env.S3_BUCKET,
      Key: fileKey,
      Body: passThroughStream,
      ContentType: "application/pdf",
    };

    // Start upload
    s3.upload(uploadParams, (err, data) => {
      if (err) reject(err);
      else resolve(`${process.env.S3_OBJECT_URL}${fileKey}`);
    });

    // Pipe PDF to S3
    doc.pipe(passThroughStream);

    // Draw Header
    const logoSize = 50;
    doc
      .image(logoPath, 50, 40, { width: logoSize }) // placeholder image
      .fontSize(20)
      .fillColor("#1a1a1a")
      .text("Macbease", 110, 45)
      .fontSize(12)
      .fillColor("#555555")
      .text("Event Ticket Sales Report", 110, 70);

    doc.moveTo(40, 100).lineTo(555, 100).strokeColor("#cccccc").stroke();
    doc.moveDown(4);

    // Title
    doc.fontSize(18).text(`${eventName} - Ticket Sales Report`, {
      align: "center",
    });
    doc.moveDown();

    // Total tickets and revenue section
    doc
      .fontSize(14)
      .text(`Total Tickets Sold: ${totalTicketsSold}`, { align: "left" });
    doc.text(`Total Revenue Generated: INR ${totalRevenue.toLocaleString()}`, {
      align: "left",
    });
    doc.moveDown(2);

    // Display Summary Data
    doc.fontSize(14).text("Daily Sales:", { align: "left" });
    doc.moveDown(2);

    // Calculate maximum label width for alignment
    let maxLabelWidth = 0;
    graphData.forEach((item) => {
      const labelWidth = doc.widthOfString(item.label);
      if (labelWidth > maxLabelWidth) {
        maxLabelWidth = labelWidth;
      }
    });

    const salesX = 50;
    const valueX = 300;
    const valueWidth = 100;

    graphData.forEach((item, idx) => {
      const yPosition = doc.y + (idx > 0 ? 20 : 0);
      doc.text(item.label, salesX, yPosition, {
        width: maxLabelWidth,
        align: "left",
      });
      doc.text(`INR ${item.value.toLocaleString()}`, valueX, yPosition, {
        width: valueWidth,
        align: "right",
      });
    });
    doc.moveDown(2);

    // Table headers
    const headers = [
      { label: "Name", x: 50, width: 90 },
      { label: "Reg. No", x: 140, width: 90 },
      { label: "Course", x: 230, width: 50 },
      { label: "Type", x: 280, width: 50 },
      { label: "Amount", x: 330, width: 60 },
      { label: "Timestamp", x: 400, width: 150 },
    ];

    const startY = doc.y;
    const rowHeight = 60;

    // Draw table header
    doc.font("Helvetica-Bold").fontSize(11);
    headers.forEach((h) => {
      doc.text(h.label, h.x, startY, { width: h.width });
    });

    // Draw table rows
    doc.font("Helvetica").fontSize(10);
    let y = startY + rowHeight;

    tickets.forEach((t, i) => {
      if (y > 750) {
        doc.addPage();
        y = 50;
      }

      const row = [
        t.userMetaData[0].name,
        t.userMetaData[0].reg,
        t.userMetaData[0].course,
        t.type,
        `INR ${t.amtPaid}`,
        new Date(t.generatedAt).toLocaleString(),
      ];

      row.forEach((text, idx) => {
        const { x, width } = headers[idx];
        doc.text(text, x, y, { width });
      });

      y += rowHeight;
    });

    // Add report creation timestamp and event manager
    const reportTimestamp = new Date().toLocaleString();
    doc.moveDown(2);
    doc
      .fontSize(10)
      .text(`Report Generated At: ${reportTimestamp}`, { align: "left" });
    if (clubName) {
      doc.text(`Reported To: ${clubName}`, { align: "left" });
    }

    doc.end(); // Finish writing
  });
};

const generateTicketExcelAndUpload = async ({
  tickets,
  eventName,
  totalTicketsSold,
  totalRevenue,
  graphData,
  clubName,
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Ticket Sales Report");

      // Report Header
      worksheet.mergeCells("A1:B1");
      worksheet.getCell("A1").value = `${eventName} - Ticket Sales Report`;
      worksheet.getCell("A1").font = { size: 18, bold: true };

      // Summary Data
      worksheet.addRow(["Total Tickets Sold:", totalTicketsSold]);
      worksheet.addRow([
        "Total Revenue Generated:",
        `INR ${totalRevenue.toLocaleString()}`,
      ]);
      worksheet.addRow([]); // Blank row for spacing

      // Daily Sales Data (Graph Data)
      worksheet.addRow(["Daily Sales:", ""]);
      worksheet.addRow(["Date", "Revenue (INR)"]).font = { bold: true };
      graphData.forEach((item) => {
        worksheet.addRow([item.label, `INR ${item.value.toLocaleString()}`]);
      });
      worksheet.addRow([]); // Blank row for spacing

      // Dynamically get all unique form data keys to use as column headers
      const allFormDataKeys = new Set();
      tickets.forEach((ticket) => {
        Object.keys(ticket.extraFieldsData || {}).forEach((key) => {
          allFormDataKeys.add(key);
        });
      });
      const formDataKeysArray = [...allFormDataKeys];

      // Static headers for the ticket table
      const baseHeaders = [
        "Name",
        "Reg. No",
        "Course",
        "Type",
        "Amount",
        "Generated At",
        "Email",
      ];

      // Combine static headers with dynamic form data headers
      const headers = [...baseHeaders, ...formDataKeysArray];
      worksheet.addRow(headers).font = { bold: true };

      // Set column widths dynamically
      const baseColumns = [
        { key: "name", width: 20 },
        { key: "regNo", width: 15 },
        { key: "course", width: 15 },
        { key: "type", width: 15 },
        { key: "amount", width: 15 },
        { key: "generatedAt", width: 25 },
        { key: "email", width: 30 },
      ];

      const formDataColumns = formDataKeysArray.map((key) => ({
        key: key,
        width: 25, // Set a default width for form data columns
      }));

      worksheet.columns = [...baseColumns, ...formDataColumns];

      // Add each ticket as a row
      tickets.forEach((ticket) => {
        const rowData = {
          name: ticket?.userMetaData[0]?.name,
          regNo: ticket?.userMetaData[0]?.reg,
          course: ticket?.userMetaData[0]?.course,
          type: ticket.type,
          amount: `INR ${ticket.amtPaid}`,
          generatedAt: new Date(ticket.generatedAt).toLocaleString(),
          email: ticket?.userMetaData[0]?.email,
        };

        // Add form data to the row object
        formDataKeysArray.forEach((key) => {
          rowData[key] = ticket.extraFieldsData?.[key] || "";
        });

        worksheet.addRow(rowData);
      });

      // Footer
      worksheet.addRow([]); // Blank row for spacing
      worksheet.addRow([`Report Generated At: ${new Date().toLocaleString()}`]);
      if (clubName) {
        worksheet.addRow([`Reported To: ${clubName}`]);
      }

      const fileBuffer = await workbook.xlsx.writeBuffer();

      const fileKey = `reports/${eventName.replace(
        /\s+/g,
        "_"
      )}-${uuidv4()}.xlsx`;

      const uploadParams = {
        Bucket: process.env.S3_BUCKET,
        Key: fileKey,
        Body: fileBuffer,
        ContentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };

      s3.upload(uploadParams, (err, data) => {
        if (err) {
          console.error("S3 upload error:", err);
          reject(err);
        } else {
          resolve(`${process.env.S3_OBJECT_URL}${fileKey}`);
        }
      });
    } catch (error) {
      console.error("Error generating or uploading Excel:", error);
      reject(error);
    }
  });
};

const fetchReviewedTickets = async (query) => {
  try {
    const { eventId, skip = 0, limit = 12 } = query || {};
    if (!eventId) return [];

    const config = generateServiceToken();
    const response = await axios.get(
      `http://ticket:6000/ticket/api/v1/getReviewedTickets`,
      {
        ...config,
        params: { eventId, skip, limit },
      }
    );

    return response.data?.tickets || [];
  } catch (error) {
    console.error(
      "❌ fetchReviewedTickets error:",
      error?.response?.data || error.message
    );
    return [];
  }
};

const getUserMetaMap = async (userIds, fields) => {
  try {
    if (!Array.isArray(userIds) || !Array.isArray(fields)) {
      return;
    }
    const config = generateServiceToken();
    const { data } = await axios.post(
      "http://universe:5050/universe/api/v1/user/fetchBulkUsers",
      {
        userIds,
        fields,
      },
      config
    );

    return data.reduce((acc, user) => {
      acc[user._id] = user;
      return acc;
    }, {});
  } catch (err) {
    console.error("❌ Failed to fetch user metadata:", err.message);
    return {};
  }
};

const fetchRedeemedTicketsOfEvent = async (query) => {
  try {
    if (!query.eventId) {
      return;
    }
    const config = generateServiceToken();
    const ticketData = await axios.get(
      `http://ticket:6000/ticket/api/v1/getRedeemedTickets?eventId=${query.eventId}`,
      config
    );
    return ticketData.data.tickets;
  } catch (error) {
    console.error("❌ Failed to fetch redeemed tickets:", error.message);
    return { tickets: [] };
  }
};

const scheduleNotification = (pushTokens, title, body, image) => {
  if (!Array.isArray(pushTokens) || !title || !body) {
    console.log("Missing title, body, or pushTokens array!");
    return;
  }

  const fireTime = new Date(Date.now() + 3 * 1000); // 3 seconds delay

  // schedule.scheduleJob(`notification_${Date.now()}`, fireTime, () => {
  //   pushTokens.forEach((token) => {
  //     if (!token || token === "undefined" || token.length < 10) {
  //       return;
  //     }

  //     const message = {
  //       notification: {
  //         title,
  //         body,
  //       },
  //       android: {
  //         notification: {
  //           imageUrl: image,
  //         },
  //       },
  //       apns: {
  //         payload: {
  //           aps: {
  //             alert: {
  //               title,
  //               body,
  //             },
  //             sound: "default",
  //             "mutable-content": 1,
  //           },
  //         },
  //         fcm_options: {
  //           image,
  //         },
  //       },
  //       data: {
  //         url: typeof image === "string" ? image : JSON.stringify(image ?? ""),
  //       },
  //       token: token,
  //     };

  //     getMessaging()
  //       .send(message)
  //       .then((response) => {
  //         console.log("✅ Successfully sent message:", response);
  //       })
  //       .catch((error) => {
  //         console.error("❌ Error sending message:", error);
  //       });
  //   });
  // });
};

const scheduleNotification2 = ({ pushToken, title, body, image, url }) => {
  if (!title || !body || !pushToken) {
    console.log("Title,body or push token missing!");
    return;
  }
  let threeSec = new Date(Date.now() + 1 * 3 * 1000);
  // schedule.scheduleJob(`notification_${pushToken}`, threeSec, () => {
  //   pushToken.forEach((token) => {
  //     if (
  //       typeof token !== "string" ||
  //       token.length <= 80 ||
  //       token === "undefined"
  //     ) {
  //       return;
  //     }

  //     const message = {
  //       notification: {
  //         title: title,
  //         body: body,
  //       },
  //       android: {
  //         notification: {
  //           imageUrl: image,
  //         },
  //       },
  //       apns: {
  //         payload: {
  //           aps: {
  //             alert: {
  //               title: title,
  //               body: body,
  //             },
  //             sound: "default",
  //             "mutable-content": 1,
  //           },
  //         },
  //         fcm_options: {
  //           image: image,
  //         },
  //       },
  //       data: {
  //         url: url,
  //       },
  //       token: token,
  //     };
  //     getMessaging()
  //       .send(message)
  //       .then((response) => {
  //         console.log("Successfully sent message:", response);
  //       })
  //       .catch((error) => {
  //         console.log("Error sending message:", error);
  //       });
  //   });
  // });
};

const fetchTicketsBoughtByAUserOfAnEvent = async (query) => {
  try {
    if (!query.eventId || !query.userId) {
      return [];
    }
    const config = generateServiceToken();
    const ticketData = await axios.get(
      `http://ticket:6000/ticket/api/v1/findEventTicketsBoughtByUser?eventId=${query.eventId}&userId=${query.userId}`,
      config
    );

    return ticketData.data.matchedTickets[0];
  } catch (error) {
    console.log(error);
  }
};

const generateEmailReportHtml = ({
  event,
  totalRevenue,
  ticketsSold,
  revenueRows,
  reportURL,
}) => {
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Event Summary: ${event.name}</title>
      <style>
        /* Reset styles for email clients */
        body, html {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Arial, sans-serif;
          line-height: 1.6;
          color: #333333;
          background-color: #f5f7fa;
        }
        
        /* Wrapper for Outlook */
        .wrapper {
          width: 100%;
          table-layout: fixed;
          background-color: #f5f7fa;
          padding-bottom: 40px;
        }
        
        /* Main container */
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }
        
        /* Header styles */
        .header {
          background-color: #1a1a2e;
          color: #ffffff;
          padding: 30px 20px;
          text-align: center;
          margin-top: 12px;
          border-top-left-radius: 12px;
          border-top-right-radius: 12px;
        }
        
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        
        /* Content styles */
        .content {
          padding: 30px 20px;
        }
        
        /* Summary box */
        .summary-box {
          display: flex;
          flex-wrap: wrap;
          margin: 20px 0;
          border: 1px solid #e1e5eb;
          border-radius: 6px;
          overflow: hidden;
        }
        
        .summary-item {
          flex: 1;
          min-width: 200px;
          padding: 20px;
          box-sizing: border-box;
          text-align: center;
          border-right: 1px solid #e1e5eb;
          border-bottom: 1px solid #e1e5eb;
        }
        
        .summary-item:nth-child(2n) {
          border-right: none;
        }
        
        .summary-item h3 {
          margin: 0;
          color: #666;
          font-size: 14px;
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .summary-item p {
          margin: 10px 0 0;
          font-size: 24px;
          font-weight: 600;
          color: #1a1a2e;
        }
        
        /* Stats table */
        .stats-section {
          margin: 30px 0;
        }
        
        .stats-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .stats-table th {
          background-color: #f5f7fa;
          color: #4a4a4a;
          font-weight: 600;
          padding: 12px;
          text-align: left;
          border-bottom: 2px solid #e1e5eb;
        }
        
        .stats-table td {
          padding: 12px;
          border-bottom: 1px solid #e1e5eb;
        }
        
        /* CTA button */
        .cta-button {
          display: inline-block;
          background-color: #4d61fc;
          color: #ffffff;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          font-weight: 600;
          margin: 20px 0;
        }
        
        /* Footer */
        .footer {
          background-color: #f5f7fa;
          padding: 20px;
          text-align: center;
          color: #666;
          font-size: 12px;
        }
        
        /* Mobile responsive */
        @media screen and (max-width: 600px) {
          .summary-item {
            flex: 100%;
            border-right: none;
          }
          
          .header h1 {
            font-size: 24px;
          }
          
          .stats-table {
            font-size: 14px;
          }
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <!-- Header -->
          <div class="header">
            <h1>${event.name}</h1>
            <!-- <h2>Sales report</h2> -->
          </div>
          
          <!-- Content -->
          <div class="content">
            <p>Here's a summary of your event's performance:</p>
            
            <!-- Summary boxes -->
           <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #e1e5eb; border-radius: 6px; overflow: hidden;">
                <tr>
                  <td align="center" valign="top" style="padding: 20px; border-right: 1px solid #e1e5eb;">
                    <h3 style="margin: 0; color: #666; font-size: 14px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.5px;">Revenue Generated</h3>
                    <p style="margin: 10px 0 0; font-size: 24px; font-weight: 600; color: #1a1a2e;">₹${totalRevenue.toLocaleString()}</p>
                  </td>
                  <td align="center" valign="top" style="padding: 20px;">
                    <h3 style="margin: 0; color: #666; font-size: 14px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.5px;">Tickets Sold</h3>
                     <p style="margin: 10px 0 0; font-size: 24px; font-weight: 600; color: #1a1a2e;">${ticketsSold}</p>
                  </td>
                </tr>
              </table>
            
            <!-- Daily Stats -->
            <div class="stats-section">
              <h2>Daily Performance</h2>
              <table class="stats-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                ${revenueRows}
                </tbody>
              </table>
            </div>
            
            <!-- CTA -->
            <div style="text-align: center;">
              <a href=${reportURL} class="cta-button">Download Full Report</a>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="footer">
            <p>©️ 2025 Macbease. All rights reserved.</p>
            <p>This email was sent to you because you are the organizer of Spardha Literary Event.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;
};

const autoGenEventMemoryHTML = ({
  userName,
  eventName,
  eventDate,
  userId,
  memoryId,
}) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Macbease - Event Memory Added</title>

<style>
  body {
    margin: 0;
    font-family: 'Arial', sans-serif;
    background: #e6dbff;
  }

  .wrapper {
    max-width: 780px;
    margin: 40px auto;
    border-radius: 20px;
    overflow: hidden;
    padding: 24px 0 40px;
    text-align: center;
    background: linear-gradient(145deg, #2b1055 0%, #7597de 40%, #ff7eb3 85%);
    color: white;
    box-shadow: 0 20px 40px rgba(0,0,0,0.15);
  }

  .header {
    padding: 60px 40px 30px;
  }

  .brand {
    display: block;
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 10px;
    color: white;
  }

  .title {
    margin-top: 20px;
    font-size: 28px;
    font-weight: 700;
  }

  .subtitle {
    font-size: 20px;
    margin-top: 8px;
    opacity: 0.9;
  }

  .btn-primary {
    display: inline-block;
    margin: 20px auto 10px;
    padding: 12px 32px;
    background: #1ea1ed;
    color: white !important;
    border-radius: 25px;
    text-decoration: none;
    font-weight: bold;
    font-size: 16px;
  }

  .sketch-img {
    width: 180px;
    margin: 25px auto 0;
    display: block;
  }

  .section-heading {
    margin-top: 30px;
    margin-bottom: 10px;
    font-size: 24px;
    font-weight: 600;
    color: white;
  }

  .full-card {
    width: calc(100% - 80px);
    margin: 20px auto;
    background: rgba(255,255,255,0.18);
    backdrop-filter: blur(4px);
    border-radius: 18px;
    padding: 22px;
    color: white;
    text-align: center;
  }

  .full-card img {
    width: 160px;
    margin: 15px auto;
    display: block;
  }

  .full-card h3 {
    margin-bottom: 10px;
    font-size: 20px;
    color: white;
  }

  .full-card p {
    font-size: 15px;
    opacity: 0.9;
    line-height: 1.6;
  }

  .card-btn {
    display: inline-block;
    margin-top: 15px;
    padding: 8px 20px;
    background: #1ea1ed;
    color: white !important;
    text-decoration: none;
    border-radius: 20px;
    font-size: 14px;
  }
</style>
</head>

<body>

<div class="wrapper">

  <div class="header">
    <span class="brand">Macbease</span>

    <div class="title">Hey ${userName}!</div>
    <div class="subtitle">A new event memory was added to your Memory Lane.</div>

    <img class="sketch-img" 
      src="https://s3.us-east-1.amazonaws.com/data.macbease.com/public/club/sd-removebg-preview.png" />
  </div>

  <a class="btn-primary" href="https://macbease.com/app/profile/${userId}">Open Memory Lane</a>

  <div class="section-heading">${eventName}</div>
  <div class="subtitle">${eventDate}</div>

  <div class="full-card">
    <h3>Certificate Delivered</h3>
    <img src="https://s3.us-east-1.amazonaws.com/data.macbease.com/public/club/certd-removebg-preview.png" />
    <p>Your event certificate is now live in your Memory Lane. Enjoy your achievement moment!</p>
    <a href="https://macbease.com/app/memory/${memoryId}" class="card-btn">View Certificate</a>
  </div>

  <div class="full-card">
    <h3>Memories Added</h3>
    <img src="https://s3.us-east-1.amazonaws.com/data.macbease.com/public/club/dsew-removebg-preview.png" />
    <p>New event photos have been added. Add yours and relive the moment!</p>
    <a href="https://macbease.com/app/memory/${memoryId}" class="card-btn">Revisit Memories</a>
  </div>

</div>

<div style="
  margin-top: 40px;
  padding: 25px;
  background: #f3f3f3;
  text-align: center;
  border-top: 1px solid #e0e0e0;">
  
  <div style="font-size: 14px; color: #555; line-height: 1.6;">
    You're receiving this email because you’re a registered member of <strong>Macbease</strong>.<br/>
    We help you preserve your moments, celebrate achievements, and relive your campus journey.
  </div>

  <div style="margin: 18px 0; font-size: 14px;">
    <a href="https://macbease.com/app/profile/${userId}" style="color:#1ea1ed; text-decoration:none; margin:0 10px;">Open App</a>
    |
    <a href="https://macbease.com/contactus" style="color:#1ea1ed; text-decoration:none; margin:0 10px;">Support</a>
    |
    <a href="https://macbease.com/terms" style="color:#1ea1ed; text-decoration:none; margin:0 10px;">Privacy Policy</a>
  </div>

  <div style="font-size: 12px; color: #888;">
    © 2025 Macbease Corporation. All Rights Reserved.
  </div>

</div>

</body>
</html>`;
};

const reminder = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Macbease Event Memory</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>
  body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
  }

  .wrapper {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    text-align: center;
  }

  /* BUTTONS */
  .btn-primary {
    display: block;
    margin: 18px auto;
    padding: 14px 32px;
    width: 250px;
    background: #1ea1ed;
    color: white !important;
    text-decoration: none;
    border-radius: 28px;
    font-size: 16px;
    font-weight: bold;
  }

  .btn-secondary {
    display: block;
    margin: 18px auto 0;
    padding: 12px 28px;
    width: 250px;
    background: #fea850;
    color: #1ea1ed !important;
    text-decoration: none;
    border-radius: 28px;
    font-size: 15px;
    font-weight: bold;
    border: 2px solid #1ea1ed;
  }


  .title {
    font-size: 20px;
    font-weight: 700;
    color: #000000;
    margin-bottom: 8px;
  }

  .subtitle {
    font-size: 16px;
    color: #333333;
    margin-top: 4px;
  }
</style>
</head>

<body>

<!-- OUTLOOK BACKGROUND FIX -->
<!--[if gte mso 9]>
<v:background fill="t">
  <v:fill type="frame" src="https://s3.us-east-1.amazonaws.com/data.macbease.com/public/club/df.png" />
</v:background>
<![endif]-->

<table class="wrapper" width="100%" cellpadding="0" cellspacing="0"
  background="https://s3.us-east-1.amazonaws.com/data.macbease.com/public/club/df.png"
  style="
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    height: 800px;
  "
>
  <tr>
    <td style="padding-bottom: 180px;">

     

      <!-- BUTTON: Opening ShowDown -->
      <a href="https://macbease.com/app/event/opening-showdown" class="btn-secondary">
        Opening ShowDown
      </a>

      <!-- BUTTON: Upload Memories -->
      <a href="https://macbease.com/app/memories/upload" class="btn-primary">
        Upload Memories
      </a>

    </td>
  </tr>

</table>

</body>
</html>


`;

const fetchAvailableCoupon = async (query) => {
  try {
    if (!query.eventId || !query.userId) {
      return;
    }
    const config = generateServiceToken();
    const couponData = await axios.get(
      `http://coupon:7020/coupon/api/v1/getAvailableCoupons?eventId=${query.eventId}&userId=${query.userId}`,
      config
    );
    return couponData.data.coupons;
  } catch (error) {
    console.log(error);
  }
};

const fetchTicketFieldsByQuery = async (query) => {
  try {
    const { searchBy, fields, single } = query;

    if (
      !searchBy ||
      typeof searchBy !== "object" ||
      !Array.isArray(fields) ||
      fields.length === 0
    ) {
      return null;
    }

    const config = generateServiceToken();

    const response = await axios.post(
      `http://ticket:6000/ticket/api/v1/getTicketFieldsByQuery`,
      {
        searchBy,
        fields,
        single,
      },
      config
    );

    return response.data.data;
  } catch (error) {
    console.error("fetchTicketFieldsByQuery error:", error.response?.data || error.message);
    return null;
  }
};

const fetchClubFieldsById = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return null;
    }

    const config = generateServiceToken();
    const response = await axios.post(
      "http://universe:5050/universe/api/v1/club/getClubFieldsById",
      query,
      config
    );

    return response.data.data || null;
  } catch (error) {
    console.error(
      "fetchClubFieldsById error:",
      error.response?.data || error.message,
    );
  }
}
// ─── Channel Inter-Service Helpers ─────────────────────────────────────

/**
 * Add channel entry to a single user's channels array
 */
const updateUserChannels = async ({ userId, channelId, role, rooms, callSign }) => {
  try {
    const config = generateServiceToken();
    const service = services[callSign] || services["universe"];

    const response = await axios.post(
      `http://${service}/${callSign}/api/v1/user/addChannelToUser`,
      { userId, channelId, role, rooms },
      config
    );

    return response.data;
  } catch (error) {
    console.error("updateUserChannels error:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Bulk update channels for multiple users
 * Can be used in two modes:
 * 1. Simple mode: { userIds, channelId, role, rooms } — same channel for all users
 * 2. Operations mode: { operations: [{ userId, action, channelId, role, rooms }] }
 */
const bulkUpdateUserChannels = async (payload) => {
  try {
    const config = generateServiceToken();
    const callSign = payload.callSign || "universe";
    const service = services[callSign] || services["universe"];

    const response = await axios.post(
      `http://${service}/${callSign}/api/v1/user/bulkUpdateUserChannels`,
      payload,
      config
    );

    return response.data;
  } catch (error) {
    console.error("bulkUpdateUserChannels error:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Get channel data for users from universe service
 * Returns a map of userId -> channels array or specific channel data
 */
const getUserChannels = async ({ userIds, channelId, callSign }) => {
  try {
    const config = generateServiceToken();
    const service = services[callSign || "universe"] || services["universe"];

    const response = await axios.post(
      `http://${service}/${callSign || "universe"}/api/v1/user/getUserChannels`,
      { userIds, channelId },
      config
    );

    return response.data.data;
  } catch (error) {
    console.error("getUserChannels error:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Check if a user is part of a channel and return their role
 */
const checkUserChannelRole = async ({ userId, channelId, callSign }) => {
  try {
    const config = generateServiceToken();
    const service = services[callSign || "universe"] || services["universe"];

    const response = await axios.post(
      `http://${service}/${callSign || "universe"}/api/v1/user/checkUserChannelRole`,
      { userId, channelId },
      config
    );

    return response.data.data;
  } catch (error) {
    console.error("checkUserChannelRole error:", error.response?.data || error.message);
    return null;
  }
};

module.exports = {
  fetchItineraries,
  fetchNativeUserData,
  fetchTicketsByIds,
  fetchTicketTypesCount,
  fetchTicketFieldsById,
  fetchUserData,
  fetchNativeClubData,
  sendMail,
  fetchDetailedTicketsByIds,
  generateTicketPDFAndUpload,
  fetchReviewedTickets,
  getUserMetaMap,
  fetchRedeemedTicketsOfEvent,
  scheduleNotification,
  scheduleNotification2,
  fetchTicketsBoughtByAUserOfAnEvent,
  generateEmailReportHtml,
  fetchMultipleClubsData,
  autoGenEventMemoryHTML,
  reminder,
  generateTicketExcelAndUpload,
  fetchAvailableCoupon,
  fetchTicketFieldsByQuery,
  fetchClubFieldsById,
  updateUserChannels,
  bulkUpdateUserChannels,
  getUserChannels,
  checkUserChannelRole,
};
