const User = require("../../../models/user");
const Club = require("../../../models/club");
const {
  sendMail,
  scheduleNotification,
} = require("../../../controllers/utils");

const featured_secondary_action = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { clubId, eventId, eventName, eventPoster, eventManagerMail } = data;

    if (
      !clubId ||
      !eventId ||
      !eventName ||
      !eventPoster ||
      !eventManagerMail
    ) {
      console.warn("Missing essential data in message payload");
      return;
    }

    const clubDetails = await Club.findById(clubId, {
      name: 1,
      mainAdmin: 1,
      _id: 0,
      members: 1,
      secondaryImg: 1,
    });

    if (!clubDetails) {
      console.warn(`Club not found for id: ${clubId}`);
      return;
    }

    const userDetail = await User.findById(clubDetails.mainAdmin, {
      name: 1,
      email: 1,
      _id: 0,
    });

    const emailIntro = [
      "Congratulations! We at Macbease are delighted to deliver you a great news.",
      `The event ${eventName} posted in your club ${clubDetails.name} has been selected to be featured on Macbease event console. Tickets are live now!`,
    ];
    const emailOutro =
      "We wish you a great event. The team at Macbease will always be more than willing to help you.";
    const emailSubject = `Confirmation- ${eventName}`;
    const name = `Team ${clubDetails.name}`;

    // Send to event manager & main admin
    const to = new Set([userDetail?.email, eventManagerMail]);
    // const { ses, params } = await sendMail(
    //   name,
    //   emailIntro,
    //   emailOutro,
    //   emailSubject,
    //   Array.from(to)
    // );
    // await ses.sendEmail(params).promise();

    // Fetch club members
    const members = await User.find(
      { _id: { $in: clubDetails.members } },
      { pushToken: 1, name: 1, email: 1, unreadNotice: 1 }
    );

    const loopIntro = [
      "Congratulations! We at Macbease are delighted to deliver you a great news.",
      `The event ${eventName} posted in your club ${clubDetails.name} is now featuring on Macbease. Tickets are live, go buy one for yourself!`,
    ];
    const loopOutro = "We will see you at the event.";
    const loopSubject = `Great update- ${eventName}`;

    for (const member of members) {
      try {
        const notice = {
          value: `Tickets for ${eventName} organized by ${clubDetails.name} is live. Go and buy one!`,
          img1: clubDetails.secondaryImg,
          img2: eventPoster,
          key: "event",
          action: "club",
          params: {
            name: clubDetails.name,
            secondaryImg: clubDetails.secondaryImg,
            id: clubId,
          },
          time: new Date(),
          uid: `${new Date().toISOString()}/${eventId}/ticketLive`,
        };

        member.unreadNotice = [notice, ...member.unreadNotice];
        await member.save();

        // Send mail
        // const { ses: memberSes, params: memberParams } = await sendMail(
        //   "there",
        //   loopIntro,
        //   loopOutro,
        //   loopSubject,
        //   [member.email]
        // );
        // await memberSes.sendEmail(memberParams).promise();

        // Send push notification
        if (member.pushToken) {
          scheduleNotification(
            [member.pushToken],
            `Hi there!`,
            `Tickets for ${eventName} organized by ${clubDetails.name} is live. Go and buy one!`
          );
        }
      } catch (innerErr) {
        console.warn(`❌ Error processing member ${member._id}:`, innerErr);
      }
    }
  } catch (error) {
    console.error("❌ featured_secondary_action failed", error);
  }
};

module.exports = { featured_secondary_action };
