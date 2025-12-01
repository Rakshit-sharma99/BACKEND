import mongoose, { Types } from 'mongoose';
import AWS from 'aws-sdk';
import Mailgen from 'mailgen';
import { getMessaging } from 'firebase-admin/messaging';
import schedule from 'node-schedule';
import moment from 'moment-timezone';
import User from '../models/user.model';
import Admin from '../models/admin.model';
import bcrypt from 'bcryptjs';

type MailAction = {
  instructions?: string;
  color?: string;
  text?: string;
  url: string;
};

type NotificationPayload = {
  pushToken?: string[];
  title: string;
  body: string;
  image?: string;
  img1?: string;
  img2?: string;
  key?: string;
  action?: string;
  params?: Record<string, unknown>;
  url?: string;
};

type PingOptions = {
  role?: string;
  ids?: string[];
  pingLevel: number;
  notification: NotificationPayload;
  email: {
    name?: string;
    intro: string;
    outro: string;
    subject: string;
    action?: MailAction;
  };
};

type Notification = {
  title: string;
  body: string;
  url?: string;
  img1?: string;
  img2?: string;
  key?: string;
  action?: string;
  params?: Record<string, unknown>;
};

type EmailContent = {
  name: string;
  intro: string;
  outro: string;
  subject: string;
  action: {
    instructions: string;
    color?: string;
    text: string;
    url: string;
  };
};

type PingUsers = {
  role?: string;
  ids?: string[];
  pingLevel: 0 | 1 | 2;
  notification?: Notification;
  email: EmailContent;
};

function getCurrentISTDate(): string {
  return moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
}

const securePassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 10);
};

const generateOtp = (): number => {
  return Math.floor(100000 + Math.random() * 900000);
};

/**
 * @description Sends an email using AWS SES
 * @param {string} name - Recipient's name
 * @param {string[] | string} intro - Email introduction message
 * @param {string} outro - Email outro message
 * @param {string} subject - Email subject
 * @param {string | string[]} destination - Recipient email(s)
 * @param {MailAction} [action] - Optional action with button details
 * @returns {Promise<{ ses: AWS.SES; params: AWS.SES.SendEmailRequest }>} SES instance and email parameters
 */
const sendMail = async (
  name: string,
  intro: string[] | string,
  outro: string,
  subject: string,
  destination: string | string[],
  action?: MailAction,
): Promise<{ ses: AWS.SES; params: AWS.SES.SendEmailRequest }> => {
  try {
    // Reuse AWS configuration to avoid redundant calls
    if (!AWS.config.credentials) {
      AWS.config.update({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });
    }

    // Create mail generator instance once
    const mailGenerator = new Mailgen({
      theme: 'cerberus',
      product: {
        name: 'Macbease Team',
        link: 'https://macbease.com/',
        logo: 'https://mailgen.js/img/logo.png',
      },
    });

    // Generate email content
    const emailBody = mailGenerator.generate({
      body: {
        name,
        intro,
        action: action
          ? {
              instructions: action.instructions || 'Click the button below:',
              button: {
                color: action.color || '#1ea1ed',
                text: action.text || 'View Details',
                link: action.url,
              },
            }
          : undefined,
        outro,
      },
    });

    // Create SES instance once
    const ses = new AWS.SES();
    const params: AWS.SES.SendEmailRequest = {
      Source: 'support@macbease.com',
      Destination: { ToAddresses: Array.isArray(destination) ? destination : [destination] },
      Message: { Subject: { Data: subject }, Body: { Html: { Data: emailBody } } },
    };

    return { ses, params };
  } catch (error) {
    console.error('Error in sendMail:', error);
    throw new Error('Failed to send email');
  }
};

/**
 * @desc Schedules and sends push notifications to multiple devices
 * @route POST /notifications
 * @access User, Admin
 */
const scheduleNotification = (payload: NotificationPayload): void => {
  try {
    if (
      !payload.title ||
      !payload.body ||
      !Array.isArray(payload.pushToken) ||
      payload.pushToken.length === 0
    ) {
      console.error('Invalid payload: title, body, or push tokens missing');
      return;
    }

    const validTokens = payload.pushToken.filter(
      (token) => token && token !== 'undefined' && token.length <= 80,
    );
    if (validTokens.length === 0) {
      console.error('No valid push tokens found');
      return;
    }

    const jobId = `notification_${validTokens.join(',')}`;
    const scheduledTime = new Date(Date.now() + 3000); // 3 seconds from now

    schedule.scheduleJob(jobId, scheduledTime, async () => {
      try {
        const messages = validTokens.map((token) => ({
          notification: { title: payload.title, body: payload.body },
          android: { notification: { imageUrl: payload.image } },
          apns: {
            payload: { aps: { sound: 'default', 'mutable-content': 1 } },
            fcmOptions: { imageUrl: payload.image },
          },
          token,
        }));

        const response = await getMessaging().sendEach(messages);
        console.log('Notification sent successfully:', response);
      } catch (error) {
        console.error('Error sending notifications:', error);
      }
    });

    console.log(`Notification scheduled with Job ID: ${jobId} at ${scheduledTime.toISOString()}`);
  } catch (error) {
    console.error('Unexpected error in scheduleNotification:', error);
  }
};

/**
 * @desc Schedules and sends push notifications to multiple devices
 * @route
 * @access User, Admin
 */
const scheduleNotification2 = (payload: NotificationPayload): void => {
  try {
    if (
      !payload.title ||
      !payload.body ||
      !Array.isArray(payload.pushToken) ||
      payload.pushToken.length === 0
    ) {
      console.error('Invalid payload: Missing title, body, or push tokens.');
      return;
    }

    // Filter valid tokens upfront
    const validTokens = payload.pushToken.filter(
      (token) => token && token !== 'undefined' && token.length <= 80,
    );
    if (validTokens.length === 0) {
      console.error('No valid push tokens available.');
      return;
    }

    const jobId = `notification_${validTokens.join(',')}`;
    const scheduledTime = new Date(Date.now() + 3000); // Schedule for 3 seconds later

    schedule.scheduleJob(jobId, scheduledTime, async () => {
      try {
        const messages = validTokens.map((token) => ({
          notification: { title: payload.title, body: payload.body },
          android: { notification: { imageUrl: payload.image } },
          apns: {
            payload: { aps: { sound: 'default', 'mutable-content': 1 } },
            fcmOptions: { imageUrl: payload.image },
          },
          data: payload.url ? { url: payload.url } : {},
          token,
        }));

        // Using sendEachForMulticast for efficiency
        const response = await getMessaging().sendEachForMulticast({
          tokens: validTokens,
          notification: { title: payload.title, body: payload.body },
          android: { notification: { imageUrl: payload.image } },
          apns: {
            payload: { aps: { sound: 'default', 'mutable-content': 1 } },
            fcmOptions: { imageUrl: payload.image },
          },
          data: payload.url ? { url: payload.url } : {},
        });

        console.log('Notifications sent successfully:', response);
      } catch (error) {
        console.error('Error sending notifications:', error);
      }
    });

    console.log(`Notification scheduled with Job ID: ${jobId} at ${scheduledTime.toISOString()}`);
  } catch (error) {
    console.error('Unexpected error in scheduleNotification2:', error);
  }
};

/* const scheduleNotification2 = ({ pushToken, title, body, image, url }) => {
  if (!title || !body || !pushToken) {
    console.log('Title,body or push token missing!');
    return;
  }
  let threeSec = new Date(Date.now() + 1 * 3 * 1000);
  schedule.scheduleJob(`notification_${pushToken}`, threeSec, () => {
    pushToken.forEach((token) => {
      if (token === 'undefined' || !token.length > 80) {
        return;
      }
      const message = {
        notification: {
          title: title,
          body: body,
        },
        android: {
          notification: {
            imageUrl: image,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              'mutable-content': 1,
            },
          },
          fcm_options: {
            image: image,
          },
        },
        data: {
          url: url,
        },
        token: token,
      };

      getMessaging()
        .send(message)
        .then((response) => {
          console.log('Successfully sent message:', response);
        })
        .catch((error) => {
          console.log('Error sending message:', error);
        });
    });
  });
}; */

/**
 * @desc Update the metadata count for a specific shortcut in Dynamic Island
 * @route PATCH /dynamic-island
 * @access User, Admin
 * @param {mongoose.Types.ObjectId[]} userIds - Array of user IDs to update
 * @param {string} shortcutId - ID of the shortcut to update
 * @param {string} metaDataKey - The key inside metadata to update
 * @param {boolean} increase - Whether to increment the metadata count
 * @returns {Promise<void>}
 */
const updateDynamicIsland = async (
  userIds: mongoose.Types.ObjectId[],
  shortcutId: string,
  metaDataKey: string,
  increase: boolean,
): Promise<void> => {
  try {
    if (!userIds.length) {
      console.warn('No user IDs provided');
      return;
    }

    const users = await User.find({ _id: { $in: userIds } }, { shortCuts: 1 });

    if (!users.length) {
      console.warn('No users found for the given IDs');
      return;
    }

    const bulkOps = users.map((user) => ({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            shortCuts: user.shortCuts?.map((item) =>
              item.id.toString() === shortcutId
                ? {
                    ...item,
                    metaData: {
                      ...item.metaData,
                      [metaDataKey]: increase
                        ? (Number(
                            (item.metaData as unknown as Record<string, number>)?.[metaDataKey],
                          ) || 0) + 1
                        : 0,
                    },
                  }
                : item,
            ),
          },
        },
      },
    }));

    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
    }

    console.log('Successfully updated Dynamic Island');
  } catch (error) {
    console.error('Error updating Dynamic Island:', error);
  }
};

const URLa = 'https://d5e1vvp3vh274.cloudfront.net/';
const bucket = 's3userdata25136-dev';

/**
 * @desc Generates a pre-signed URI for an image transformation request.
 * @route DELETE /card/:cardId
 * @access User, Admin
 * @param {string} url - The key of the image in the storage bucket.
 * @returns {Promise<string>} - A pre-signed URI for accessing the transformed image.
 */
const generateUri = async (url: string): Promise<string> => {
  if (!url) {
    throw new Error('Invalid URL: The image key must be provided.');
  }

  try {
    const uriPayload = {
      bucket,
      key: url,
      edits: {
        resize: { width: 500, height: 500 },
      },
    };

    const encodedUri = Buffer.from(JSON.stringify(uriPayload)).toString('base64');
    return `${URLa}${encodedUri}`;
  } catch (error) {
    console.error('Error generating URI:', error);
    throw new Error('Failed to generate image URI.');
  }
};

/**
 * @desc Sends notifications, updates unread notices, and optionally sends emails to admins.
 * @access User, Admin
 * @param {PingOptions} options - Options for pinging admins.
 * @returns {Promise<void>}
 */
const pingAdmins = async (options: PingOptions): Promise<void> => {
  try {
    if (!options) throw new Error('Invalid options provided.');

    // Fetch admins based on role or specific IDs
    const query = options.role
      ? { role: options.role }
      : { _id: { $in: options.ids?.map((id) => new Types.ObjectId(id)) } };

    const admins = await Admin.find(query, '_id email pushToken unreadNotice').lean();
    if (!admins.length) return;

    // Send push notifications
    const pushTokens = admins.map(({ pushToken }) => pushToken).filter(Boolean) as string[];
    if (options.notification?.title && options.notification?.body && pushTokens.length) {
      scheduleNotification({ ...options.notification, pushToken: pushTokens });
    }

    // Update unread notices (if pingLevel >= 1)
    if (options.pingLevel >= 1) {
      const unreadNotice = { value: options.notification.body, time: new Date() };
      await Admin.updateMany(query, {
        $push: { unreadNotice: { $each: [unreadNotice], $position: 0 } },
      });
    }

    // Send email (if pingLevel === 2)
    if (options.pingLevel === 2 && options.email) {
      const recipients = admins.map(({ email }) => email);
      if (recipients.length) {
        const { ses, params } = await sendMail(
          options.email.name || '',
          options.email.intro,
          options.email.outro,
          options.email.subject,
          recipients,
        );
        ses.sendEmail(params).promise().catch(console.error);
      }
    }
  } catch (error) {
    console.error('Error in pingAdmins:', error);
    throw new Error('Failed to send notifications.');
  }
};

/**
 * @desc Sends notifications, updates unread notices, and optionally sends emails to users.
 * @route
 * @access User, Admin
 * @param {PingUsers} options - Options for pinging users.
 * @returns {Promise<void>}
 */
const pingUsers = async ({
  role,
  ids,
  pingLevel,
  notification,
  email,
}: PingUsers): Promise<void> => {
  try {
    if (!notification) throw new Error('Notification data is required.');

    // Prepare query based on role or specific IDs
    const query = role
      ? { role }
      : { _id: { $in: ids?.map((id) => new mongoose.Types.ObjectId(id)) } };

    // Fetch users with lean() for better performance
    const users = await User.find(query, '_id email pushToken unreadNotice').lean();
    if (!users.length) return;

    // Send push notifications
    const pushTokens = users.map(({ pushToken }) => pushToken).filter(Boolean) as string[];
    if (notification.title && notification.body && pushTokens.length) {
      const notificationPayload = { pushToken: pushTokens, ...notification };
      notification.url
        ? scheduleNotification2(notificationPayload)
        : scheduleNotification(notificationPayload);
    }

    // Update unread notices (if pingLevel >= 1)
    if (pingLevel >= 1) {
      const notice = {
        value: notification.body ?? '',
        img1: notification.img1,
        img2: notification.img2,
        key: notification.key,
        action: notification.action,
        params: notification.params,
        time: new Date(),
        uid: new Date().toISOString(),
      };

      await User.updateMany(query, { $push: { unreadNotice: { $each: [notice], $position: 0 } } });
    }

    // Send email (if pingLevel === 2)
    if (pingLevel === 2 && email) {
      const recipientEmails = users.map(({ email }) => email).filter(Boolean);
      if (recipientEmails.length) {
        const { ses, params } = await sendMail(
          email.name,
          email.intro,
          email.outro,
          email.subject,
          recipientEmails,
          email.action,
        );
        ses
          .sendEmail(params)
          .promise()
          .catch((err) => console.error('Error sending email:', err));
      }
    }
  } catch (error) {
    console.error('Error in pingUsers:', error);
    throw new Error('Failed to send notifications.');
  }
};

// Function to add Project chatroom to user's chatroom. (Called when the users are alloted to particular project)
/**
 * @desc Assigns a chatroom to users for a specific project.
 * @route
 * @access User, Admin
 * @param {string[]} userIds - List of user IDs to assign the chatroom.
 * @param {string} projectId - The project ID for the chatroom.
 * @returns {Promise<void>}
 */
const allotProjectChatroom = async (userIds: string[], projectId: string): Promise<void> => {
  try {
    if (!userIds?.length || !projectId) {
      throw new Error('Invalid user IDs or project ID provided.');
    }

    const chatDoc = { doc_id: projectId, state: 'unread' };

    await User.updateMany(
      { _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      { $addToSet: { chatRooms: chatDoc } },
    );

    console.log('Chatroom successfully assigned to users.');
  } catch (error) {
    console.error('Error while allotting chatroom to users:', error);
    throw new Error('Failed to assign chatroom.');
  }
};

export {
  generateOtp,
  securePassword,
  sendMail,
  getCurrentISTDate,
  scheduleNotification,
  scheduleNotification2,
  updateDynamicIsland,
  generateUri,
  pingAdmins,
  pingUsers,
  allotProjectChatroom,
};
