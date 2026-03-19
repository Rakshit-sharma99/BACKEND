const axios = require("axios");
const jwt = require("jsonwebtoken");
const ChapterLeader = require("../models/chapterLeader");
const bcrypt = require("bcryptjs");
const { StatusCodes } = require("http-status-codes");
const { sendMail } = require("../controllers/utils");

const generateServiceToken = () => {
  const token = jwt.sign(
    { service: "universe", role: "internal" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" }
  );
  return { headers: { authorization: `Bearer ${token}` } };
};

const register = async (req, res) => {
  try {
    const { name, email, password, universeMetaData } = req.body;

    if (!name || !email || !password) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "All fields required (name, email, password)",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await ChapterLeader.findOne({
      $or: [{ email: normalizedEmail }],
    });

    if (existing) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "A chapter leader with this email or universe already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await ChapterLeader.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      ...(universeMetaData && { universeMetaData }),
    });

    // Non-blocking admin notification email
    try {
      const { ses, params } = await sendMail(
        "Admin",
        `A new Chapter Leader has joined 🚀`,
        `Check Admin dashboard for more details.`,
        "New Chapter Leader Registered",
        "manmithgopari7@mail.com",
        null,
        `
        <h2>New Chapter Leader Registration</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${normalizedEmail}</p>
        <p><strong>UID:</strong> ${uid}</p>
        ${universeMetaData
          ? `<p><strong>University:</strong> ${universeMetaData?.name || "N/A"}</p>`
          : ""}
        `
      );
      await ses.sendEmail(params).promise();
    } catch (mailErr) {
      console.error("Mail failed:", mailErr.message);
    }

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Registration successful. Your account is pending verification.",
      data: {
        id:   user._id,
        name: user.name,
        email: user.email,
        uid:  user.uid,
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
        id:              user._id,
        name:            user.name,
        email:           user.email,
        uid:             user.uid,
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
    // if (req.user.role === "admin") {
    //   return res.status(StatusCodes.FORBIDDEN).json({
    //     success: false,
    //     message: "Unauthorized: admin access required",
    //   });
    // }

    const { chapterLeaderId } = req.body;

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
        `${process.env.QUEST_SERVICE_URL}/quest/api/v1/getAllQuests`,
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
        const n = quest.numOfEntities || 1;

        return {
          questId: quest._id,
          overallProgress: 0,
          // one entry per entity
          current: Array.from({ length: n }, () => ({
            value:       0,
            isStarted:   false,
            isCompleted: false,
          })),
          // repeat the single target value n times (one per entity)
          target: Array.from({ length: n }, () => quest.target),
          isCompleted:     false,
          completedAt:     null,
          isRewardClaimed: false,
          rewardClaimedAt: null,
          lastUpdatedAt:   new Date(),
        };
      });

    chapterLeader.progress.push(...newProgressEntries);
    chapterLeader.isVerified  = true;
    chapterLeader.approvedBy  = "691c24284045605396274042";

    await chapterLeader.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Chapter leader verified. ${newProgressEntries.length} quest(s) assigned.`,
    });
  } catch (err) {
    console.error("verifyChapterLeader error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getQuestsProgress = async (req, res) => {
  try {
    // Role guard
    // if (req.user.role !== "chapter_leader") {
    //   return res.status(StatusCodes.FORBIDDEN).json({
    //     success: false,
    //     message: "Unauthorized access",
    //   });
    // }
    console.log(req.query)
    const { category } = req.query; // optional filter

    // Fetch the chapter leader record
    const leader = await ChapterLeader.findById("69bb014b9dd9942d6f650f13");

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
          orbits:          [],
          totalIpEarned:   leader.totalIpEarned,
          totalQuests:     0,
          completedQuests: 0,
        },
      });
    }

    // Fetch quest details from quest1 service
    const questIds = progressList.map((p) => p.questId.toString()).join(",");
    const config   = generateServiceToken();
    let quests     = [];

    try {
      console.log(process.env.QUEST_SERVICE_URL)
      const response = await axios.get(
        `${process.env.QUEST_SERVICE_URL}/quest/api/v1/getQuestsByIds`,
        { params: { questIds }, timeout: 5000, ...config }
      );
      console.log(response.data)
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

    // Apply optional category filter
    console.log(category, quests.length)
    const filteredQuests = category !== 'undefined'
      ? quests.filter((q) => q.category.toLowerCase() === category.toLowerCase())
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
          orbit:  quest.orbit || { id: orbitKey },
          quests: [],
        };
      }

      orbitMap[orbitKey].quests.push({
        questId:         quest._id,
        title:           quest.title,
        description:     quest.description,
        category:        quest.category,
        metric:          quest.metric,
        type:            quest.type,
        logo:            quest.logo,
        secondaryLogo:   quest.secondaryLogo,
        ip:              quest.ip,
        numOfEntities:   quest.numOfEntities,
        // progress data
        overallProgress: progress.overallProgress,
        current:         progress.current,
        target:          progress.target,
        isCompleted:     progress.isCompleted,
        isRewardClaimed: progress.isRewardClaimed,
        completedAt:     progress.completedAt,
        rewardClaimedAt: progress.rewardClaimedAt,
        lastUpdatedAt:   progress.lastUpdatedAt,
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
        totalIpEarned:   leader.totalIpEarned,
        totalQuests:     filteredQuests.length,
        completedQuests,
      },
    });
  } catch (err) {
    console.error("getQuestsProgress error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  register,
  login,
  regenerateAccessToken,
  verifyChapterLeader,
  getQuestsProgress,
};