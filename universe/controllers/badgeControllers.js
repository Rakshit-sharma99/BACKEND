const { StatusCodes } = require('http-status-codes');
const Badge = require('../models/badge');
const Club = require('../models/club');
const Community = require('../models/community');
const User = require('../models/user');
const { sendMail } = require('../controllers/utils');
const { default: mongoose } = require('mongoose');

//util function
function getBody(n, organisationId, organisationType, organisationInfo) {
  let arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      title: 'Stellar Performer',
      url: 'public/Macbease/SunApr07202410:14:32GMT+0530+0}',
      organisationId,
      organisationType,
      organisationInfo,
    });
  }
  return arr;
}

//Controller 1
const generateBadges = async (req, res) => {
  const { organisationId, organisationType, organisationInfo } = req.body;
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
        organisationInfo
      );
      const badges = await Badge.insertMany(bodyArray);
      if (organisationType === 'Club') {
        let club = await Club.findById(organisationId, { unusedBadges: 1 });
        for (let i = 0; i < badges.length; i++) {
          club.unusedBadges = [badges[i]._id, ...club.unusedBadges];
        }
        club.save();
      } else if (organisationType === 'Community') {
        let community = await Community.findById(organisationId, {
          unusedBadges: 1,
        });
        for (let i = 0; i < badges.length; i++) {
          community.unusedBadges = [badges[i]._id, ...community.unusedBadges];
        }
        community.save();
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
  const { organisationId, number, organisationType, organisationInfo } =
    req.body;
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
        let club = await Club.findById(organisationId, { unusedBadges: 1 });
        club.unusedBadges = [...ids, ...club.unusedBadges];
        club.save();
      } else if (organisationType === 'Community') {
        let community = await Community.findById(organisationId, {
          unusedBadges: 1,
        });
        community.unusedBadges = [...ids, ...community.unusedBadges];
        community.save();
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
    if (organisationType === 'Club') {
      const club = await Club.findById(organisationId, { unusedBadges: 1 });
      const unusedBadges = club.unusedBadges;
      let arr = [];
      for (let i = 0; i < unusedBadges.length; i++) {
        const badgeId = unusedBadges[i];
        const badge = await Badge.findById(badgeId);
        arr.push(badge);
      }
      return res.status(StatusCodes.OK).json(arr);
    } else if (organisationType === 'Community') {
      const community = await Community.findById(organisationId, {
        unusedBadges: 1,
      });
      const unusedBadges = community.unusedBadges;
      let arr = [];
      for (let i = 0; i < unusedBadges.length; i++) {
        const badgeId = unusedBadges[i];
        const badge = await Badge.findById(badgeId);
        arr.push(badge);
      }
      return res.status(StatusCodes.OK).json(arr);
    } else {
      return res
        .status(StatusCodes.OK)
        .send('Please provide valid organissation type.');
    }
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//util function to check authorization
async function checkAuthorization(
  organisationId,
  organisationType,
  concernedId
) {
  try {
    if (organisationType === 'Club') {
      const club = await Club.findById(organisationId, { mainAdmin: 1 });
      if (club.mainAdmin === concernedId) {
        return true;
      }
    } else if (organisationType === 'Community') {
      const community = await Community.findById(organisationId, {
        creatorId: 1,
      });
      if (community.creatorId === concernedId) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.log(error.message);
    return false;
  }
}

//Controller 4
const giveBadge = async (req, res) => {
  const { badgeId, userId, description } = req.body;
  try {
    let badge = await Badge.findById(badgeId);
    if (badge) {
      const isAuthorized = await checkAuthorization(
        badge.organisationId,
        badge.organisationType,
        req.user.id
      );
      if (isAuthorized) {
        badge.description = description;
        badge.ownedBy = userId;
        badge.givenOn = new Date();
        badge.save();
        let user = await User.findById(userId, {
          badges: 1,
          unreadNotice: 1,
          email: 1,
          image: 1,
          name: 1,
          pushToken: 1,
        });
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
        user.save();
        if (badge.organisationType === 'Club') {
          let club = await Club.findById(badge.organisationId, {
            usedBadges: 1,
            unusedBadges: 1,
          });
          club.unusedBadges = club.unusedBadges.filter(
            (item) => item.toString() !== badge._id.toString()
          );
          club.usedBadges = [badge._id, ...club.usedBadges];
          club.save();
        } else if (badge.organisationType === 'Community') {
          let community = await Community.findById(badge.organisationId, {
            usedBadges: 1,
            unusedBadges: 1,
          });
          community.unusedBadges = community.unusedBadges.filter(
            (item) => item.toString() !== badge._id.toString()
          );
          community.usedBadges = [badge._id, ...community.usedBadges];
          community.save();
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

const redundant = async (req, res) => {
  try {
    const ids = arrs.map((item) => mongoose.Types.ObjectId(item));
    const result = await User.updateMany(
      { _id: { $in: ids } }, // Match users by _id
      { $set: { image: 'public/users/Preview-1re.png' } } // Update 'image' field
    );
    console.log(ids);
    return res.status(StatusCodes.OK).send('done');
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

module.exports = {
  giveAdditionalBadges,
  generateBadges,
  getUnusedBadges,
  giveBadge,
  redundant,
};
