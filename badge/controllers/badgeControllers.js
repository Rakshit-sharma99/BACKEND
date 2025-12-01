const { StatusCodes } = require('http-status-codes');
const Badge = require('../models/badge');
const { mongoose } = require('mongoose');
const { getBody, getClubFieldsById,getCommunityFieldsById,checkAuthorization,sendMail,getUserById } = require('./utilControllers');
const { sendKafkaMessage } = require('../config/utils/sendKafkaMessage');

// Controller 1

const generateBadges = async (req, res) => {
  const { organisationId, organisationType, organisationInfo,universeMetaData } = req.body;
  try {
    // Calculate the start and end dates of the current month
    const currentDate = new Date();
    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );

    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    const allotedBadges = await Badge.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
          organisationId,
        },
      },
    ]);

    if (allotedBadges.length >= 5) {
      return res
        .status(StatusCodes.OK)
        .send('You have been already granted all the badges for this month.');
    } else {
      const bodyArray = getBody(
        5 - allotedBadges.length,
        organisationId,
        organisationType,
        organisationInfo,
        req.user.uid,
        universeMetaData
      );

      const badges = await Badge.insertMany(bodyArray);

      const newBadgeIds = badges.map(badge => badge._id);

      if (organisationType === 'Club') {
          await sendKafkaMessage('UPDATE_CLUB',req.user.callSign,{newBadgeIds,organisationId})
      } else if (organisationType === 'Community') {
        await sendKafkaMessage('UPDATE_COMMUNITY',req.user.callSign,{newBadgeIds,organisationId})
      }
      return res.status(StatusCodes.OK).json(badges);
    }
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 2

const giveAdditionalBadges = async (req, res) => {
  const { organisationId, number, organisationType, organisationInfo } = req.body;
  try {
    if (req.user.role === 'admin') {
      const bodyArray = getBody(
        number,
        organisationId,
        organisationType,
        organisationInfo
      );

      const badges = await Badge.insertMany(bodyArray);

      const ids = badges.map((doc) => doc._id);

      if (organisationType === 'Club') {
        await sendKafkaMessage('UPDATE_CLUB',req.user.callSign,{newBadgeIds:ids,organisationId})
      } else if (organisationType === 'Community') {
        await sendKafkaMessage('UPDATE_COMMUNITY',req.user.callSign,{newBadgeIds:ids,organisationId})
      }
      return res.status(StatusCodes.OK).json(badges);
    } else {
      return res
        .status(StatusCodes.OK)
        .send('You are not authorized to give badges.');
    }
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 3

const getUnusedBadges = async (req, res) => {
  const { organisationType, organisationId } = req.query;

  try {
    let unusedBadges = [];
    let fields = ["unusedBadges"]
    if (organisationType === 'Club') {
      unusedBadges = await getClubFieldsById(organisationId,fields);
    } else if (organisationType === 'Community') {
      unusedBadges = await getCommunityFieldsById(organisationId,fields);
    } else {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('Please provide a valid organisation type.');
    }
    const badges = await Badge.find({ _id: { $in: unusedBadges } });
    return res.status(StatusCodes.OK).json(badges);
  } catch (error) {
    console.error(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};


//Controller 4

const giveBadge = async (req, res) => {
  const { badgeId, userId, description } = req.body;
  try {
    let badge = await Badge.findById(badgeId);
    if (badge) {
      const isAuthorized = await checkAuthorization(badge.organisationId,badge.organisationType,req.user.id);
      if (isAuthorized) {
        badge.description = description;
        badge.ownedBy = userId;
        badge.givenOn = new Date();
        await badge.save();

        const userFields = ['badges', 'unreadNotice', 'email', 'image', 'name', 'pushToken'];

        const user = await getUserById(userId, userFields.join(','));

        if (!user) {
          return res.status(StatusCodes.NOT_FOUND).send('User not found.');
        }

        user.badges = [badge._id, ...user.badges];

        const notice = {
          value: 'You have earned a badge. Tap to view.',
          img1: user.image,
          img2: badge.url,
          key: 'badge',
          action: 'profile2',
          params: {
            img: user.image,
            name: user.name,
            id: user._id,
            userPushToken: user.pushToken,
          },
          time: new Date(),
          uid: `${new Date()}/${user._id}/${badge._id}`,
        };

        user.unreadNotice = [notice, ...user.unreadNotice];
        await user.save();

        const fields = ["usedBadges","unusedBadges"];

        if (badge.organisationType === 'Club') {
          
          let club = await getClubFieldsById(badge.organisationId,fields);

          club.unusedBadges = club.unusedBadges.filter(
            (item) => item.toString() !== badge._id.toString()
          );

          club.usedBadges = [badge._id, ...club.usedBadges];

          await club.save();
        } else if (badge.organisationType === 'Community') {

          let community = await getCommunityFieldsById(badge.organisationId,fields);

          community.unusedBadges = community.unusedBadges.filter(
            (item) => item.toString() !== badge._id.toString()
          );

          community.usedBadges = [badge._id, ...community.usedBadges];
          await community.save();
        }
        
        //sending email to the user

        const name = user.name;
        const intro = [
          `We are so delighted to inform you that you have earned the Stellar Performer badge from ${badge.organisationInfo.name}`,
          `We look forward to see marvelous work from your side.`,
        ];
        const outro = 'It is the milestone!';
        const subject = 'Macbease Badge';
        const destination = [user.email];

        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          destination
        );

        ses.sendEmail(params, function (err, data) {
          if (err) {
            console.log(err, err.stack);
          }
        });

        return res.status(StatusCodes.OK).send('Badge send successfully.');
      } else {
        return res
          .status(StatusCodes.OK)
          .send('You are not authorized to give badge.');
      }
    } else {
      return res.status(StatusCodes.OK).send('Invalid badge id.');
    }
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 5

const redundant = async (req, res) => {
  try {
    const ids = arrs.map((item) => mongoose.Types.ObjectId(item));

    await sendKafkaMessage('UPDATE_USER',req.user.callSign,{ids});

    return res.status(StatusCodes.OK).send('done');
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

const insertNewFields = async (req, res) => {
  try {
    const allBadge = await Badge.find({});

    const bulkOps = allBadge.map((Badge) => ({
      updateOne: {
        filter: { _id: Badge._id },
        update: {
          $set: {
            uid: "682f0418482d651a6df66c23",
            universeMetaData: {
              location: "Phagwara,Punjab,India",
              logo: "public/universes/lpu_logo.jpg",
              name: "Lovely Professional University",
              callSign: "universe",
            },
          },
        },
      },
    }));

    const result = await Badge.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} badge`);

    res.status(StatusCodes.OK).json({
      message: "badge updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(StatusCodes.FORBIDDEN).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  generateBadges,
  giveAdditionalBadges,
  getUnusedBadges,
  giveBadge,
  redundant,
  insertNewFields
};
