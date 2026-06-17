const axios = require("axios");
const jwt = require("jsonwebtoken");
const ChapterLeader = require("../models/chapterLeader");
const Admin = require("../models/admin")
const bcrypt = require("bcryptjs");
const { StatusCodes } = require("http-status-codes");
const { sendMail } = require("./utils");
const { sendKafkaMessage } = require('../config/utils/sendKafkaMessage');

const generateServiceToken = () => {
  const token = jwt.sign(
    { service: "universe", role: "internal" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" }
  );
  return { headers: { authorization: `Bearer ${token}` } };
};

const QUEST_SERVICE_URL = process.env.QUEST_SERVICE_URL || "http://quest1:7120";

const generateProfessionalMail = (name, contentHTML, outro) => {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333333; line-height: 1.6; font-size: 16px;">
      <p>Hi ${name},</p>
      <br />
      ${contentHTML}
      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 26px 0;" />
      <p>${outro}</p>
      <p style="margin-bottom: 30px;">
        <strong>Best regards,</strong><br/>
        The Macbase Team
      </p>
      <div style="background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 14px; color: #666666;">
        © ${new Date().getFullYear()} Macbase. All rights reserved.
      </div>
    </div>
  `;
};

const register = async (req, res) => {
  try {
    const { name, email, phone, password, college, socialLink } = req.body;

    if (!name || !email || !password || !phone || !college || !socialLink) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "All fields required (name, email, phone, password, college, socialLink)",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await ChapterLeader.findOne({
      $or: [{ email: normalizedEmail }, { phone }],
    });

    if (existing) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "A chapter leader with this email or phone already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await ChapterLeader.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      phone,
      college,
      socialLink,
    });

    // secondary actions
    try {
      // 1. Chapter Leader mail
      const emailContent = `
        <div style="font-size:16px; line-height:1.7;">
          <strong>Welcome to the Macbase Chapter Leader community!</strong>
        </div>
        <p>We're excited to have you on board. Your journey as a Chapter Leader begins now.</p>
        <div style="background:#f4f7ff; padding:16px; border-radius:10px; border-left:4px solid #4f46e5; margin: 20px 0;">
          <strong>What Happens Next:</strong><br/>
          Our team will review your application and get in touch with you soon.
        </div>
        <p>Get ready to lead, inspire, and make a difference in your community.</p>
        <p>
          <a href="https://macbease.com" style="display:inline-block; margin-top:10px; padding:12px 22px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">
            Visit Macbase Website
          </a>
        </p>
      `;

      const outro = "We're looking forward to seeing the great things you'll do! 🌟";
      const emailHTML = generateProfessionalMail(user.name, emailContent, outro);
      const subject = "Welcome to Macbase - Chapter Leader Registration"

      const { ses: ses1, params: params1 } = await sendMail(
        user.name,
        "",
        "",
        subject,
        [user.email],
        null,
        emailHTML
      );

      ses1.sendEmail(params1, (err) => {
        if (err) console.error("[ChapterLeader.register] SES sendEmail error:", err);
        else console.log(`[ChapterLeader.register] Welcome email sent to ${user.email}`);
      });

      // 2. Admin notification
      const admins = await Admin.find({ chapterLeaderReview: true })

      admins.forEach(async (admin) => {
        try {
          const adminEmailContent = `
            <div style="font-size:16px; line-height:1.7;">
              <strong>A new Chapter Leader has stepped into the Macbase universe!</strong>
            </div>
            <p>A fresh spark has joined the community and is ready to lead, inspire, and build something remarkable.</p>
            <div style="background:#f4f7ff; padding:16px; border-radius:10px; border-left:4px solid #4f46e5; margin: 20px 0;">
              <strong>Action Required:</strong><br/>
              Visit your Admin Dashboard to review the new Chapter Leader application and decide whether to welcome them aboard.
            </div>
            <p>The next great chapter might just begin with this approval.</p>
            <p>
              <a href="https://admin.macbease.com" style="display:inline-block; margin-top:10px; padding:12px 22px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">
                Review in Admin Dashboard
              </a>
            </p>
          `;

          const outro = "Thanks for keeping the Macbase galaxy running smoothly.";
          const emailHTML = generateProfessionalMail(admin.name, adminEmailContent, outro);
          const subject = "New Chapter Leader Ready for Review";

          const { ses, params } = await sendMail(
            admin.name,
            "",
            "",
            subject,
            [admin.email],
            null,
            emailHTML
          );

          ses.sendEmail(params, (err) => {
            if (err) console.error("[ChapterLeader.register] SES sendEmail error:", err);
            else console.log(`[ChapterLeader.register] admin email sent to ${admin.email}`);
          });
        } catch (mailErr) {
          console.error("Mail failed:", mailErr.message);
        }
      })
    }
    catch (error) {
      console.error("Secondary actions failed:", error);
    }
    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Registration successful. Your account is pending verification.",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        uid: user.uid,
      },
    });
  } catch (err) {
    console.error("register error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Email & password required",
      });
    }

    const user = await ChapterLeader.findOne({
      email: email.toLowerCase().trim(),
    }).select("+password");

    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isVerified) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "Your account is under review. You'll be able to access it once approved.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const accessToken = user.createAccessToken();
    const refreshToken = user.createRefreshToken();

    return res.status(StatusCodes.OK).json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        uid: user.uid,
        universeMetaData: user.universeMetaData,
      },
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const regenerateAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Refresh token required",
      });
    }

    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(StatusCodes.FORBIDDEN).json({
          success: false,
          message: "Invalid or expired refresh token",
        });
      }

      const user = await ChapterLeader.findById(decoded.id);

      if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          message: "User not found",
        });
      }

      const newAccessToken = user.createAccessToken();

      return res.status(StatusCodes.OK).json({
        success: true,
        accessToken: newAccessToken,
      });
    });
  } catch (err) {
    console.error("regenerateAccessToken error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const verifyChapterLeader = async (req, res) => {
  try {
    // Admin guard
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "Unauthorized: admin access required",
      });
    }

    const {
      chapterLeaderId,
      name,
      callSign,
      location,
      lat,
      lng,
      logo,
      logoKey,
    } = req.body;

    if (!chapterLeaderId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "userId is required",
      });
    }

    const chapterLeader = await ChapterLeader.findById(chapterLeaderId);

    if (!chapterLeader) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Chapter leader not found",
      });
    }

    if (chapterLeader.isVerified) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Chapter leader is already verified",
      });
    }

    // Fetch all active quests from quest1 service
    const config = generateServiceToken();
    let quests = [];

    try {
      const response = await axios.get(
        `${QUEST_SERVICE_URL}/quest1/api/v1/getAllQuests`,
        { timeout: 5000, ...config }
      );
      quests = response.data?.quests || [];
    } catch (questErr) {
      console.error("Failed to fetch quests from quest1:", questErr.message);
      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        success: false,
        message: "Could not reach quest service. Please try again.",
      });
    }

    // Determine which quests the leader doesn't have yet
    const existingQuestIds = new Set(
      chapterLeader.progress.map((p) => p.questId.toString())
    );

    const newProgressEntries = quests
      .filter((quest) => !existingQuestIds.has(quest._id.toString()))
      .map((quest) => {
        return {
          questId: quest._id,
          overallProgress: 0,
          value: 0,
          isCompleted: false,
          completedAt: null,
          isRewardClaimed: false,
          rewardClaimedAt: null,
          lastUpdatedAt: new Date(),
        };
      });

    chapterLeader.progress.push(...newProgressEntries);
    chapterLeader.isVerified = true;
    chapterLeader.approvedBy = req.user.id;

    await chapterLeader.save();
    // emit event to create universe
    await sendKafkaMessage(
      "CREATE_UNIVERSE",
      "multiverse",
      {
        chapterLeaderId : chapterLeader._id,
        name,
        location,
        callSign,
        lat,
        lng,
        logo,
        logoKey
      }
    );
    // secondary Actions
    try {
      const emailContent = `
        <p>Congratulations! Your chapter leader account has been verified.</p>
        <p>Click the button below to access your dashboard and get started.</p>
        <p>
          <a href="https://app.macbease.com" style="display:inline-block; margin-top:10px; padding:12px 22px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">
            Access Dashboard
          </a>
        </p>
      `;
      const outro = "Get ready to unlock new quests and build your universe! 🚀";
      const emailHTML = generateProfessionalMail(chapterLeader.name, emailContent, outro);
      const recipientEmail = chapterLeader.email;
      const subject = "Chapter Leader Account Verified";

      try {
        const { ses, params } = await sendMail(
          chapterLeader.name,
          "",
          "",
          subject,
          [recipientEmail],
          null,
          emailHTML
        );
        await ses.sendEmail(params).promise();
        console.log(`[ChapterLeader.verify] Verification email successfully sent to: ${recipientEmail}`);

      } catch (err) {
        console.error(`[ChapterLeader.verify] Failed to send email to ${recipientEmail}:`, err.message);
      }
    }
    catch (err) {
      console.error("Failed to send mail to chapter leader:", err.message);
    }
    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Chapter leader verified. ${newProgressEntries.length} quest(s) assigned.`,
    });
  } catch (err) {
    console.error("verifyChapterLeader error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getChapterLeaderProgresses = async (req, res) => {
  try {
    // Role guard
    if (req.user.role !== "chapter_leader") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const { entity } = req.query; // optional filter (formerly category)

    // Fetch the chapter leader record
    const leader = await ChapterLeader.findById(req.user.id);

    if (!leader) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Chapter leader not found",
      });
    }

    const progressList = leader.progress;

    if (progressList.length === 0) {
      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          orbits: [],
          totalIpEarned: leader.totalIpEarned,
          totalQuests: 0,
          completedQuests: 0,
        },
      });
    }

    // Fetch quest details from quest1 service
    const questIds = progressList.map((p) => p.questId.toString());
    const config = generateServiceToken();
    let quests = [];

    try {
      const response = await axios.post(
        `${QUEST_SERVICE_URL}/quest1/api/v1/getQuestsByIds`,
        { questIds },
        { ...config }
      );
      quests = response.data?.quests || [];
    } catch (questErr) {
      console.error("Failed to fetch quest details:", questErr);
      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        success: false,
        message: "Could not reach quest service.",
      });
    }

    // Build a progress map keyed by questId string
    const progressMap = {};
    progressList.forEach((p) => {
      progressMap[p.questId.toString()] = p;
    });

    // Apply optional entity (category) filter
    console.log(entity, quests.length)
    const filteredQuests = (entity && entity !== 'undefined')
      ? quests.filter((q) => q.entity.toLowerCase() === entity.toLowerCase())
      : quests;
    console.log(filteredQuests.length)
    // Group by orbit
    const orbitMap = {};

    filteredQuests.forEach((quest) => {
      const progress = progressMap[quest._id.toString()];
      if (!progress) return; // shouldn't happen but guard anyway

      const orbitKey = quest.orbit?.id ?? "unknown";

      if (!orbitMap[orbitKey]) {
        orbitMap[orbitKey] = {
          orbit: quest.orbit || { id: orbitKey },
          quests: [],
        };
      }

      orbitMap[orbitKey].quests.push({
        questId: quest._id,
        title: quest.title,
        description: quest.description,
        entity: quest.entity,
        metric: quest.metric,
        type: quest.type,
        logo: quest.logo,
        secondaryLogo: quest.secondaryLogo,
        ip: quest.ip,
        entityLimit: quest.entityLimit,
        target: quest.target,
        // progress data
        overallProgress: progress.overallProgress,
        value: progress.value,
        isCompleted: progress.isCompleted,
        isRewardClaimed: progress.isRewardClaimed,
        completedAt: progress.completedAt,
        rewardClaimedAt: progress.rewardClaimedAt,
        lastUpdatedAt: progress.lastUpdatedAt,
      });
    });

    // Sort orbits by orbit.id ascending
    const orbits = Object.values(orbitMap).sort(
      (a, b) => (a.orbit.id ?? 0) - (b.orbit.id ?? 0)
    );

    const completedQuests = progressList.filter((p) => p.isCompleted).length;

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        orbits,
        totalIpEarned: leader.totalIpEarned,
        totalQuests: filteredQuests.length,
        completedQuests,
      },
    });
  } catch (err) {
    console.error("getChapterLeaderProgresses error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Email is required",
      });
    }

    const leader = await ChapterLeader.findOne({ email });

    if (!leader) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Chapter leader not found",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");

    leader.passwordResetToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    leader.passwordResetTokenExpire = Date.now() + 10 * 60 * 1000;

    await leader.save();

    const resetUrl = `https://app.macbease.com/reset-password/${token}`;

    const content = `
      <p>You have received this email because a password reset request for your account was received.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block; margin-top:10px; margin-bottom:10px; padding:12px 22px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">
          Reset your password
        </a>
      </p>
      <p>If you did not request this, please ignore this email.</p>
    `;

    const subject = "Password Recovery";
    const destination = [leader.email];
    const name = leader.name || "User";
    const outro = "If you need any further assistance, we're always here to help. 💡";
    const emailHTML = generateProfessionalMail(name, content, outro);

    const { ses, params } = await sendMail(
      name,
      "",
      "",
      subject,
      destination,
      null,
      emailHTML
    );

    ses.sendEmail(params, async (err) => {
      if (err) {
        leader.passwordResetToken = undefined;
        leader.passwordResetTokenExpire = undefined;
        await leader.save();
        console.log(err)
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ success: false, message: "Email failed" });
      }

      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Password reset email sent",
      });
    });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { password, token } = req.body;

    if (!password) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "Password is required" });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const leader = await ChapterLeader.findOne({
      passwordResetToken: hashedToken,
      passwordResetTokenExpire: { $gt: Date.now() },
    });

    if (!leader) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "Invalid or expired token" });
    }

    const hashedPassword = await securePassword(password)
    leader.password = hashedPassword;
    leader.passwordResetToken = undefined;
    leader.passwordResetTokenExpire = undefined;

    await leader.save();

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (err) {
    console.log(err)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong" });
  }
};

const getChapterLeaderDetails = async (req, res) => {
  try {
    const leaderId = req.user.id;
    const leader = await ChapterLeader.findById(leaderId);
    if (!leader) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Chapter leader not found" });
    }
    return res.status(StatusCodes.OK).json({ success: true, leader });
  } catch (err) {
    console.error("getChapterLeaderDetails error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const claimQuestReward = async (req, res) => {
  try {
    const { questId } = req.body;
    const leaderId = req.user.id;

    if (!questId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "questId is required" });
    }

    const leader = await ChapterLeader.findById(leaderId);
    if (!leader) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Leader not found" });
    }

    const progressIndex = leader.progress.findIndex((p) => p.questId.toString() === questId);
    if (progressIndex === -1) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Quest progress not found for this leader",
      });
    }

    const progress = leader.progress[progressIndex];
    if (!progress.isCompleted) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Quest is not completed yet" });
    }
    if (progress.isRewardClaimed) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Reward already claimed" });
    }

    const config = generateServiceToken();
    let questDetails;
    try {
      const response = await axios.post(
        `${QUEST_SERVICE_URL}/quest1/api/v1/getQuestsByIds`,
        { questIds: [questId] },
        config
      );
      questDetails = response.data?.quests?.[0];
    } catch (err) {
      console.error("Fetch quest error:", err.message);
      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        success: false,
        message: "Quest service unavailable",
      });
    }

    if (!questDetails) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Quest details not found in quest service",
      });
    }

    progress.isRewardClaimed = true;
    progress.rewardClaimedAt = new Date();

    const rewardAmount = questDetails.ip || 0;
    leader.totalIpEarned = (leader.totalIpEarned || 0) + rewardAmount;

    leader.markModified("progress");
    await leader.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Reward claimed successfully",
      rewardAmount,
      totalIpEarned: leader.totalIpEarned,
    });
  } catch (err) {
    console.error("claimQuestReward error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const addAddress = async (req, res) => {
  try {
    const { address } = req.body;

    if (!address?.addressLine1 || !address?.city || !address?.state || !address?.zip) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Address (addressLine1, city, state, zip) is required"
      });
    }

    const leaderId = req.user.id;
    const leader = await ChapterLeader.findById(leaderId);

    if (!leader) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Leader not found"
      });
    }
    console.log(address)
    const normalize = (str) => str?.trim().toLowerCase();

    const isSameAddress = leader.addresses.some((addr) => {
      return (
        normalize(addr.addressLine1) === normalize(address.addressLine1) &&
        normalize(addr.city) === normalize(address.city) &&
        normalize(addr.state) === normalize(address.state) &&
        normalize(addr.zip) === normalize(address.zip)
      );
    });

    if (isSameAddress) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Same address already exists",
      });
    }

    leader.addresses.push(address);
    await leader.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Address added successfully",
      address: leader.addresses
    });

  } catch (err) {
    console.error("addAddress error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

const updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const { address } = req.body;
    const leaderId = req.user.id;

    const leader = await ChapterLeader.findById(leaderId);
    if (!leader) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Leader not found" });
    }

    const addressToUpdate = leader.addresses.id(addressId);
    if (!addressToUpdate) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Address not found" });
    }

    // Update fields
    if (address.name) addressToUpdate.name = address.name;
    if (address.phone) addressToUpdate.phone = address.phone;
    if (address.addressLine1) addressToUpdate.addressLine1 = address.addressLine1;
    if (address.addressLine2) addressToUpdate.addressLine2 = address.addressLine2;
    if (address.city) addressToUpdate.city = address.city;
    if (address.state) addressToUpdate.state = address.state;
    if (address.zip) addressToUpdate.zip = address.zip;
    if (address.country) addressToUpdate.country = address.country;

    await leader.save();
    return res.status(StatusCodes.OK).json({ success: true, message: "Address updated successfully", address: addressToUpdate });
  } catch (err) {
    console.error("updateAddress error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Something went wrong" });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const leaderId = req.user.id;

    const leader = await ChapterLeader.findById(leaderId);
    if (!leader) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Leader not found" });
    }

    leader.addresses = leader.addresses.filter(
      (addr) => addr._id.toString() !== addressId
    );

    await leader.save();

    return res.status(StatusCodes.OK).json({ success: true, message: "Address deleted successfully" });
  } catch (err) {
    console.error("deleteAddress error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Something went wrong" });
  }
};

const getAllAddresses = async (req, res) => {
  try {
    console.log(req.user)
    const leaderId = req.user.id;
    const leader = await ChapterLeader.findById(leaderId);

    if (!leader) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Leader not found",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      addresses: leader.addresses || [],
    });
  } catch (err) {
    console.error("getAllAddresses error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const sendMailForApply = async (req, res) => {
  try {
    const { mailIds } = req.body;

    const subject = "It's Live! Your Macbase Chapter Leader Journey Starts Now";

    const emailContent = `
      <p>Great news!</p>
      <p>You recently showed interest in the <strong>Macbase Chapter Leader Program</strong>—and we're excited to tell you that the program is now officially <strong>LIVE!</strong></p>
      <p>This is your chance to step up as a leader, build an amazing community, host impactful events, and represent Macbase in your region. We truly believe you have the potential to make a difference, and we’d love to see you take this forward.</p>
      <p>You can now register and begin your journey.<a href="https://admin.macbease.com/apply" style="color: #0066cc; text-decoration: none; font-weight: bold;"> Click here to begin </a></p>
      <p style="color: #666666; font-size: 15px;">Don't miss this opportunity to be part of something exciting and meaningful. If you have any questions, feel free to reach out—we're here to help.</p>
    `;

    const outro = "Looking forward to seeing you as a Macbase Chapter Leader 🚀";
    const leaders = await ChapterLeader.find({
      email: { $nin: mailIds }
    });

    const finalMails = mailIds.filter((mailId) => {
      return !leaders.some((leader) => leader.email === mailId);
    });

    for (const mailId of finalMails) {
      const name = mailId.split("@")[0];
      const cleanName = name.replace(/\d+$/, "");
      const capitalizedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      const emailHTML = generateProfessionalMail(capitalizedName, emailContent, outro);

      const { ses: ses1, params: params1 } = await sendMail(
        capitalizedName,
        "",
        "",
        subject,
        [mailId],
        null,
        emailHTML
      );

      ses1.sendEmail(params1, (err) => {
        if (err) console.error("[ChapterLeader.sendMailForApply] SES sendEmail error:", err);
        else console.log(`[ChapterLeader.sendMailForApply] Welcome email sent to ${mailId}`);
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Mails sent successfully",
    });

  } catch (err) {
    console.error("sendMailForApply error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const getUnapprovedLeaders = async (req, res) => {
  try {
    // Admin guard
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const leaders = await ChapterLeader.find({
      isVerified: false
    },
      {
        name: 1,
        email: 1,
        phone: 1,
        college: 1,
        socialLink: 1
      })
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Fetched Unapproved chapter leaders successfully",
      leaders
    })
  } catch (err) {
    console.error("getUnapprovedLeaders error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while fetching unapproved leaders",
    })
  }
}

module.exports = {
  register,
  login,
  regenerateAccessToken,
  verifyChapterLeader,
  getChapterLeaderProgresses,
  getChapterLeaderDetails,
  claimQuestReward,
  forgotPassword,
  resetPassword,
  addAddress,
  updateAddress,
  deleteAddress,
  getAllAddresses,
  sendMailForApply,
  getUnapprovedLeaders
};

