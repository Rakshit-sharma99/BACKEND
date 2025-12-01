const { StatusCodes } = require('http-status-codes');
const Admin = require('../models/admin');
const MacbeaseContent = require('../models/macbeaseContent');
const Content = require('../models/content');
const User = require('../models/user');
const Community = require('../models/community');
const { sendMail, fetchContentFromIds, fetchMacbeaseContentFromIds } = require('../controllers/utils');
const { sendKafkaMessage } = require('../config/utils/sendKafkaMessage');

const submitForReview = async (req, res) => {
  const { cid, type, reason } = req.body;
  try {
    let admin = await Admin.findOne(
      { role: 'Content Team' },
      { reviewContent: 1, unreadNotice: 1 }
    );
    if (!admin) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error:
          'Sorry! Content moderation team is unavailable. Please try again later.',
      });
    }
    admin.reviewContent = [
      {
        cid,
        type,
        status: 0,
        userId: req.user.id,
        timeStamp: new Date(),
        reason,
      },
      ...admin.reviewContent,
    ];
    //code to send in-app notification to user and admin
    let sender = await User.findById(req.user.id, {
      email: 1,
      name: 1,
      image: 1,
      unreadNotice: 1,
    });
    if (type === 'normal') {
      let content = await fetchContentFromIds({contentIds:[cid]});
      await sendKafkaMessage("UPDATE_CONTENT","content",{
        contentId:cid,
        updatedFields:{
          underReview:true
        }
      })
      if (content.sendBy === 'club') {
        const noticeForUser = {
          value: `Post is under review. We will keep you posted about actions we take.`,
          img1: sender.image,
          img2: content.url,
          expandType: 'Club',
          expandData: {
            ...content._doc,
          },
          key: 'tag',
          time: new Date(),
          uid: `${new Date()}/${admin._id}/${req.user.id}`,
        };
        const noticeForAdmin = {
          value: `Content marked for review.`,
          img1: sender.image,
          img2: content.url,
          expandType: 'Club',
          expandData: {
            ...content._doc,
          },
          key: 'tag',
          time: new Date(),
          uid: `${new Date()}/${admin._id}/${req.user.id}`,
        };
        admin.unreadNotice = [noticeForAdmin, ...admin.unreadNotice];
        sender.unreadNotice = [noticeForUser, ...sender.unreadNotice];
      } else if (content.sendBy === 'userCommunity') {
        const noticeForUser = {
          value: `Post is under review. We will keep you posted about actions we take.`,
          img1: sender.image,
          img2: content.url,
          expandType: 'Community',
          expandData: {
            ...content._doc,
          },
          key: 'tag',
          time: new Date(),
          uid: `${new Date()}/${admin._id}/${req.user.id}`,
        };
        const noticeForAdmin = {
          value: `Content marked for review.`,
          img1: sender.image,
          img2: content.url,
          expandType: 'Community',
          expandData: {
            ...content._doc,
          },
          key: 'tag',
          time: new Date(),
          uid: `${new Date()}/${admin._id}/${req.user.id}`,
        };
        admin.unreadNotice = [noticeForAdmin, ...admin.unreadNotice];
        sender.unreadNotice = [noticeForUser, ...sender.unreadNotice];
      }
    } else if (type === 'macbease') {
      let content = await fetchMacbeaseContentFromIds({ids:[cid]});
      await sendKafkaMessage("UPDATE_MACBEASE_CONTENT","macbeaseContent",{
        contentId:cid,
        updatedFields:{
          underReview:true
        }
      });
      const noticeForUser = {
        value: `Post is under review. We will keep you posted about actions we take.`,
        img1: sender.image,
        img2: content.url,
        expandType: 'Macbease',
        expandData: {
          ...content._doc,
        },
        key: 'tag',
        time: new Date(),
        uid: `${new Date()}/${admin._id}/${req.user.id}`,
      };
      const noticeForAdmin = {
        value: `Content marked for review.`,
        img1: sender.image,
        img2: content.url,
        expandType: 'Macbease',
        expandData: {
          ...content._doc,
        },
        key: 'tag',
        time: new Date(),
        uid: `${new Date()}/${admin._id}/${req.user.id}`,
      };
      admin.unreadNotice = [noticeForAdmin, ...admin.unreadNotice];
      sender.unreadNotice = [noticeForUser, ...sender.unreadNotice];
    }
    admin.save();
    sender.save();
    return res
      .status(StatusCodes.OK)
      .send('Post successfully submitted for review.');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'An error occurred while submitting for review.' });
  }
};

const readContentForModeration = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('You are not authorized to access this route.');
    }

    const { batch, batchSize } = req.query;
    const admin = await Admin.findById(req.user.id, { reviewContent: 1 });
    let reviewContent = admin.reviewContent || [];

    // Apply batching if batch & batchSize are given
    if (batch && batchSize) {
      const b = parseInt(batch);
      const s = parseInt(batchSize);
      reviewContent = reviewContent.slice((b - 1) * s, b * s);
    }

    // Separate IDs based on type
    const normalIds = [];
    const macbeaseIds = [];
    const idToTypeMap = {}; // Map cid to dataPoint for reference

    for (const dataPoint of reviewContent) {
      idToTypeMap[dataPoint.cid] = dataPoint;
      if (dataPoint.type === 'normal') {
        normalIds.push(dataPoint.cid);
      } else if (dataPoint.type === 'macbease') {
        macbeaseIds.push(dataPoint.cid);
      }
    }

    // Fetch content in batch
    const [normalContentList, macbeaseContentList] = await Promise.all([
      fetchContentFromIds({ contentIds: normalIds }),
      fetchMacbeaseContentFromIds({ ids: macbeaseIds }),
    ]);

    // Convert to map for faster access
    const normalContentMap = {};
    for (const item of normalContentList || []) {
      normalContentMap[item._id.toString()] = item;
    }

    const macbeaseContentMap = {};
    for (const item of macbeaseContentList || []) {
      macbeaseContentMap[item._id.toString()] = item;
    }

    // Build final result
    const finalData = reviewContent.map(dataPoint => {
      const cid = dataPoint.cid.toString();
      let content = null;

      if (dataPoint.type === 'normal') {
        content = normalContentMap[cid];
      } else if (dataPoint.type === 'macbease') {
        content = macbeaseContentMap[cid];
      }

      if (content) {
        content.comments = content.comments?.slice(0, 6);
      }

      return {
        ...dataPoint,
        content,
      };
    });

    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json('Something went wrong.');
  }
};

const discardReviewClaim = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { cid, type } = req.body;
      if (type === 'normal') {
          await sendKafkaMessage("UPDATE_CONTENT","content",{
            contentId:cid,
            updatedFields:{
              underReview:false
            }
          })
      } else if (type === 'macbease') {
          await sendKafkaMessage("UPDATE_MACBEASE_CONTENT","macbeaseContent",{
            contentId:cid,
            updatedFields:{
              underReview:false
            }
          });
      }
      let admin = await Admin.findById(req.user.id, { reviewContent: 1 });
      let reviewList = admin.reviewContent;
      let userId = '';
      for (let i = 0; i < reviewList.length; i++) {
        let dataPoint = reviewList[i];
        if (dataPoint.cid === cid) {
          dataPoint.status = 1;
          userId = dataPoint.userId;
          break;
        }
      }
      admin.reviewContent = [];
      admin.reviewContent = reviewList;
      admin.save();
      //code to send review result email
      if (userId) {
        const user = await User.findById(userId, { email: 1, name: 1 });
        const intro = [
          'Thank you for taking out time to report content. This helps us to stick to rigorous community guidelines.',
          `After much consultation, the content has been declared fit for the platform.`,
        ];
        const outro =
          'If you did not report a content, please avoid this email.';
        const subject = 'Content Review Action';
        const destination = [user.email];
        const { ses, params } = await sendMail(
          user.name,
          intro,
          outro,
          subject,
          destination
        );
        ses.sendEmail(params, function (err, data) {
          if (err) {
            console.log(err, err.stack);
            return res.status(StatusCodes.OK).send('Something went wrong.');
          } else {
            return res
              .status(StatusCodes.OK)
              .send('Review discarded successfully.');
          }
        });
      } else {
        return res
          .status(StatusCodes.OK)
          .send('Review discarded successfully.');
      }
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('You are not authorized to access this route.');
    }
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'An error occurred while discarding the review.' });
  }
};

const addDiscretion = async (req, res) => {
  try {
    const { cid, type, discretion, blur, mode } = req.body;

    // Authorization check
    if (req.user.role !== 'admin' && mode !== 'community_moderation') {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('You are not authorized to access this route.');
    }

    // Handle community moderation
    if (mode === 'community_moderation') {

      const content = await fetchContentFromIds({contentIds:[cid],select:["belongsTo"]});
      console.log("content",content);
      if (!content) {
        return res.status(StatusCodes.NOT_FOUND).send('Content not found.');
      }

      const community = await Community.findById(content[0].belongsTo, {
        admins: 1,
      });
      console.log("community",community)
      if (!community) {
        return res.status(StatusCodes.NOT_FOUND).send('Community not found.');
      }

      const isAdmin = community.admins.some(
        (adminId) => adminId.toString() === req.user.id
      );

      if (!isAdmin) {
        return res
          .status(StatusCodes.FORBIDDEN)
          .send('You are not authorized to moderate this community.');
      }

      await sendKafkaMessage("UPDATE_CONTENT","content",{
        contentId:cid,
        updatedFields:{
          underReview:false,
          discretion,
          blur
        }
      })

      return res.status(StatusCodes.OK).send('Discretion added successfully.');
    }

    // Update content based on type
    if (type === 'normal') {
      await sendKafkaMessage("UPDATE_CONTENT","content",{
        contentId:cid,
        updatedFields:{
          underReview:false,
          discretion,
          blur
        }
      })
    } else if (type === 'macbease') {
      await sendKafkaMessage("UPDATE_MACBEASE_CONTENT","macbeaseContent",{
        contentId:cid,
        updatedFields:{
          underReview:false,
          discretion,
          blur
        }
      });
    }

    // Update admin review list
    if (mode !== 'community_moderation') {
      const admin = await Admin.findById(req.user.id, { reviewContent: 1 });

      if (!admin) {
        return res.status(StatusCodes.NOT_FOUND).send('Admin not found.');
      }

      const reviewList = admin.reviewContent.map((dataPoint) =>
        dataPoint.cid === cid ? { ...dataPoint, status: 1 } : dataPoint
      );

      admin.reviewContent = reviewList;
      await admin.save();
    }

    return res.status(StatusCodes.OK).send('Discretion added successfully.');
  } catch (error) {
    console.error('Error in addDiscretion:', error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'An error occurred while submitting the discretion.' });
  }
};

module.exports = {
  submitForReview,
  readContentForModeration,
  discardReviewClaim,
  addDiscretion,
};
