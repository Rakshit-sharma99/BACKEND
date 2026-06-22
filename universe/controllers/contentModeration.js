const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Admin = require('../models/admin');
const User = require('../models/user');
const Community = require('../models/community');
const { sendMail, fetchContentFromIds } = require('../controllers/utils');
const { sendKafkaMessage } = require('../config/utils/sendKafkaMessage');
const { getModerationEmailHtml } = require('../utils/moderationEmailTemplate');

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
    let resolvedType = type ? type.toLowerCase() : 'normal';
    const isMacbease = await mongoose.connection.db.collection('macbeasecontents').findOne({
      _id: mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid
    });
    if (isMacbease) {
      resolvedType = 'macbease';
    }

    admin.reviewContent = [
      {
        cid,
        type: resolvedType,
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
    if (resolvedType === 'normal') {
      let contentList = await fetchContentFromIds({ contentIds: [cid] });
      await sendKafkaMessage("UPDATE_CONTENT", "content", {
        contentId: cid,
        updatedFields: {
          underReview: true
        }
      });
      const content = contentList && contentList.length > 0 ? contentList[0] : null;
      if (content) {
        if (content.sendBy === 'club') {
          const noticeForUser = {
            value: `Post is under review. We will keep you posted about actions we take.`,
            img1: sender.image,
            img2: content.url,
            expandType: 'Club',
            expandData: {
              ...content,
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
              ...content,
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
              ...content,
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
              ...content,
            },
            key: 'tag',
            time: new Date(),
            uid: `${new Date()}/${admin._id}/${req.user.id}`,
          };
          admin.unreadNotice = [noticeForAdmin, ...admin.unreadNotice];
          sender.unreadNotice = [noticeForUser, ...sender.unreadNotice];
        }
      }
    } else if (resolvedType === 'macbease') {
      await mongoose.connection.db.collection('macbeasecontents').updateOne(
        { _id: mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid },
        { $set: { underReview: true } }
      );
    }
    admin.save();
    sender.save();

    if (sender && sender.email) {
      try {
        const reporterSubject = `We have received your report [Reference ID: #${cid}]`;
        const emailHTML = getModerationEmailHtml({
          userName: sender.name,
          introParagraph1: 'Thank you for reporting content that may violate our community guidelines. Our moderation team has received your report and is currently reviewing it.',
          introParagraph2: 'If you have any additional context, screenshots, evidence, or information that may help our investigation, you may reply directly to this email and our team will review it as part of the case.',
          isReporter: true
        });
        const { ses, params } = await sendMail(
          sender.name,
          '',
          '',
          reporterSubject,
          [sender.email],
          undefined,
          emailHTML
        );
        ses.sendEmail(params, function (err) {
          if (err) console.log('Error sending report confirmation email to reporter:', err);
        });
      } catch (emailErr) {
        console.error('Error sending report confirmation email to reporter:', emailErr.message);
      }
    }

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
    
    // Fetch reviewContent from all admins and flatten it
    const admins = await Admin.find({ "reviewContent": { $exists: true, $not: {$size: 0} } }, { reviewContent: 1 });
    let reviewContent = [];
    admins.forEach(a => {
      reviewContent = reviewContent.concat(a.reviewContent);
    });
    
    // Sort by timestamp descending so newest reports are first
    reviewContent.sort((a, b) => new Date(b.timeStamp) - new Date(a.timeStamp));

    // Apply batching if batch & batchSize are given
    if (batch && batchSize) {
      const b = parseInt(batch);
      const s = parseInt(batchSize);
      reviewContent = reviewContent.slice((b - 1) * s, b * s);
    }

    // Separate IDs based on actual existence in macbeasecontents
    const allCids = reviewContent.map(dp => dp.cid);
    const existingMacbeasePosts = await mongoose.connection.db.collection('macbeasecontents')
      .find({ _id: { $in: allCids.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) } }, { _id: 1 })
      .toArray();
    const macbeaseIdsSet = new Set(existingMacbeasePosts.map(p => p._id.toString()));

    const normalIds = [];
    const macbeaseIds = [];
    const idToTypeMap = {}; // Map cid to dataPoint for reference

    for (const dataPoint of reviewContent) {
      const cidStr = dataPoint.cid.toString();
      idToTypeMap[cidStr] = dataPoint;
      if (macbeaseIdsSet.has(cidStr)) {
        macbeaseIds.push(dataPoint.cid);
        dataPoint.type = 'macbease';
      } else {
        normalIds.push(dataPoint.cid);
        dataPoint.type = 'normal';
      }
    }

    // Fetch content in batch (normal content from Content service, macbease content directly from MongoDB)
    const [normalContentList, macbeaseContentList] = await Promise.all([
      fetchContentFromIds({ contentIds: normalIds }),
      mongoose.connection.db.collection('macbeasecontents')
        .find({ _id: { $in: macbeaseIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) } })
        .toArray()
    ]);

    // Convert to map for faster access
    const normalContentMap = {};
    for (const item of normalContentList || []) {
      normalContentMap[item._id.toString()] = item;
    }
    for (const item of macbeaseContentList || []) {
      normalContentMap[item._id.toString()] = item;
    }


    // Fetch reporter users in batch
    const userIds = [...new Set(reviewContent.map(dp => dp.userId).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } }, { name: 1, image: 1 });
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = u;
    });

    // Build final result
    const finalData = reviewContent.map(dataPoint => {
      const cid = dataPoint.cid.toString();
      let content = null;

      const typeLower = dataPoint.type ? dataPoint.type.toLowerCase() : '';
      if (typeLower === 'normal' || typeLower === 'macbease') {
        content = normalContentMap[cid];
      }

      if (content) {
        content.comments = content.comments?.slice(0, 6);
      }

      const rawData = dataPoint.toObject ? dataPoint.toObject() : dataPoint;
      const reporter = userMap[rawData.userId?.toString()];

      return {
        ...rawData,
        reporterName: reporter ? reporter.name : 'Unknown User',
        reporterImage: reporter ? reporter.image : '',
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
      let resolvedType = type ? type.toLowerCase() : 'normal';
      const isMacbease = await mongoose.connection.db.collection('macbeasecontents').findOne({
        _id: mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid
      });
      if (isMacbease) {
        resolvedType = 'macbease';
      }

      if (resolvedType === 'normal') {
        await sendKafkaMessage("UPDATE_CONTENT", "content", {
          contentId: cid,
          updatedFields: {
            underReview: false
          }
        })
      } else if (resolvedType === 'macbease') {
        await mongoose.connection.db.collection('macbeasecontents').updateOne(
          { _id: mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid },
          { $set: { underReview: false } }
        );
      }
      let admin = await Admin.findOne({ "reviewContent.cid": cid }, { reviewContent: 1 });
      
      const activeReports = admin ? admin.reviewContent.filter(
        (dataPoint) => dataPoint.cid === cid && dataPoint.status === 0
      ) : [];
      const uniqueReporterIds = [...new Set(activeReports.map((item) => item.userId).filter(Boolean))];
      
      let reporters = [];
      if (uniqueReporterIds.length > 0) {
        reporters = await User.find(
          { _id: { $in: uniqueReporterIds } },
          { email: 1, name: 1 }
        );
      }

      if (admin) {
        const reviewList = admin.reviewContent.map((dataPoint) =>
          dataPoint.cid === cid ? { ...dataPoint, status: 1 } : dataPoint
        );
        admin.reviewContent = [];
        admin.reviewContent = reviewList;
        await admin.save();
      }

      // Send platform-fit notifications to all unique reporters using the new template
      for (const reporter of reporters) {
        if (reporter && reporter.email) {
          try {
            const reporterSubject = `Content Review Update - Action Completed [Reference ID: #${cid}]`;
            const emailHTML = getModerationEmailHtml({
              userName: reporter.name,
              introParagraph1: 'Thank you for taking the time to report content. Your vigilance helps us maintain a safe and respectful community.',
              introParagraph2: 'After careful review by our moderation team, the reported content has been declared fit for the platform and no further action is required.',
              actionTitle: 'Content review completed',
              actionDescription: 'Content found compliant with community guidelines',
              outroParagraph1: 'If you did not report this content,',
              outroParagraph2: 'please disregard this email.',
              isReporter: true
            });
            const { ses, params } = await sendMail(
              reporter.name,
              '',
              '',
              reporterSubject,
              [reporter.email],
              undefined,
              emailHTML
            );
            ses.sendEmail(params, function (err) {
              if (err) console.log('Error sending fit-for-platform email to reporter:', err);
            });
          } catch (emailErr) {
            console.error('Error sending fit-for-platform email to reporter:', emailErr.message);
          }
        }
      }

      return res
        .status(StatusCodes.OK)
        .send('Review discarded successfully.');
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
    const moderationUpdate = {
      underReview: false,
      discretion,
    };

    if (blur !== undefined) {
      moderationUpdate.blur = blur === true || blur === 'true';
    }

    // Authorization check
    if (req.user.role !== 'admin' && mode !== 'community_moderation') {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('You are not authorized to access this route.');
    }

    // Handle community moderation
    if (mode === 'community_moderation') {

      const content = await fetchContentFromIds({ contentIds: [cid], select: ["belongsTo"] });
      console.log("content", content);
      if (!content) {
        return res.status(StatusCodes.NOT_FOUND).send('Content not found.');
      }

      const community = await Community.findById(content[0].belongsTo, {
        admins: 1,
      });
      console.log("community", community)
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

      await sendKafkaMessage("UPDATE_CONTENT", "content", {
        contentId: cid,
        updatedFields: moderationUpdate
      })

      return res.status(StatusCodes.OK).send('Discretion added successfully.');
    }

    // Update content based on type (dynamically resolved)
    let resolvedType = type ? type.toLowerCase() : 'normal';
    const isMacbease = await mongoose.connection.db.collection('macbeasecontents').findOne({
      _id: mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid
    });
    if (isMacbease) {
      resolvedType = 'macbease';
    }

    if (resolvedType === 'normal') {
      await sendKafkaMessage("UPDATE_CONTENT", "content", {
        contentId: cid,
        updatedFields: moderationUpdate
      })
    } else if (resolvedType === 'macbease') {
      const objectId = mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid;
      
      // Update macbeasecontents collection
      await mongoose.connection.db.collection('macbeasecontents').updateOne(
        { _id: objectId },
        { $set: moderationUpdate }
      );
      
      // ALSO update Content collection so feed API gets the blur
      // This ensures blur shows in getContentForLanding API response
      await mongoose.connection.db.collection('contents').updateOne(
        { _id: objectId },
        { $set: moderationUpdate }
      );

      // Publish the same Content update event used by normal posts so the
      // content service invalidates landing_feed:* and seen_content:* caches.
      await sendKafkaMessage("UPDATE_CONTENT", "content", {
        contentId: cid,
        updatedFields: moderationUpdate
      });
    }

    // Update admin review list and send email notifications
    if (mode !== 'community_moderation') {
      const admin = await Admin.findOne({ "reviewContent.cid": cid }, { reviewContent: 1 });

      if (!admin) {
        return res.status(StatusCodes.NOT_FOUND).send('Admin not found.');
      }

      // Find all unique active reporters associated with this content
      const activeReports = admin.reviewContent.filter(
        (dataPoint) => dataPoint.cid === cid && dataPoint.status === 0
      );
      const uniqueReporterIds = [...new Set(activeReports.map((item) => item.userId).filter(Boolean))];
      
      let reporters = [];
      if (uniqueReporterIds.length > 0) {
        reporters = await User.find(
          { _id: { $in: uniqueReporterIds } },
          { email: 1, name: 1 }
        );
      }

      const reviewList = admin.reviewContent.map((dataPoint) =>
        dataPoint.cid === cid ? { ...dataPoint, status: 1 } : dataPoint
      );

      admin.reviewContent = reviewList;
      await admin.save();

      // Send email notifications when post is blurred
      if (moderationUpdate.blur) {
        // Send email to every unique reporter who reported the content
        for (const reporter of reporters) {
          if (reporter && reporter.email) {
            try {
              const reporterSubject = `Content Review Update - Action Taken [Reference ID: #${cid}]`;
              const emailHTML = getModerationEmailHtml({
                userName: reporter.name,
                introParagraph1: 'Thank you for taking the time to report content. Your vigilance helps us maintain a safe and respectful community.',
                introParagraph2: 'After careful review by our moderation team, appropriate action has been taken on the reported content.',
                actionTitle: 'Discretion notice applied',
                actionDescription: discretion,
                outroParagraph1: 'If you did not report this content,',
                outroParagraph2: 'please disregard this email.',
                isReporter: true
              });
              const { ses, params } = await sendMail(
                reporter.name,
                '',
                '',
                reporterSubject,
                [reporter.email],
                undefined,
                emailHTML
              );
              ses.sendEmail(params, function (err) {
                if (err) console.log('Error sending email to reporter:', err);
              });
            } catch (emailErr) {
              console.error('Error sending email to reporter:', emailErr.message);
            }
          }
        }

        // Email to post owner (the user who created the content)
        try {
          const contentData = await fetchContentFromIds({
            contentIds: [cid],
            select: ['idOfSender'],
          });
          const postOwnerId =
            contentData && contentData.length > 0
              ? contentData[0].idOfSender
              : null;

          if (postOwnerId) {
            const postOwner = await User.findById(postOwnerId, {
              email: 1,
              name: 1,
            });
            if (postOwner && postOwner.email) {
              const ownerSubject = `Content Moderation Notice - Action Taken [Reference ID: #${cid}]`;
              const emailHTML = getModerationEmailHtml({
                userName: postOwner.name,
                introParagraph1: 'Your content has been moderated because it was found to violate one or more community guidelines.',
                introParagraph2: '',
                actionTitle: 'Action Taken: Content blurred/restricted by moderation team',
                actionDescription: `Reason: ${discretion}`,
                outroParagraph1: 'How to appeal this decision?',
                outroParagraph2: 'If you believe this decision was made in error, you may appeal by replying directly to this email and providing any additional context or evidence that supports your position. Our moderation team will review your appeal and contact you with the outcome.',
                isReporter: false
              });
              const { ses, params } = await sendMail(
                postOwner.name,
                '',
                '',
                ownerSubject,
                [postOwner.email],
                undefined,
                emailHTML
              );
              ses.sendEmail(params, function (err) {
                if (err)
                  console.log('Error sending email to post owner:', err);
              });
            }
          }
        } catch (emailErr) {
          console.error(
            'Error sending email to post owner:',
            emailErr.message
          );
        }
      }
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
